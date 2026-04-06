import express, { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';

const app = express();
app.use(express.json());

// Requirements Constants
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// In-memory data store
interface Contact {
    id: number;
    name: string;
    address: string;
    type: 'wallet' | 'pda';
    createdAt: string;
}

let contacts: Contact[] = [];
let nextId = 1;

// --- CONTACTS CRUD ---

// 1. POST /api/contacts - Add a contact
app.post('/api/contacts', (req: Request, res: Response) => {
    const { name, address } = req.body;

    if (!name || !address) {
        return res.status(400).json({ error: "Missing name or address" });
    }

    try {
        
        if (contacts.find(c => c.address === address)) {
            return res.status(409).json({ error: "Address already exists" });
        }

        // Create the pubkey object
        const pubkey = new PublicKey(address as string);
        const type = PublicKey.isOnCurve(pubkey.toBuffer()) ? "wallet" : "pda";

        const newContact: Contact = {
            id: nextId++,
            name,
            address,
            type,
            createdAt: new Date().toISOString()
        };

        contacts.push(newContact);
        return res.status(201).json(newContact);
    } catch (e) {
        return res.status(400).json({ error: "Invalid Solana address" });
    }
});

// 2. GET /api/contacts - List all
app.get('/api/contacts', (req: Request, res: Response) => {
    const type = req.query.type as string;
    let filtered = contacts;

    if (type === 'wallet' || type === 'pda') {
        filtered = contacts.filter(c => c.type === type);
    }

    return res.status(200).json(filtered.sort((a, b) => a.id - b.id));
});

// 3. GET /api/contacts/:id - Get by ID
app.get('/api/contacts/:id', (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const contact = contacts.find(c => c.id === id);
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    return res.status(200).json(contact);
});

// 4. PUT /api/contacts/:id - Update name
app.put('/api/contacts/:id', (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing name" });

    const id = parseInt(req.params.id as string);
    const contact = contacts.find(c => c.id === id);
    if (!contact) return res.status(404).json({ error: "Not found" });

    contact.name = name;
    return res.status(200).json(contact);
});

// 5. DELETE /api/contacts/:id - Delete
app.delete('/api/contacts/:id', (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const index = contacts.findIndex(c => c.id === id);
    if (index === -1) return res.status(404).json({ error: "Not found" });

    contacts.splice(index, 1);
    return res.status(200).json({ message: "Contact deleted" });
});

// --- ATA DERIVATION ---

// POST /api/contacts/:id/derive-ata
app.post('/api/contacts/:id/derive-ata', (req: Request, res: Response) => {
    const { mintAddress } = req.body;
    const id = parseInt(req.params.id as string);
    
    const contact = contacts.find(c => c.id === id);
    if (!contact) return res.status(404).json({ error: "Contact not found" });

    try {
        const ownerPubkey = new PublicKey(contact.address);
        const mintPubkey = new PublicKey(mintAddress as string);

        const [ata] = PublicKey.findProgramAddressSync(
            [ownerPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        return res.status(200).json({
            ata: ata.toBase58(),
            owner: contact.address,
            mint: mintAddress
        });
    } catch (e) {
        return res.status(400).json({ error: "Invalid mint address" });
    }
});

// --- SIGNATURE VERIFICATION ---

// POST /api/verify-ownership
app.post('/api/verify-ownership', (req: Request, res: Response) => {
    const { address, message, signature } = req.body;

    if (!address || !message || !signature) {
        return res.status(400).json({ error: "Missing fields" });
    }

    try {
        const pubkeyBytes = bs58.decode(address as string);
        const signatureBytes = bs58.decode(signature as string);
        const messageBytes = Buffer.from(message as string, 'utf-8');

        const valid = nacl.sign.detached.verify(
            messageBytes,
            signatureBytes,
            pubkeyBytes
        );

        return res.status(200).json({ valid });
    } catch (e) {
        return res.status(400).json({ error: "Invalid inputs" });
    }
});

// --- PDA DERIVATION ---

// POST /api/derive-pda
app.post('/api/derive-pda', (req: Request, res: Response) => {
    const { programId, seeds } = req.body;

    if (!programId || !seeds || !Array.isArray(seeds)) {
        return res.status(400).json({ error: "Invalid programId or seeds" });
    }

    try {
        const progId = new PublicKey(programId as string);
        
        // Convert string seeds to Buffers and validate size
        const seedBuffers = seeds.map(seed => {
            const buf = Buffer.from(seed as string, 'utf-8');
            if (buf.length > 32) throw new Error("Seed exceeds 32 bytes");
            return buf;
        });

        const [pda, bump] = PublicKey.findProgramAddressSync(seedBuffers, progId);

        return res.status(200).json({
            pda: pda.toBase58(),
            bump: bump
        });
    } catch (e: any) {
        return res.status(400).json({ error: e.message || "Invalid inputs" });
    }
});

// --- START ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Problem 1 running at http://localhost:${PORT}`);
});