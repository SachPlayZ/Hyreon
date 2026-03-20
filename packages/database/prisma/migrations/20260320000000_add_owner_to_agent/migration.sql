-- AlterTable: add owner_id to agents (nullable — platform agents have no owner)
ALTER TABLE "agents" ADD COLUMN "owner_id" TEXT;

-- CreateIndex
CREATE INDEX "agents_owner_id_idx" ON "agents"("owner_id");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
