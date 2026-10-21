-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('SIGNING', 'ISSUER_ARS', 'ISSUER_PEN', 'DISTRIBUTION', 'WITHDRAW', 'LIQUIDITY');

-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('deposit', 'withdrawal');

-- CreateTable
CREATE TABLE "AnchorAccount" (
    "id" TEXT NOT NULL,
    "role" "AccountRole" NOT NULL,
    "public_key" TEXT NOT NULL,
    "secret_enc" TEXT NOT NULL,
    "label" TEXT,
    "generation" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnchorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "kind" "TransactionKind" NOT NULL,
    "status" TEXT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "memo" TEXT,
    "memo_type" TEXT,
    "lang" TEXT,
    "client_domain" TEXT,
    "amount_expected" DECIMAL(20,7),
    "amount_in" DECIMAL(20,7),
    "amount_out" DECIMAL(20,7),
    "amount_fee" DECIMAL(20,7),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "user_action_required_by" TIMESTAMP(3),
    "stellar_transaction_id" TEXT,
    "external_transaction_id" TEXT,
    "from" TEXT,
    "to" TEXT,
    "message" TEXT,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "refunds" JSONB,
    "deposit_memo" TEXT,
    "deposit_memo_type" TEXT,
    "withdraw_anchor_account" TEXT,
    "withdraw_memo" TEXT,
    "withdraw_memo_type" TEXT,
    "external_extra" TEXT,
    "external_extra_text" TEXT,
    "destination" JSONB,
    "forced_outcome" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionEvent" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycProfile" (
    "account" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycProfile_pkey" PRIMARY KEY ("account")
);

-- CreateTable
CREATE TABLE "SozuClaim" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(20,7),
    "tx_hash" TEXT,
    "reason" TEXT,
    "next_available_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SozuClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamCursor" (
    "key" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamCursor_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnchorAccount_public_key_key" ON "AnchorAccount"("public_key");

-- CreateIndex
CREATE INDEX "AnchorAccount_role_active_idx" ON "AnchorAccount"("role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_withdraw_memo_key" ON "Transaction"("withdraw_memo");

-- CreateIndex
CREATE INDEX "Transaction_account_asset_code_started_at_idx" ON "Transaction"("account", "asset_code", "started_at");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "TransactionEvent_transaction_id_created_at_idx" ON "TransactionEvent"("transaction_id", "created_at");

-- CreateIndex
CREATE INDEX "SozuClaim_account_id_created_at_idx" ON "SozuClaim"("account_id", "created_at");

-- AddForeignKey
ALTER TABLE "TransactionEvent" ADD CONSTRAINT "TransactionEvent_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SozuClaim" ADD CONSTRAINT "SozuClaim_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "AnchorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

