# Bootcamp 1.0 - Context 1

Bootcamp project repository containing three independent problem-solving implementations with REST APIs, in-memory state management, and business logic validation.

---

## 📦 Projects

### Super 30 Scholarship Examination
Contains three services: **Pipeline** (deployment orchestration with state machine), **RAG** (token-based full-text search with semantic ranking), **Solana** (blockchain auction/bidding system).

### SuperTeam x 100xDevs March Bounty Contest
Three problem statements combining Web3 solutions: problem1/2/3 implement Solana program interactions, wallet integrations, and on-chain transaction handling.

---

## 🎯 Problem Statements

**Super 30**: Design scalable backend systems (deployment pipelines, document search engines, blockchain auctions) with REST APIs, in-memory state, and transactional integrity.

**SuperTeam/100xDevs**: Implement Web3 dApps using Solana blockchain, managing wallets, transactions, and smart contract interactions with RPC communication.

3. **Snippet Generation** - Automatically extracts a relevant 160-character preview from the document that contains at least one query token, helping users see context before opening the full document.

4. **Complete Document History** - Tracks every version of each document with timestamps and change details; users can retrieve the full history of edits through a dedicated endpoint.

5. **CRUD Operations** - Provides create, read, update, and delete capabilities for documents with required title and content fields; all data stored in memory with unique IDs for each document.

---

## 🏆 Solana - Auction House Platform

### Jargon
- **Escrow**: Money held in reserve pending transaction completion
- **Auction House**: Marketplace where items are sold to highest bidders in time-based events
- **Wallet Balance**: Available funds minus locked/escrowed amounts
- **Bid Increment**: Minimum price increase required for successive bids
- **Settlement**: Final transaction where winner pays and seller receives funds

### Simple Explanation
An auction platform where users deposit money, create time-bound auctions for items, and place bids that must meet minimum requirements. The system locks funds for active bids, validates rules, and handles payment settlement when auctions end.

### 5 Key Points

1. **Wallet & Escrow System** - Users maintain balances with three states: total balance, escrowed (locked in active bids), and available (free to bid); moving from one bid to another automatically releases old escrow and locks new amounts.

2. **Time-Based Auction Status** - Auctions transition through states (UPCOMING → ACTIVE → ENDED → SETTLED/CANCELLED) based on current time; status is computed dynamically, not stored, ensuring accurate state without manual updates.

3. **Strict Bidding Rules** - First bid must meet the starting price; subsequent bids must exceed current price plus minimum increment; bidders can't bid on their own auctions; bidder must have sufficient available balance after escrow calculations.

4. **Bid Tracking & Current Price** - System maintains an ordered list of all bids with timestamps; current price and highest bidder are computed from bids placed before the current time, enabling accurate real-time auction state.

5. **Settlement & Cancellation Logic** - Only ended auctions can settle (paying winner and crediting seller); only upcoming auctions can be cancelled; settlement releases winner escrow and transfers funds between participants atomically.

---

## 🛠️ Tech Stack (All Projects)

- **Runtime**: Node.js
- **Framework**: Express.js
- **Storage**: In-memory JavaScript objects and Maps
- **ID Generation**: `crypto.randomUUID()`
- **Timestamps**: ISO 8601 format with timezone
- **Port**: 3000 (configurable)

## 🚀 Getting Started

Each folder contains a complete, independent project:

```bash
# Pipeline
cd pipeline && npm install && npm start

# RAG
cd RAG && npm install && npm start

# Solana
cd solana && npm install && npm start
```

Each project exposes a REST API on `http://localhost:3000` with a `/api/health` endpoint for verification.
