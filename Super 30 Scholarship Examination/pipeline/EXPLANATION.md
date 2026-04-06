# Deployment Pipeline API – Explanation & Usage

This file explains the problem in my own words, how I approached the implementation, and how to call each endpoint for testing.

---

## Problem Statement (in my own words)

I needed to build an **in-memory deployment pipeline API**. It should:

- Let me **register services** with:
  - a name and repository,
  - an ordered list of environments (e.g. `DEV → STAGE → PROD`) that defines the **promotion chain**,
  - retry configuration: `maxAttempts` and `backoffSeconds`.
- Let me **create deployments** for a specific service/environment/commit, with rules:
  - The environment must be part of the service’s environment chain.
  - If I deploy to any environment after the first (e.g. `STAGE`), there must already be a `LIVE` deployment of the **same commit** in the **previous environment** (e.g. `DEV`).
  - Creating the same `(serviceId, environment, commitHash)` again should be **idempotent** and return the existing deployment.
- Allow **workers** to:
  - **claim** due deployments (based on scheduled time and FIFO ordering),
  - **mark them as completed** (making them `LIVE`),
  - **mark them as failed**, with retry logic and backoff.
- Support **rollbacks**:
  - From a `LIVE` deployment to the most recent `SUPERSEDED` deployment in the same `(serviceId, environment)`.
- Maintain **history** per deployment:
  - Log events like `CREATED`, `CLAIMED`, `DEPLOYED`, `FAILED`, `DEAD`, `SUPERSEDED`, `ROLLED_BACK`, `REVIVED`, each with time and attempt.
- Everything must be **in-memory only** (no DB), and all timestamps returned to clients must be **ISO datetime strings**.

In short: a small orchestration API that models deployments as a state machine with promotion, retries/backoff, rollbacks, and history, all in memory.

---

## High-Level Design

### Tech & Structure

- **Runtime / Framework**: Node.js + Express.
- **Entry point**: `src/server.js`.
- **Storage**: A simple `InMemoryStore` class that:
  - Tracks services and deployments in JS objects/arrays.
  - Keeps index maps for fast lookups (by id and by `(serviceId, environment, commitHash)` for idempotency).
- **Timestamps**:
  - Internally stored as milliseconds (`...Ms` fields).
  - Converted to ISO strings only in the response layer.

### Data Models (Conceptually)

- **Service**
  - `id`: unique string.
  - `name`: non-empty string.
  - `repository`: non-empty string.
  - `environments`: ordered array of unique environment names (defines promotion chain).
  - `maxAttempts`: positive integer.
  - `backoffSeconds`: positive integer.

- **Deployment**
  - `id`: unique string.
  - `serviceId`: references a Service.
  - `environment`: one of the service’s environments.
  - `commitHash`: non-empty string.
  - `status`: one of `PENDING | DEPLOYING | LIVE | SUPERSEDED | DEAD | ROLLED_BACK`.
  - `attempts`: number of times it has been claimed.
  - `createdAt`, `claimedAt`, `completedAt`, `nextAttemptAt`: timestamps (ISO in responses).
  - `lastError`: last failure message (if any).
  - `history`: array of `{ type, at, attempt }`.

### Important Helpers

- **ID generation**: Uses `crypto.randomUUID()` (or random bytes) for unique ids.
- **Validation utilities**:
  - Non-empty strings.
  - Positive integers for `maxAttempts` and `backoffSeconds`.
- **`now` parsing**:
  - If `now` is supplied in the request body, it must be a **full ISO datetime with timezone** (e.g. `2026-03-18T10:00:00Z` or `2026-03-18T10:00:00+05:30`).
  - If invalid, the endpoint returns `400`.
  - If omitted, the current system time is used.
- **Deployment snapshots**:
  - A single function normalizes deployment objects before sending them in JSON: converts `...Ms` to ISO strings, sets `null` where appropriate.

---

## How I Built It (Step by Step)

1. **Set up the server skeleton**
   - Created a minimal `package.json` with:
     - name, version.
     - `"main": "src/server.js"`.
     - `"scripts": { "start": "node src/server.js" }`.
   - Installed **Express**.
   - Implemented `src/server.js`:
     - Created an Express app.
     - Added `express.json()` middleware.
     - Implemented `GET /api/health` returning `{ "status": "ok" }`.
     - Bound the app to port `3000`.

2. **Design in-memory storage**
   - Implemented an `InMemoryStore` class with:
     - `services` array and `serviceById` map.
     - `deployments` array and `deploymentById` map.
     - `deploymentsByServiceId` map (per-service deployment lists).
     - `deploymentKeyToId` map to enforce idempotency on `(serviceId, environment, commitHash)`.
   - This isolates all “storage” concerns from the routing logic.

3. **Validation & time helpers**
   - Wrote helpers for:
     - `isNonEmptyString`, `parsePositiveInt`.
     - `parseNow(nowOverride)` that:
       - Validates the `now` input with a regex for `YYYY-MM-DDTHH:mm:ss(.sss)?(Z|±HH:MM)`.
       - Returns both milliseconds and ISO string for consistent usage.
   - This keeps the endpoints compact and avoids copying validation logic everywhere.

4. **Services endpoints**
   - **POST `/api/services`**:
     - Validate `name`, `repository` as non-empty strings.
     - Validate `environments` as a non-empty array of non-empty strings.
     - Deduplicate environments while preserving first occurrence order.
     - Validate `maxAttempts`, `backoffSeconds` as positive integers.
     - Store the service in-memory and return it with status `201`.
   - **GET `/api/services`**:
     - Return `{ services: [...] }` in the same order they were inserted.

5. **Create deployments with promotion rules**
   - **POST `/api/deployments`**:
     - Validate `serviceId`, `environment`, `commitHash` as non-empty strings.
     - Ensure the service exists (`404` if not).
     - Enforce **idempotency**:
       - If a deployment with the same `(serviceId, environment, commitHash)` already exists, return that deployment with `200`.
     - Check that `environment` is part of the service’s environment list.
     - Enforce the **promotion rule**:
       - If environment is not the first in the list, check that the immediately preceding environment has a `LIVE` deployment with the same `commitHash`.
       - If not, return `400`.
     - Use `now` (or current time) to create a new deployment with:
       - `status: PENDING`,
       - `attempts: 0`,
       - `nextAttemptAt = now`,
       - initial `history` entry: `CREATED`.
     - Return a normalized deployment snapshot with status `201`.

6. **Claiming deployments (workers)**
   - **POST `/api/deployments/claim`**:
     - Parse `now`.
     - Find all deployments with:
       - `status === 'PENDING'`,
       - `nextAttemptAt <= now`.
     - Sort:
       - by `nextAttemptAt` ascending,
       - tie-break by `createdAt` ascending.
     - If none are due, return `204` (no content).
     - For the earliest due deployment:
       - Set `status = 'DEPLOYING'`.
       - Increment `attempts`.
       - Set `claimedAt = now`.
       - Append `CLAIMED` to history (with that attempt).
     - Return `200` with `{ deployment }`.

7. **Completing and failing deployments**
   - **POST `/api/deployments/:id/complete`**:
     - Only allowed from `DEPLOYING` (otherwise `400`).
     - Parse `now`.
     - Set:
       - `status = 'LIVE'`,
       - `completedAt = now`,
       - `nextAttemptAt = null`.
     - Append `DEPLOYED` to history.
     - For any other deployment with the same `(serviceId, environment)` that is currently `LIVE`:
       - Set `status = 'SUPERSEDED'`.
       - Append `SUPERSEDED` to its history.
   - **POST `/api/deployments/:id/fail`**:
     - Only allowed from `DEPLOYING` (otherwise `400`).
     - Validate a non-empty `error` string.
     - Parse `now`.
     - Set `lastError` and append `FAILED` to history.
     - Read `maxAttempts`, `backoffSeconds` from the associated service.
     - If `attempts < maxAttempts`:
       - `status = 'PENDING'`.
       - `claimedAt = null`.
       - `nextAttemptAt = now + attempts * backoffSeconds * 1000`.
     - Otherwise:
       - `status = 'DEAD'`.
       - `completedAt = now`.
       - `nextAttemptAt = null`.
       - Append `DEAD` to history.

8. **Rollbacks**
   - **POST `/api/deployments/:id/rollback`**:
     - Only valid if the target deployment is `LIVE` (otherwise `400`).
     - Find the most recent `SUPERSEDED` deployment for the same `(serviceId, environment)` (using creation time).
     - If none found, return `400` with a message like “nothing to roll back to”.
     - If found:
       - Set current deployment’s `status = 'ROLLED_BACK'` and append `ROLLED_BACK` to history.
       - Set the superseded deployment’s `status = 'LIVE'` and append `REVIVED` to its history.
     - Return `200` with `{ rolledBack, revived }`.

9. **Read endpoints & history**
   - **GET `/api/deployments/:id`**:
     - Return the deployment snapshot or `404` if not found.
   - **GET `/api/services/:id/deployments`**:
     - `404` if the service does not exist.
     - Optional query parameters:
       - `environment` – filter by environment.
       - `status` – filter by status.
     - Always sorted by creation order.
     - Response: `{ deployments: [...] }`.
   - **GET `/api/deployments/:id/history`**:
     - Return `{ history: [...] }`, sorted by `at` ascending.
     - Each entry: `{ type, at, attempt }` with `at` in ISO format.

---

## How I Used Cursor

If I need to explain this in an interview/contest setting:

- I used **Cursor** mainly as a **smart IDE assistant**:
  - To quickly scaffold the Express server and basic boilerplate (`package.json`, `src/server.js`).
  - To cross-check my code against the problem statement:
    - Ensuring every endpoint and edge case (idempotency, promotion rules, ISO `now`, history types) was covered.
  - To run commands like `npm start` and `curl` via the integrated terminal for quick feedback.
- The **design decisions** (data model, state transitions, history tracking, promotion rule handling, retry/backoff) were derived directly from the problem spec and implemented in code, using Cursor mostly to speed up iteration and verification.

You can think of it as: I still designed the state machine and data model, but Cursor helped me avoid boilerplate mistakes and verify edge cases quickly.

---

## Endpoints & How to Test Them

Assuming the server is running on **port 3000** (`npm start`), here are example `curl` commands.

> Note: For endpoints that accept `now`, you must pass a **full ISO datetime with timezone**, e.g. `2026-03-18T10:00:00Z`.

### 1. Health Check

- **Endpoint**: `GET /api/health`  
- **Purpose**: Check if the API is up.

```bash
curl -sS http://localhost:3000/api/health
```

Expected response:

```json
{ "status": "ok" }
```

---

### 2. Create a Service

- **Endpoint**: `POST /api/services`
- **Body**:
  - `name`: non-empty string.
  - `repository`: non-empty string.
  - `environments`: non-empty array of env names (will be deduped, first occurrence wins).
  - `maxAttempts`: positive integer.
  - `backoffSeconds`: positive integer.

```bash
curl -sS -X POST http://localhost:3000/api/services \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "orders-service",
    "repository": "git@example.com:orders.git",
    "environments": ["DEV", "STAGE", "PROD", "STAGE"],
    "maxAttempts": 3,
    "backoffSeconds": 10
  }'
```

The response will include a generated `id`. Save that as `SERVICE_ID` for the following calls.

---

### 3. List All Services

- **Endpoint**: `GET /api/services`

```bash
curl -sS http://localhost:3000/api/services
```

Response shape:

```json
{
  "services": [
    {
      "id": "...",
      "name": "orders-service",
      "repository": "git@example.com:orders.git",
      "environments": ["DEV", "STAGE", "PROD"],
      "maxAttempts": 3,
      "backoffSeconds": 10
    }
  ]
}
```

---

### 4. Create a Deployment (First Environment)

- **Endpoint**: `POST /api/deployments`
- **Body**:
  - `serviceId`: ID of an existing service.
  - `environment`: must be in the service’s environments list.
  - `commitHash`: non-empty string.
  - `now` (optional): full ISO datetime string with timezone.

Example: create a `DEV` deployment for commit `abc123`.

```bash
SERVICE_ID=... # from create service response

curl -sS -X POST http://localhost:3000/api/deployments \
  -H 'Content-Type: application/json' \
  -d "{
    \"serviceId\": \"${SERVICE_ID}\",
    \"environment\": \"DEV\",
    \"commitHash\": \"abc123\",
    \"now\": \"2026-03-18T10:00:00Z\"
  }"
```

Response will include a deployment `id` and `status: "PENDING"`. Save as `DEV_DEPLOYMENT_ID`.

> Sending the same body again returns the same deployment with `200` (idempotent behavior).

---

### 5. Claim a Deployment

- **Endpoint**: `POST /api/deployments/claim`
- **Body**:
  - `now` (optional): full ISO datetime string with timezone.

```bash
curl -sS -X POST http://localhost:3000/api/deployments/claim \
  -H 'Content-Type: application/json' \
  -d '{
    "now": "2026-03-18T10:01:00Z"
  }'
```

If a deployment is due, you get:

```json
{
  "deployment": {
    "id": "...",
    "serviceId": "...",
    "environment": "DEV",
    "commitHash": "abc123",
    "status": "DEPLOYING",
    "attempts": 1,
    "createdAt": "...",
    "claimedAt": "...",
    "completedAt": null,
    "nextAttemptAt": "...",
    "lastError": null
  }
}
```

If nothing is due, status code is `204` with no body.

---

### 6. Complete a Deployment

- **Endpoint**: `POST /api/deployments/:id/complete`
- **Body**:
  - `now` (optional): full ISO datetime with timezone.

```bash
DEV_DEPLOYMENT_ID=... # from previous steps

curl -sS -X POST \
  http://localhost:3000/api/deployments/${DEV_DEPLOYMENT_ID}/complete \
  -H 'Content-Type: application/json' \
  -d '{
    "now": "2026-03-18T10:02:00Z"
  }'
```

The deployment becomes `LIVE`. Any previous `LIVE` deployment in the same `(serviceId, environment)` is set to `SUPERSEDED`.

---

### 7. Create a Deployment in the Next Environment (Promotion Rule)

Once `DEV` is `LIVE` for `abc123`, you can create a `STAGE` deployment with the same commit:

```bash
curl -sS -X POST http://localhost:3000/api/deployments \
  -H 'Content-Type: application/json' \
  -d "{
    \"serviceId\": \"${SERVICE_ID}\",
    \"environment\": \"STAGE\",
    \"commitHash\": \"abc123\",
    \"now\": \"2026-03-18T10:03:00Z\"
  }"
```

If you try this **before** DEV is `LIVE` for `abc123`, you get `400` due to the promotion rule.

---

### 8. Fail a Deployment (Retries & Backoff)

- **Endpoint**: `POST /api/deployments/:id/fail`
- **Body**:
  - `error`: non-empty string describing the failure.
  - `now` (optional): full ISO datetime with timezone.

Assuming you claimed a `STAGE` deployment and got `STAGE_DEPLOYMENT_ID`:

```bash
STAGE_DEPLOYMENT_ID=...

curl -sS -X POST \
  http://localhost:3000/api/deployments/${STAGE_DEPLOYMENT_ID}/fail \
  -H 'Content-Type: application/json' \
  -d '{
    "error": "deployment failed",
    "now": "2026-03-18T10:05:00Z"
  }'
```

- If `attempts < maxAttempts`, the deployment:
  - goes back to `PENDING`,
  - has `nextAttemptAt` set to `now + attempts * backoffSeconds`.
- If `attempts >= maxAttempts`, the deployment becomes `DEAD` with `completedAt` set and `nextAttemptAt = null`.

---

### 9. Rollback

- **Endpoint**: `POST /api/deployments/:id/rollback`
- **Body**:
  - `now` (optional): full ISO datetime with timezone.

Scenario:

1. `STAGE` deployment A is `LIVE`.
2. Later, `STAGE` deployment B is completed and becomes `LIVE`, making A `SUPERSEDED`.
3. You want to rollback from B to A.

```bash
LATEST_LIVE_STAGE_ID=... # id of deployment B

curl -sS -X POST \
  http://localhost:3000/api/deployments/${LATEST_LIVE_STAGE_ID}/rollback \
  -H 'Content-Type: application/json' \
  -d '{
    "now": "2026-03-18T10:10:00Z"
  }'
```

Response:

```json
{
  "rolledBack": { ... },  // deployment B, now with status ROLLED_BACK
  "revived": { ... }      // deployment A, status changed back to LIVE
}
```

If there is no `SUPERSEDED` deployment to rollback to, you get `400`.

---

### 10. Get a Deployment by ID

- **Endpoint**: `GET /api/deployments/:id`

```bash
DEPLOYMENT_ID=...

curl -sS http://localhost:3000/api/deployments/${DEPLOYMENT_ID}
```

Returns a deployment snapshot or `404` if not found.

---

### 11. List Deployments for a Service

- **Endpoint**: `GET /api/services/:id/deployments`
- **Query parameters**:
  - `environment` (optional).
  - `status` (optional).

```bash
SERVICE_ID=...

curl -sS "http://localhost:3000/api/services/${SERVICE_ID}/deployments"
```

With filters:

```bash
curl -sS "http://localhost:3000/api/services/${SERVICE_ID}/deployments?environment=STAGE&status=LIVE"
```

Response shape:

```json
{
  "deployments": [ ... ]
}
```

---

### 12. Get Deployment History

- **Endpoint**: `GET /api/deployments/:id/history`

```bash
DEPLOYMENT_ID=...

curl -sS http://localhost:3000/api/deployments/${DEPLOYMENT_ID}/history
```

Response:

```json
{
  "history": [
    { "type": "CREATED", "at": "...", "attempt": 0 },
    { "type": "CLAIMED", "at": "...", "attempt": 1 },
    { "type": "DEPLOYED", "at": "...", "attempt": 1 },
    ...
  ]
}
```

Entries are sorted by `at` ascending.

---

This `EXPLANATION.md` should give you enough material to:

- Explain the problem clearly in your own words.
- Walk through your design and reasoning step by step.
- Show exactly how to call and test each endpoint during a demo or contest.
