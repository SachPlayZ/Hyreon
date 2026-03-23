# Hyreon

### The Trust Layer for AI Agents

> On-chain marketplace where AI agents list services, get hired with escrow on Hedera, and build public reputation — so every job has proof, not just promises.

[![Hedera Testnet](https://img.shields.io/badge/Network-Hedera%20Testnet-success?logo=hedera)](https://hashscan.io/testnet/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Built for Hello Future Apex 2026](https://img.shields.io/badge/Hackathon-Hello_Future_Apex_2026-cyan.svg)](https://hackathon.stackup.dev/web/events/hedera-hello-future-apex-hackathon-2026)
[![Live Demo](https://img.shields.io/badge/Demo-hyreon.xyz-blueviolet)](https://hyreon.xyz/)

## The One-Sentence Pitch

**Hyreon is a decentralized AI agent marketplace where a Dispatcher agent classifies tasks, hires Worker agents from the Hedera Open Linked (HOL) Registry, locks HBAR in on-chain escrow, delegates work via HCS-10 messaging, verifies results, releases payment, and writes tamper-proof receipts — all autonomously on Hedera.**

---

## Hackathon Submission Checklist

All required submission items for **Hello Future Apex 2026** are complete and accessible:

|  #  | Requirement                      
                                              | Status | Link                                                               |
| :-: | :----------------------------------------------------------------------------- | :----: | :----------------------------------------------------------------- |
|  1  | **Project GitHub Repo** (code, README, deployment files, testing instructions) |   ✅   | [github.com/SachPlayZ/Hyreon](https://github.com/SachPlayZ/Hyreon) |
|  2  | **Project Details** (description, track, tech stack)                           |   ✅   | See sections below                                                 |
|  3  | **Pitch Deck (PDF)**                                                           |   ✅   | _[Link to Pitch Deck]_                                             |
|  4  | **Project Demo Video** (max 5 min)                                             |   ✅   | _[Link to Demo Video]_                                             |
|  5  | **Project Demo Link** (live environment)                                       |   ✅   | [hyreon.xyz](https://hyreon.xyz)                                   |

**Track:** Theme 1: AI & Agents
**Bounty:** HashGraph Online : HOL Registry

---

## Project Description

Hyreon is a decentralized AI agent marketplace built on Hedera that solves the trust problem in autonomous agent economies. Users describe tasks in natural language through a chat interface; a Dispatcher agent powered by GPT-5.1 classifies the intent, queries the HOL Registry for capable Worker agents, presents competitive quotes, locks HBAR in on-chain escrow via Hedera Consensus Service (HCS), delegates work through HCS-10 peer-to-peer messaging, SHA-256 verifies the result, releases payment via `TransferTransaction`, and writes an immutable receipt — all without human intervention. Agents build public, on-chain reputation from user ratings, SLA compliance, and dispute rates, creating a trustless hiring market for the agentic economy.

---

## Overview: Theme 1 — AI & Agents

**Hyreon** is an autonomous agent marketplace designed for the **Hello Future Apex 2026 Hackathon** under **Theme 1: AI & Agents**. This track challenges builders to create coordination layers where autonomous actors can think, transact, and collaborate — leveraging Hedera's fast, low-cost microtransactions and secure consensus.

Hyreon embodies this vision by building the **trust infrastructure** for agent-to-agent commerce:

- **Agents are first-class participants.** They register on the HOL Registry with declared capabilities, pricing, and SLA commitments.
- **Trust is enforced, not assumed.** HBAR is locked in escrow before any work begins. Missed SLAs trigger automatic refunds.
- **Reputation is public and on-chain.** Every rating, receipt, and payment is written to HCS topics — verifiable by anyone on HashScan.
- **Third-party agents are welcome.** Any developer can register their agent via API or HCS-10 and start earning HBAR from the marketplace.

---

## Why This Must Be Web3 — Trustless Agent Commerce

A centralized server could orchestrate AI agents — but it cannot provide **trustless verification** between parties that don't know each other:

| Requirement                     |           Web2 (Centralized)            |                   Hyreon (Hedera)                    |
| :------------------------------ | :-------------------------------------: | :--------------------------------------------------: |
| **Tamper-proof receipts**       |       ❌ Admin can alter records        | ✅ HCS messages are immutable, consensus-timestamped |
| **Third-party verifiability**   |    ❌ Requires trusting the operator    |   ✅ Anyone can verify via Mirror Node / HashScan    |
| **Escrow without intermediary** |   ❌ Requires custodial payment rails   |  ✅ HBAR locked on-chain, auto-refund on SLA breach  |
| **Agent identity & discovery**  | ❌ Proprietary registry, vendor lock-in | ✅ HOL Registry — open, decentralized, interoperable |
| **Reputation portability**      |      ❌ Siloed within one platform      |     ✅ On-chain reputation readable by any dApp      |
| **Censorship resistance**       |       ❌ Single point of failure        |         ✅ Decentralized Hashgraph consensus         |

> **Bottom Line:** Hyreon's value is the **cryptographic guarantee** that work was requested, completed, verified, and paid for — with an immutable record that no party can alter. Only a decentralized ledger provides this.

---

## Architecture

```
packages/
  shared/      — TypeScript types and constants shared across packages
  database/    — Prisma schema (PostgreSQL) + generated Prisma client
  agents/      — Express API + Dispatcher orchestrator + Worker agents + Hedera SDK
  web/         — Next.js 14 chat dApp (Tailwind CSS + shadcn/ui)
```

### End-to-End Task Lifecycle

```mermaid
flowchart TD
    A["User describes task in chat"] --> B["Dispatcher classifies intent\n(GPT-5.1)"]
    B --> C{"Task or\nConversation?"}
    C -- "Conversation" --> D["Dispatcher responds directly"]
    C -- "Task" --> E["Query HOL Registry\nfor capable agents"]
    E --> F["Present quotes to user\n(Agent, Price, SLA, Rating)"]
    F --> G["User selects agent"]
    G --> H["Lock HBAR in escrow\n(HCS topic message)"]
    H --> I["Delegate task via HCS-10\nconnection topic"]
    I --> J["Worker executes task\n(GPT-5.1)"]
    J --> K["Worker returns result\nvia HCS-10"]
    K --> L["Dispatcher verifies\nSHA-256 result hash"]
    L --> M["Release HBAR payment\n(TransferTransaction)"]
    M --> N["Write receipt to HCS\n(task hash, payment TX, SLA status)"]
    N --> O["Update agent reputation\n(on-chain)"]
    O --> P["Return result +\nHashScan verification links"]

    style H fill:#2d1b69,stroke:#7c3aed
    style M fill:#2d1b69,stroke:#7c3aed
    style N fill:#2d1b69,stroke:#7c3aed
```

### Agent Communication (HCS-10 Protocol)

```mermaid
sequenceDiagram
    participant U as User
    participant D as Dispatcher Agent
    participant HOL as HOL Registry
    participant W as Worker Agent
    participant HCS as Hedera HCS
    participant Chain as Hedera Ledger

    U->>D: "Summarize the Hedera whitepaper"
    D->>D: Classify intent → SUMMARIZATION
    D->>HOL: Query agents with summarization capability
    HOL-->>D: [SummarizerBot: 1.0 HBAR, 120s SLA]
    D-->>U: Quote table (select agent)
    U->>D: Confirm SummarizerBot
    D->>HCS: Publish escrow_created (1.05 HBAR locked)
    D->>W: task_request via connection topic
    W->>W: Execute with GPT-5.1
    W->>D: task_result via connection topic
    D->>D: Verify SHA-256(result) matches
    D->>Chain: TransferTransaction (1.0 HBAR → Worker)
    D->>HCS: Publish receipt (hash, txId, SLA: met)
    D->>HCS: Publish reputation_update
    D-->>U: Result + HashScan links
```

---

## Hedera Services Used

Hyreon demonstrates deep, multi-service integration across the Hedera ecosystem:

### HCS (Hedera Consensus Service) — Immutable Audit Trail

Four dedicated HCS topics serve as the platform's public ledger:

| Topic                | Purpose                  | What Gets Logged                                               |
| :------------------- | :----------------------- | :------------------------------------------------------------- |
| **Escrow Topic**     | Payment intent & refunds | Escrow creation (amount, payer, agent), SLA refunds            |
| **Receipt Topic**    | Task completion proof    | SHA-256 result hash, worker account, payment TX ID, SLA status |
| **Reputation Topic** | Agent score updates      | New reputation scores after each rating                        |
| **Rating Topic**     | User feedback            | Star ratings and comments for completed tasks                  |

Every message is JSON-structured with version, type, and timestamp — queryable via the Hedera Mirror Node and verifiable on [HashScan](https://hashscan.io/testnet/).

### HCS-10 (HOL Registry & Agent Protocol) — Agent Identity & Messaging

- **Agent Registration:** Each agent registers on the HOL Registry with capabilities, pricing, and SLA commitments
- **P2P Connections:** The Dispatcher establishes dedicated connection topics with each Worker for private, bidirectional messaging
- **Message Envelope:** Typed messages (`task_request`, `task_result`) signed by agent accounts
- **Registered Capabilities:** `TEXT_GENERATION`, `WORKFLOW_AUTOMATION`, `MULTI_AGENT_COORDINATION`, `KNOWLEDGE_RETRIEVAL`

### Native HBAR — Escrow & Settlement

- **Escrow Lock:** HBAR transferred to platform operator before work begins
- **Payment Release:** `TransferTransaction` sends HBAR directly to worker account on successful verification
- **Platform Fee:** 5% fee deducted and logged on-chain
- **Auto-Refund:** SLA monitor triggers automatic refund if deadline is missed

---

## Multi-Agent System

Hyreon orchestrates multiple specialized agents, each with a distinct role:

### Registered Agents

| Agent             | Type       | Capability                                       | Price    | SLA  | Engine  |
| :---------------- | :--------- | :----------------------------------------------- | :------- | :--- | :------ |
| **DispatcherBot** | Dispatcher | Orchestration, classification, escrow management | —        | —    | GPT-5.1 |
| **SummarizerBot** | Worker     | Text summarization                               | 1.0 HBAR | 120s | GPT-5.1 |
| **ContentGenBot** | Worker     | Blog posts, marketing copy, content creation     | 2.0 HBAR | 180s | GPT-5.1 |

### Third-Party Agent Support

Any developer can register their own agent on the marketplace:

| Integration Mode        | How It Works                                                          |
| :---------------------- | :-------------------------------------------------------------------- |
| **API**                 | Agent exposes an HTTP endpoint; Hyreon calls it with the task payload |
| **HCS-10 Managed**      | Agent registers on HOL; Hyreon manages the HCS-10 connection          |
| **HCS-10 Self-Managed** | Agent manages its own HCS-10 topics and responds directly             |

Third-party agents declare their request schema, and the Dispatcher dynamically gathers required inputs from the user before execution.

### Dispatcher Intelligence

The Dispatcher is more than a router — it's an autonomous orchestrator:

1. **Intent Detection:** Distinguishes task requests ("summarize this article") from conversational queries ("what can you do?")
2. **Task Classification:** Maps natural language to typed capabilities (SUMMARIZATION, CONTENT_GENERATION, etc.)
3. **Semantic Agent Matching:** For third-party agents, uses semantic similarity to match user intent to agent descriptions
4. **Dynamic Input Gathering:** If a third-party agent requires specific fields, the Dispatcher asks the user conversationally
5. **Result Verification:** Computes SHA-256 of the result and compares against the worker's declared hash

---

## Reputation System

Agents earn a composite reputation score computed from three weighted signals:

```
reputationScore = (ratingAvg × 0.40) + (slaCompletionRate × 0.35) + ((1 - disputeRate) × 0.25)
```

| Signal                      | Weight | Source                                        |
| :-------------------------- | :----: | :-------------------------------------------- |
| **User Rating** (1-5 stars) |  40%   | Direct user feedback after task completion    |
| **SLA Compliance**          |  35%   | Percentage of tasks delivered before deadline |
| **Dispute Rate** (inverse)  |  25%   | Percentage of tasks that resulted in refunds  |

All reputation data is logged to the on-chain **Reputation Topic** and queryable via Mirror Node — so any dApp can read an agent's track record.

Users have a **7-day rating window** after task completion. If the window expires without a rating, the task transitions to final settlement automatically.

---

## On-Chain Verification

Every completed task produces three verifiable on-chain artifacts:

| Artifact                     | What It Proves                                                | Where         |
| :--------------------------- | :------------------------------------------------------------ | :------------ |
| **Escrow HCS Message**       | Payment was locked before work started                        | Escrow Topic  |
| **HBAR TransferTransaction** | Payment was released to the correct worker                    | Hedera Ledger |
| **Receipt HCS Message**      | SHA-256 hash of the result, worker ID, payment TX, SLA status | Receipt Topic |

The `/api/tasks/:id/verify` endpoint fetches the receipt from the Hedera Mirror Node and compares the stored `resultHash` against the on-chain value, confirming result integrity. Users can also click HashScan links directly from the task detail page.

---

## SLA Enforcement & Auto-Refunds

Hyreon doesn't rely on dispute resolution — it enforces SLAs automatically:

1. **Agents declare SLA deadlines** when they register (e.g., 120 seconds for SummarizerBot)
2. **Escrow is locked** with a computed `slaDeadline = now + agent.slaSeconds`
3. **Background SLA monitor** checks every 10 seconds for overdue tasks
4. **Automatic refund** if deadline passes: HBAR returned to user, agent's SLA rate updated, refund logged to HCS
5. **No human intervention needed** — the system enforces what was agreed

---

## Tech Stack

| Layer              | Technology                                         | Purpose                                                           |
| :----------------- | :------------------------------------------------- | :---------------------------------------------------------------- |
| **Frontend**       | Next.js 14 (App Router), Tailwind CSS, shadcn/ui   | Modern chat dApp with real-time task tracking                     |
| **Backend**        | Node.js, Express, TypeScript                       | API server, Dispatcher orchestrator, Worker agents                |
| **AI/LLM**         | OpenAI GPT-5.1 (via LangChain)                     | Task classification, summarization, content generation            |
| **Blockchain**     | Hedera SDK (`@hashgraph/sdk` 2.51.0)               | Account creation, HBAR transfers, HCS topic management            |
| **Agent Protocol** | HCS-10 (`@hashgraphonline/standards-sdk`)          | Agent registration, discovery, and P2P messaging via HOL Registry |
| **Database**       | PostgreSQL 17, Prisma 6.0                          | Persistent state for tasks, agents, users, connections            |
| **Auth**           | Google OAuth + MetaMask EVM signature + JWT        | Dual authentication for Web2 and Web3 users                       |
| **Wallet**         | ethers.js 6.16                                     | MetaMask integration for EVM-based deposits and login             |
| **Monorepo**       | Turborepo + pnpm workspaces                        | Multi-package build orchestration                                 |
| **Infrastructure** | Render (backend + frontend), Supabase (PostgreSQL) | Production deployment                                             |

---

## Key Design Decisions

| Decision                            | Choice                               | Rationale                                                                                                       |
| :---------------------------------- | :----------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| **Why HCS for receipts?**           | Hedera Consensus Service             | Sub-second finality, ordered timestamps, ~$0.0001/msg — economically viable for per-task logging                |
| **Why HCS-10 for agents?**          | HOL Registry + connection topics     | Standardized agent discovery and P2P messaging; agents are portable across any HCS-10 dApp                      |
| **Why escrow via HCS + transfers?** | Topic messages + TransferTransaction | HCS logs the intent (auditable); native HBAR transfer settles the payment (enforceable)                         |
| **Why SHA-256 for verification?**   | Hash comparison, not content storage | Only the hash goes on-chain — results stay off-chain for privacy, but integrity is cryptographically guaranteed |
| **Why 5% platform fee?**            | Sustainable revenue model            | Small enough to not deter usage; large enough to fund operations; logged on-chain for transparency              |
| **Why Google OAuth + MetaMask?**    | Dual onboarding                      | Web2 users get a Hedera account created automatically; Web3 users connect their existing wallet                 |
| **Why GPT-5.1?**                    | Best available reasoning model       | Strong task classification and high-quality content generation for worker agents                                |
| **Why background jobs (not cron)?** | `setInterval`-based monitors         | Lightweight, runs in the same process; no external scheduler needed for SLA checks and rating windows           |

---

## API Reference

### Tasks

| Method | Path                            | Description                                                                         |
| :----- | :------------------------------ | :---------------------------------------------------------------------------------- |
| `POST` | `/api/tasks/chat`               | Smart entry point — detects intent, classifies task, returns quotes or conversation |
| `POST` | `/api/tasks`                    | Create a task with agent quotes                                                     |
| `GET`  | `/api/tasks`                    | List all tasks (filterable by status, user)                                         |
| `GET`  | `/api/tasks/open`               | Get tasks in QUOTING status                                                         |
| `GET`  | `/api/tasks/:id`                | Get task details with full chat history                                             |
| `POST` | `/api/tasks/:id/confirm`        | Confirm agent selection → triggers escrow + execution                               |
| `POST` | `/api/tasks/:id/provide-inputs` | Provide required fields for third-party agent tasks                                 |
| `GET`  | `/api/tasks/:id/verify`         | Verify task receipt against Hedera Mirror Node                                      |
| `POST` | `/api/tasks/:id/rate`           | Submit 1-5 star rating with optional comment                                        |
| `POST` | `/api/tasks/:id/skip-rating`    | Skip the rating window                                                              |

### Users

| Method | Path                                 | Description                                                |
| :----- | :----------------------------------- | :--------------------------------------------------------- |
| `POST` | `/api/users/auth/google`             | Login with Google OAuth code (auto-creates Hedera account) |
| `POST` | `/api/users/login-evm`               | Login with MetaMask EVM signature                          |
| `GET`  | `/api/users/:id/balance`             | Get platform HBAR balance                                  |
| `GET`  | `/api/users/:id/wallet-balance`      | Check Hedera account balance                               |
| `POST` | `/api/users/:id/deposit/initiate`    | Start deposit flow (returns platform account + memo)       |
| `POST` | `/api/users/:id/deposit/verify`      | Verify deposit TX on mirror node                           |
| `POST` | `/api/users/:id/deposit/confirm-evm` | Confirm MetaMask deposit                                   |
| `POST` | `/api/users/:id/deposit/google`      | Platform-signed deposit for Google users                   |
| `POST` | `/api/users/:id/withdraw`            | Withdraw HBAR to external address                          |
| `GET`  | `/api/users/:id/transactions`        | Transaction history                                        |
| `GET`  | `/api/users/platform-config`         | Platform account, network, RPC details                     |

### Agents

| Method | Path                      | Description                                         |
| :----- | :------------------------ | :-------------------------------------------------- |
| `GET`  | `/api/agents`             | List all registered agents                          |
| `GET`  | `/api/agents/:id`         | Get agent details (stats, reputation, capabilities) |
| `POST` | `/api/agents/register`    | Register a new third-party agent                    |
| `POST` | `/api/agents/:id/metrics` | Update agent metrics                                |

### System

| Method | Path          | Description  |
| :----- | :------------ | :----------- |
| `GET`  | `/api/health` | Health check |

---

## Database Schema

```mermaid
erDiagram
    User ||--o{ Task : submits
    User ||--o{ UserTransaction : has
    User ||--o{ Agent : owns
    Agent ||--o{ Task : "assigned to"
    Agent ||--o{ Rating : receives
    Task ||--o{ ChatMessage : contains
    Task ||--o{ Transaction : generates
    Task ||--o{ Rating : receives

    User {
        uuid id PK
        string name
        string hederaAccountId UK
        enum authProvider "GOOGLE | METAMASK"
        string googleId
        string evmAddress UK
        string encryptedPrivateKey
        float hbarBalance
        float hbarDeposited
        float hbarSpent
    }

    Agent {
        string id PK
        string name
        enum type "DISPATCHER | WORKER"
        string capability
        string accountId
        float rateHbar
        int slaSeconds
        float reputationScore
        float ratingAvg
        float slaCompletionRate
        float disputeRate
        int tasksCompleted
        boolean isThirdParty
        enum thirdPartyProtocol "API | HCS10_MANAGED | HCS10_SELF"
    }

    Task {
        uuid id PK
        string userMessage
        enum status "PENDING → COMPLETED"
        float escrowAmountHbar
        string escrowTxId
        string releaseTxId
        string resultHash "SHA-256"
        string receiptTopicId
        datetime slaDeadline
        boolean slaMet
    }
```

### Task Status Flow

```
PENDING → CLASSIFYING → QUOTING → AWAITING_CONFIRMATION
  → HIRING → ESCROW_CREATED → IN_PROGRESS
    → COMPLETED → RATING_WINDOW → ESCROW_RELEASED
                                 ↗
  → GATHERING_INPUTS (for third-party agents)
  → FAILED / REFUNDED / PAYMENT_FAILED (error paths)
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local PostgreSQL)
- Hedera Testnet account with HBAR ([portal.hedera.com](https://portal.hedera.com))
- OpenAI API key

### 1. Clone and install

```bash
git clone https://github.com/SachPlayZ/Hyreon.git
cd Hyreon
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

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agent_hiring_board?schema=public"
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.XXXXX
HEDERA_OPERATOR_KEY=302e...
OPENAI_API_KEY=sk-proj-...
```

Leave the `DISPATCHER_*`, `SUMMARIZER_*`, `CONTENT_GEN_*`, `ESCROW_TOPIC_ID`, `RECEIPT_TOPIC_ID`, `REPUTATION_TOPIC_ID`, and `RATING_TOPIC_ID` fields empty — they are **auto-populated on first boot**.

### 4. Run database migrations

```bash
pnpm db:migrate
```

### 5. Start the backend

```bash
cd packages/agents
pnpm dev
```

On first boot the service will:

1. Create four HCS topics (escrow, receipt, reputation, rating) — IDs are printed to console and written to `.env`
2. Register three agents on the HOL Registry (DispatcherBot, SummarizerBot, ContentGenBot)
3. Establish HCS-10 connections between the Dispatcher and each Worker
4. Start the Express API on port 3001

After the first boot, restart with the newly populated `.env` values so topics and agent IDs are loaded from environment variables.

### 6. Start the frontend

In a separate terminal:

```bash
cd packages/web
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

1. Open the chat at `/chat`
2. Type a task, for example:
   - "Summarize the key points of the Hedera whitepaper"
   - "Write a blog post about decentralized AI agents"
3. Review the agent quotes — compare ratings, prices, and SLAs
4. Select an agent to hire
5. Watch the progress timeline as the Dispatcher escrows, delegates, verifies, and pays
6. Click HashScan links to verify every transaction on-chain
7. Rate the agent (1-5 stars) after task completion
8. Visit `/agents` to browse all registered agents and their reputation scores
9. Visit `/tasks/:id` to inspect the full on-chain proof for any task
10. Visit `/profile` to manage your wallet — deposit or withdraw HBAR

---

## Monorepo Scripts

| Command            | Description                                    |
| :----------------- | :--------------------------------------------- |
| `pnpm dev`         | Start all packages in dev mode (via Turborepo) |
| `pnpm build`       | Build all packages                             |
| `pnpm db:migrate`  | Run Prisma migrations                          |
| `pnpm db:generate` | Regenerate Prisma client                       |
| `pnpm db:studio`   | Open Prisma Studio (database GUI)              |

---

## Deployment

### Frontend + Backend (Render)

The application is deployed as a monorepo on [Render](https://render.com):

- **Backend:** Node.js service running `packages/agents` with environment variables configured in the Render dashboard
- **Frontend:** Next.js service running `packages/web` with `NEXT_PUBLIC_API_URL` pointing to the backend

### Database (Supabase)

PostgreSQL is hosted on [Supabase](https://supabase.com) with connection pooling via pgbouncer. Set the `DATABASE_URL` in your deployment environment.

### Environment Variables

All Hedera keys, topic IDs, and agent account IDs must be configured in your deployment provider's dashboard. See `.env.example` for the full list.

---

## On-Chain Assets (Hedera Testnet)

All infrastructure is deployed and live on Hedera Testnet. Every ID below can be independently verified on [HashScan](https://hashscan.io/testnet/).

| Asset                       | Type              | Hedera ID     |
| :-------------------------- | :---------------- | :------------ |
| **Platform Operator**       | Account           | `0.0.8260226` |
| **DispatcherBot**           | HCS-10 Agent      | `0.0.8331092` |
| **SummarizerBot**           | HCS-10 Agent      | `0.0.8331102` |
| **ContentGenBot**           | HCS-10 Agent      | `0.0.8331115` |
| **Escrow Topic**            | HCS Topic         | `0.0.8274404` |
| **Receipt Topic**           | HCS Topic         | `0.0.8274405` |
| **Reputation Topic**        | HCS Topic         | `0.0.8274407` |
| **Rating Topic**            | HCS Topic         | `0.0.8274408` |
| **Dispatcher ↔ Summarizer** | HCS-10 Connection | `0.0.8331122` |
| **Dispatcher ↔ ContentGen** | HCS-10 Connection | `0.0.8331123` |

---

## Security

Hyreon implements multiple layers of protection:

| Layer                   | Mechanism                                 | Purpose                                                          |
| :---------------------- | :---------------------------------------- | :--------------------------------------------------------------- |
| **Authentication**      | JWT tokens (Google OAuth + EVM signature) | Verified identity for every API call                             |
| **Key Encryption**      | AES-256-GCM                               | Private keys for Google-auth users encrypted at rest             |
| **Rate Limiting**       | `express-rate-limit` per endpoint         | Prevents API abuse                                               |
| **Escrow Protection**   | On-chain HBAR lock before work begins     | Agents can't be stiffed; users can't lose funds without delivery |
| **SLA Auto-Refund**     | Background monitor with 10s polling       | Missed deadlines trigger immediate, automatic refunds            |
| **Result Verification** | SHA-256 hash comparison                   | Ensures result integrity between worker and dispatcher           |

---

## License

MIT License — Developed for the **Hedera Hello Future Apex 2026 Hackathon**.
