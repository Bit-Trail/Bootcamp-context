### Problem statement (in simple words)
- **Goal**: Build an in-memory REST API for a Solana-style auction house.
- **What it must do**:
  - Track wallets, deposits, balances, and escrow.
  - Create time-based auctions with start/end times and rules.
  - Allow bids with strict rules (min increment, enough balance, not seller).
  - Support settlement, cancellation, and listing/reading auctions and bids.

### Core logic we add
- **Wallet logic**:
  - Store `balance`, `escrowed`, and compute `available = balance - escrowed`.
  - When user deposits: increase `balance`.
  - When user is highest bidder: lock their bid amount as `escrowed`.
- **Auction logic**:
  - Store `startAt`, `endAt`, `startingPrice`, `minIncrement`, bids list.
  - Compute `status` from current time (`UPCOMING`, `ACTIVE`, `ENDED`, `SETTLED`, `CANCELLED`).
  - Compute `currentPrice`, `highestBidder`, `bidCount` from bids at/before `now`.
- **Bidding logic**:
  - Only allow when status is `ACTIVE`.
  - First bid: `amount >= startingPrice`.
  - Next bids: `amount >= currentPrice + minIncrement`.
  - Check bidder `available` balance (release own previous escrow first if raising).
  - Move escrow from old highest bidder to new highest bidder.
- **Settlement logic**:
  - Only when status is `ENDED`.
  - If there is a winner: release their escrow, subtract from winner balance, add to seller balance.
  - Mark auction as `SETTLED`.
- **Cancellation logic**:
  - Only when status is `UPCOMING`.
  - Mark auction as `CANCELLED`.

### High-level approach
1. **Define in-memory models** (no DB):
   - `wallets` map and `auctions` map in `src/store.js`.
2. **Write pure helper functions**:
   - For wallets: deposit, escrow lock/unlock, snapshot balances.
   - For auctions: create auction, compute status, compute snapshot.
3. **Build Express routes** in `src/app.js`:
   - One route per required endpoint (`/api/wallets/...`, `/api/auctions/...`).
   - Validate inputs (types, positive integers, ISO timestamps).
   - Call store helpers and return JSON responses with computed fields.
4. **Add strict time parsing**:
   - In `src/utils/time.js` ensure all `startAt`, `endAt`, `now` are full ISO with timezone.
5. **Wire server**:
   - In `src/server.js`, create app and listen on a port.

### What is required / what we use
- **Runtime**: Node.js.
- **Web framework**: `express` for HTTP routing and JSON parsing.
- **Data structures** (JavaScript):
  - `Map` for in-memory storage of wallets and auctions.
  - Plain objects for wallet/auction/bid records.
- **Time handling**:
  - JavaScript `Date` objects.
  - Custom regex-based ISO datetime validation (must include time + timezone).
- **ID generation**:
  - `crypto.randomUUID()` for auction IDs.

### Main concepts used
- **REST API design**:
  - Clear HTTP methods (GET, POST) and paths.
  - Proper status codes (`200`, `201`, `400`, `404`).
- **In-memory state management**:
  - Treat `store.js` as our mini database (maps + helper functions).
- **Business rules encoding**:
  - Status transitions based on time.
  - Escrow accounting rules on bid/settle/cancel.
- **Pure vs side-effect code**:
  - Pure functions to compute status/snapshots.
  - Route handlers to mutate in-memory state and send responses.

### File-by-file quick summary
- **`package.json`**: Node project config, dependencies, and `npm start` script.
- **`src/server.js`**: Starts the HTTP server using `createApp()`.
- **`src/app.js`**: All Express routes, validation, and error handling for the API.
- **`src/store.js`**: In-memory wallet/auction storage and core auction/wallet logic.
- **`src/utils/time.js`**: Helpers to validate and parse ISO datetimes with timezone.

