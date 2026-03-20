-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('DISPATCHER', 'WORKER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'CLASSIFYING', 'QUOTING', 'AWAITING_CONFIRMATION', 'HIRING', 'ESCROW_CREATED', 'IN_PROGRESS', 'RATING_WINDOW', 'COMPLETED', 'ESCROW_RELEASED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('SUMMARIZATION', 'CONTENT_GENERATION');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('ESCROW_CREATE', 'ESCROW_RELEASE', 'RECEIPT', 'REFUND', 'USER_DEPOSIT', 'PLATFORM_FEE');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'DISPATCHER', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hedera_account_id" TEXT NOT NULL,
    "hbar_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hbar_deposited" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hbar_spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AgentType" NOT NULL,
    "capability" TEXT,
    "account_id" TEXT,
    "inbound_topic_id" TEXT,
    "outbound_topic_id" TEXT,
    "profile_topic_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "rate_hbar" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "tasks_completed" INTEGER NOT NULL DEFAULT 0,
    "task_name" TEXT,
    "sla_seconds" INTEGER NOT NULL DEFAULT 120,
    "description" TEXT,
    "wallet_id" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "is_third_party" BOOLEAN NOT NULL DEFAULT false,
    "reputation_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "rating_avg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sla_completion_rate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "total_ratings" INTEGER NOT NULL DEFAULT 0,
    "dispute_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "user_message" TEXT NOT NULL,
    "classified_type" "TaskType",
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "user_id" TEXT,
    "assigned_worker_id" TEXT,
    "escrow_amount_hbar" DOUBLE PRECISION,
    "escrow_tx_id" TEXT,
    "release_tx_id" TEXT,
    "result_text" TEXT,
    "result_hash" TEXT,
    "receipt_topic_id" TEXT,
    "receipt_sequence_number" INTEGER,
    "connection_topic_id" TEXT,
    "sla_deadline" TIMESTAMP(3),
    "sla_met" BOOLEAN,
    "platform_fee_hbar" DOUBLE PRECISION,
    "user_rating" INTEGER,
    "user_comment" TEXT,
    "rating_window_closes_at" TIMESTAMP(3),
    "quote_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "logged_on_chain_tx_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "hedera_tx_id" TEXT,
    "topic_id" TEXT,
    "sequence_number" INTEGER,
    "amount_hbar" DOUBLE PRECISION,
    "from_account" TEXT,
    "to_account" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "task_id" TEXT,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "dispatcher_account_id" TEXT NOT NULL,
    "worker_account_id" TEXT NOT NULL,
    "connection_topic_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_message_sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_hedera_account_id_key" ON "users"("hedera_account_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_assigned_worker_id_idx" ON "tasks"("assigned_worker_id");

-- CreateIndex
CREATE INDEX "tasks_user_id_idx" ON "tasks"("user_id");

-- CreateIndex
CREATE INDEX "ratings_task_id_idx" ON "ratings"("task_id");

-- CreateIndex
CREATE INDEX "ratings_agent_id_idx" ON "ratings"("agent_id");

-- CreateIndex
CREATE INDEX "transactions_task_id_idx" ON "transactions"("task_id");

-- CreateIndex
CREATE INDEX "chat_messages_task_id_idx" ON "chat_messages"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "connections_dispatcher_account_id_worker_account_id_key" ON "connections"("dispatcher_account_id", "worker_account_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_worker_id_fkey" FOREIGN KEY ("assigned_worker_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
