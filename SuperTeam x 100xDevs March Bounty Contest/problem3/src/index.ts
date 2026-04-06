import express, { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';

const app = express();
app.use(express.json());

interface Vault {
    id: string; // The PDA string
    owners: string[];
    threshold: number;
}

interface Proposal {
    id: number;
    vaultId: string;
    to: string;
    amount: number;
    status: 'pending' | 'executed';
    approvals: string[]; // List of unique owners who signed
}

let vaults: Vault[] = [];
let proposals: Proposal[] = [];
let nextProposalId = 1;

// --- 1. CREATE VAULT ---
app.post('/api/vault/create', (req: Request, res: Response) => {
    const { owners, threshold, programId } = req.body;

    if (!owners || !threshold || owners.length < threshold) {
        return res.status(400).json({ error: "Invalid owners or threshold" });
    }

    try {
        const progId = new PublicKey(programId as string);
        // Sort owners to ensure the PDA is always the same for the same set of owners
        const sortedOwners = [...owners].sort();
        const seeds = [
            Buffer.from("vault"),
            ...sortedOwners.map(o => new PublicKey(o).toBuffer())
        ];
        
        const [pda] = PublicKey.findProgramAddressSync(seeds, progId);

        const newVault: Vault = {
            id: pda.toBase58(),
            owners: sortedOwners,
            threshold
        };

        vaults.push(newVault);
        res.status(201).json(newVault);
    } catch (e) {
        res.status(400).json({ error: "Invalid public keys" });
    }
});

// --- 2. PROPOSE TRANSACTION ---
app.post('/api/vault/:vaultId/propose', (req: Request, res: Response) => {
    const { to, amount, proposer } = req.body;
    const vault = vaults.find(v => v.id === req.params.vaultId);

    if (!vault) return res.status(404).json({ error: "Vault not found" });
    if (!vault.owners.includes(proposer)) return res.status(403).json({ error: "Only owners can propose" });

    const proposal: Proposal = {
        id: nextProposalId++,
        vaultId: vault.id,
        to,
        amount,
        status: 'pending',
        approvals: [proposer] // Proposer automatically approves
    };

    proposals.push(proposal);
    res.status(201).json(proposal);
});

// --- 3. POST /api/vault/:vaultId/approve/:proposalId ---
app.post('/api/vault/:vaultId/approve/:proposalId', (req: Request, res: Response) => {
    const vaultId = req.params.vaultId as string;
    const proposalId = parseInt(req.params.proposalId as string);
    const { owner, signature, message } = req.body;

    const vault = vaults.find(v => v.id === vaultId);
    const proposal = proposals.find(p => p.id === proposalId && p.vaultId === vaultId);

    // 1. Validation Checks
    if (!vault || !proposal) return res.status(404).json({ error: "Vault or Proposal not found" });
    if (!vault.owners.includes(owner)) return res.status(403).json({ error: "Address is not an owner" });
    if (proposal.approvals.includes(owner)) return res.status(400).json({ error: "Owner has already approved" });
    if (proposal.status === 'executed') return res.status(400).json({ error: "Already executed" });

    try {
        // 2. Format Requirement: "approve:<id>"
        const expectedMessage = `approve:${proposalId}`;
        if (message !== expectedMessage) {
            return res.status(400).json({ error: `Message must be: ${expectedMessage}` });
        }

        // 3. Signature Verification
        const isValid = nacl.sign.detached.verify(
            Buffer.from(message, 'utf-8'),
            bs58.decode(signature),
            bs58.decode(owner)
        );

        if (!isValid) return res.status(403).json({ error: "Invalid signature" });

        // 4. Update State
        proposal.approvals.push(owner);

        // 5. Execution Check
        if (proposal.approvals.length >= vault.threshold) {
            proposal.status = 'executed';
        }

        return res.json(proposal);
    } catch (e) {
        return res.status(400).json({ error: "Verification failed" });
    }
});
// --- 4. GET Helpers ---
app.get('/api/vault/:vaultId/proposals', (req: Request, res: Response) => {
    const results = proposals.filter(p => p.vaultId === req.params.vaultId);
    res.json(results);
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Problem 3 (Multi-Sig) Live on Port ${PORT}`));