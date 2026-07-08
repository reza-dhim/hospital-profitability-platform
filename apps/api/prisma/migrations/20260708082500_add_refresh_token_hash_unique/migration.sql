-- AlterTable
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_token_hash_key" UNIQUE ("token_hash");
