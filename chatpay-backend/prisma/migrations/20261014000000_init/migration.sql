-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('previewed', 'awaiting_signature', 'submitted', 'confirmed', 'failed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'system');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_challenges" (
    "id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipients" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "alias_norm" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "recipient_id" TEXT,
    "recipient_address" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "asset_issuer" TEXT NOT NULL,
    "memo" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'previewed',
    "xdr_unsigned" TEXT NOT NULL,
    "tx_hash_expected" TEXT,
    "tx_hash" TEXT,
    "source_seq" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "failure_code" TEXT,
    "client_msg_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "role" "MessageRole" NOT NULL DEFAULT 'system',
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "client_msg_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_public_key_key" ON "users"("public_key");

-- CreateIndex
CREATE UNIQUE INDEX "auth_challenges_nonce_key" ON "auth_challenges"("nonce");

-- CreateIndex
CREATE INDEX "auth_challenges_public_key_idx" ON "auth_challenges"("public_key");

-- CreateIndex
CREATE INDEX "recipients_user_id_idx" ON "recipients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipients_user_id_alias_norm_key" ON "recipients"("user_id", "alias_norm");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_tx_hash_idx" ON "payments"("tx_hash");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_user_id_client_msg_id_key" ON "payments"("user_id", "client_msg_id");

-- CreateIndex
CREATE INDEX "chat_messages_user_id_seq_idx" ON "chat_messages"("user_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_user_id_client_msg_id_key" ON "chat_messages"("user_id", "client_msg_id");

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
