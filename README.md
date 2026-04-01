# Bootcamp 1.0 - Context 1

This repository contains three independent problem-solving projects, each implementing a complete in-memory REST API with business logic, validation, and state management using Node.js and Express.

---

## 📦 Pipeline - Deployment Orchestration Engine

### Jargon
- **Deployment Pipeline**: Automated sequence for shipping code across multiple environments
- **Promotion Chain**: Ordered progression of environments (DEV → STAGE → PROD)
- **State Machine**: System with defined states and transitions (PENDING → DEPLOYING → LIVE)
- **Idempotency**: Operation produces same result regardless of repetition
- **Backoff Strategy**: Exponential delay between retry attempts to prevent system overload

### Simple Explanation
A service that manages how applications move through different environments. It tracks deployments, allows retries when they fail, prevents skipping environments, and maintains a complete history of what happened and when.

### 5 Key Points

1. **Environment Promotion Rules** - Enforces strict ordering: you can only deploy to the next environment if the same version is already live in the previous one, preventing untested code from reaching production.

2. **In-Memory Storage** - All data (services, deployments, events) lives in JavaScript objects and maps; no database needed, making it lightweight and fast for testing and demo scenarios.

3. **State Tracking & History** - Every deployment event (created, claimed, deployed, failed, superseded, rolled back) is logged with timestamps and attempt counts, creating a complete audit trail.

4. **Retry Logic with Backoff** - Failed deployments automatically retry up to a configurable `maxAttempts` with exponential backoff, giving systems time to recover from transient failures.

5. **Rollback Support** - Allows reverting a live deployment to the most recent superseded version in the same environment, enabling quick recovery if issues are discovered.

---

## 🔍 RAG - Retrieval-Augmented Generation Document Engine

### Jargon
- **RAG (Retrieval-Augmented Generation)**: Searching through documents then using results to generate responses
- **Tokenization**: Breaking text into individual words/terms for analysis
- **Semantic Ranking**: Scoring documents by relevance to a query
- **Tag Filtering**: Categorizing and restricting searches by labels
- **Snippet Extraction**: Pulling relevant excerpts from matching documents

### Simple Explanation
A search engine for documents that ranks results by relevance using a scoring system based on keyword matches in titles and content. You can store documents, search them with optional category filters, and maintain a complete version history of changes.

### 5 Key Points

1. **Token-Based Relevance Scoring** - Matches queries to documents by breaking both into lowercase alphanumeric tokens, then scores based on how many query tokens appear in the document title (higher weight) vs. content (lower weight).

2. **Full-Text Search with Tag Filters** - Supports searching all documents or filtering by specific tags; queries are tokenized to handle multiple words, with zero-token queries rejected as invalid.

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
