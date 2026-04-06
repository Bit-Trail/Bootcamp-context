import express, { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';

const app = express();
app.use(express.json());

// In-memory registry
interface Registration {
    id: number;
    name: string;
    parentName: string | null;
    parentPda: string | null;
    programId: string;
    pda: string;
    owner: string;
    bump: number;
    createdAt: string;
}

let registry: Registration[] = [];
let nextId = 1;

// --- 1. POST /api/registry/register (Top-Level) ---
app.post('/api/registry/register', (req: Request, res: Response) => {
    const { name, programId, owner } = req.body;

    if (!name || !programId || !owner) {
        return res.status(400).json({ error: "Missing fields" });
    }

    try {
        const progId = new PublicKey(programId as string);
        new PublicKey(owner as string); // Validate owner address

        // Check if name already exists for this program
        if (registry.find(r => r.name === name && r.programId === programId)) {
            return res.status(409).json({ error: "Name already registered" });
        }

        // DERIVE TOP-LEVEL PDA: [Buffer("name"), Buffer(name)]
        const [pda, bump] = PublicKey.findProgramAddressSync(
            [Buffer.from("name"), Buffer.from(name as string)],
            progId
        );

        const entry: Registration = {
            id: nextId++,
            name,
            parentName: null,
            parentPda: null,
            programId,
            pda: pda.toBase58(),
            owner,
            bump,
            createdAt: new Date().toISOString()
        };

        registry.push(entry);
        return res.status(201).json(entry);
    } catch (e) {
        return res.status(400).json({ error: "Invalid public keys" });
    }
});

// --- 2. POST /api/registry/sub/register (Hierarchical) ---
app.post('/api/registry/sub/register', (req: Request, res: Response) => {
    const { parentName, subName, programId, owner } = req.body;

    if (!parentName || !subName || !programId || !owner) {
        return res.status(400).json({ error: "Missing fields" });
    }

    // 1. Find the parent in our registry
    const parent = registry.find(r => 
        r.name === parentName && 
        r.programId === programId && 
        r.parentPda === null
    );

    if (!parent) {
        return res.status(404).json({ error: "Parent name not found" });
    }

    // 2. Check if this specific sub-name already exists under this parent
    if (registry.find(r => r.name === subName && r.parentPda === parent.pda)) {
        return res.status(409).json({ error: "Sub-name already exists under this parent" });
    }

    try {
        const progIdKey = new PublicKey(programId as string);
        
        // 3. DERIVE SUB-NAME PDA: [Buffer("sub"), parentPda.toBuffer(), Buffer(subName)]
        const [pda, bump] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("sub"),
                new PublicKey(parent.pda).toBuffer(),
                Buffer.from(subName as string)
            ],
            progIdKey
        );

        const entry: Registration = {
            id: nextId++,
            name: subName,
            parentName,
            parentPda: parent.pda,
            programId,
            pda: pda.toBase58(),
            owner,
            bump,
            createdAt: new Date().toISOString()
        };

        registry.push(entry);
        return res.status(201).json(entry);
    } catch (e) {
        return res.status(400).json({ error: "Invalid inputs" });
    }
});

// --- 3. POST /api/registry/transfer ---
app.post('/api/registry/transfer', (req: Request, res: Response) => {
    const { programId, name, newOwner, signature, message } = req.body;

    // 1. Find the entry (can be parent or sub-name)
    const entry = registry.find(r => r.programId === programId && r.name === name);
    if (!entry) return res.status(404).json({ error: "Name not found in registry" });

    // 2. Security Check: The message MUST follow the contest format
    const expectedMessage = `transfer:${name}:to:${newOwner}`;
    if (message !== expectedMessage) {
        return res.status(400).json({ error: `Message must be: ${expectedMessage}` });
    }

    try {
        // 3. Crypto Verification
        const isValid = nacl.sign.detached.verify(
            Buffer.from(message, 'utf-8'),
            bs58.decode(signature),
            bs58.decode(entry.owner) // Must be signed by the CURRENT owner
        );

        if (!isValid) return res.status(403).json({ error: "Signature verification failed" });

        // 4. Perform the transfer
        entry.owner = newOwner;
        return res.json({
            message: "Transfer successful",
            updatedEntry: entry
        });
    } catch (e) {
        return res.status(400).json({ error: "Invalid signature or address format" });
    }
});

// --- 4. GET /api/registry/resolve/:programId/:name ---
app.get('/api/registry/resolve/:programId/:name', (req: Request, res: Response) => {
    const { programId, name } = req.params;
    const entry = registry.find(r => r.programId === programId && r.name === name);
    
    if (!entry) return res.status(404).json({ error: "Name not found" });
    return res.json(entry);
});

// --- 5. GET /api/registry/list/:programId ---
app.get('/api/registry/list/:programId', (req: Request, res: Response) => {
    const { programId } = req.params;
    const { owner } = req.query;

    // Filter by program and optionally by owner
    let results = registry.filter(r => r.programId === programId);
    if (owner) {
        results = results.filter(r => r.owner === owner as string);
    }

    return res.json(results);
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Problem 2 running on port ${PORT}`));