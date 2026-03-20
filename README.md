# Agent Hiring Board

A decentralized AI agent marketplace built on Hedera. Users submit tasks via a chat interface; a Dispatcher agent classifies the task, hires a specialized Worker agent from the Hedera Open Linked (HOL) Registry, locks HBAR in an on-chain escrow, delegates the task via HCS-10, verifies the result, releases payment, and writes a tamper-proof receipt to HCS.

## Architecture

```
packages/
  shared/      — TypeScript types and constants shared across packages
  database/    — Prisma schema (PostgreSQL) + generated Prisma client
  agents/      — Express API + Dispatcher orchestrator + Worker agents + Hedera SDK
  web/         — Next.js 14 chat dApp (Tailwind CSS)
```

### Agent Flow

```
User → POST /api/chat
  → Dispatcher classifies task (Claude)
  → Finds Worker in DB (pre-registered via HOL Registry)
  → Creates escrow (HCS topic message, on-chain intent)
  → Sends task to Worker via HCS-10 connection topic
  → Worker executes task (Claude) and replies on connection topic
  → Dispatcher verifies result hash
  → Releases HBAR payment (Hedera TransferTransaction)
  → Writes receipt to HCS receipt topic
  → Returns result + on-chain proof links to user
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL)
- Hedera Testnet account with HBAR (get one at [portal.hedera.com](https://portal.hedera.com))
- Anthropic API key

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agent_hiring_board?schema=public"
HEDERA_OPERATOR_ID=0.0.XXXXX
HEDERA_OPERATOR_KEY=302e...
ANTHROPIC_API_KEY=sk-ant-...
```

Leave the `DISPATCHER_*`, `SUMMARIZER_*`, `ANALYST_*`, `ESCROW_TOPIC_ID`, and `RECEIPT_TOPIC_ID` fields empty — they are auto-populated on first boot.

### 4. Run database migrations

```bash
pnpm db:migrate
```

This runs `prisma migrate dev` inside `packages/database` and generates the Prisma client.

### 5. Start the backend

```bash
cd packages/agents
pnpm dev
```

On first boot the service will:
1. Create two HCS topics (escrow log + receipt log) — copy the IDs printed to console into your `.env`
2. Register three agents on the HOL Registry (DispatcherBot, SummarizerBot, AnalystBot) — this costs a small amount of HBAR
3. Establish HCS-10 connections between the Dispatcher and each Worker
4. Start the Express API on port 3001

After the first boot, restart with the newly populated `.env` values so the topics and agent IDs are loaded from environment variables instead of being re-created.

### 6. Start the frontend

In a separate terminal:

```bash
cd packages/web
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Open the chat at `/chat`
2. Type a task, for example:
   - "Summarize the key points of the Hedera whitepaper"
   - "Analyze the pros and cons of microservices architecture"
3. Watch the progress panel as the Dispatcher classifies, hires, escrows, delegates, and pays
4. Click the HashScan links to verify transactions on-chain
5. Visit `/agents` to see all registered agents and their stats
6. Visit `/tasks/:id` to inspect the full on-chain proof for any task

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Submit a task message |
| GET | `/api/tasks` | List all tasks |
| GET | `/api/tasks/:id` | Get task details with chat history |
| GET | `/api/tasks/:id/verify` | Verify task against mirror node |
| GET | `/api/agents` | List all registered agents |
| GET | `/api/health` | Health check |

## On-Chain Verification

Every completed task produces three on-chain artifacts, all verifiable on [HashScan](https://hashscan.io/testnet):

| Artifact | What it proves |
|----------|----------------|
| Escrow HCS message | Payment intent was locked before work started |
| HBAR TransferTransaction | Payment was released to the worker |
| Receipt HCS message | SHA-256 hash of the result, worker account, and all transaction IDs |

The `/api/tasks/:id/verify` endpoint fetches the receipt from the Hedera Mirror Node and compares the stored `resultHash` against the on-chain value, confirming result integrity.

## Monorepo Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all packages in dev mode (via Turborepo) |
| `pnpm build` | Build all packages |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:studio` | Open Prisma Studio |

## Tech Stack

- **Hedera SDK** — account creation, HBAR transfers, HCS topic management
- **HCS-10** (`@hashgraphonline/standards-sdk`) — agent registration, discovery, and P2P messaging
- **LangChain + Claude** — task classification and execution
- **Prisma + PostgreSQL** — persistent state for tasks, agents, connections
- **Express** — REST API
- **Next.js 14 + Tailwind** — chat frontend
- **Turborepo + pnpm workspaces** — monorepo tooling
