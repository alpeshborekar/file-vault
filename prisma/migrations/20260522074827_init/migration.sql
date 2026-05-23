-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('processing', 'ready', 'infected', 'failed');

-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('read', 'write');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "storage_quota_bytes" BIGINT NOT NULL DEFAULT 5368709120,
    "storage_used_bytes" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256_hash" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "thumbnail_key" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'processing',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_versions" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "version_num" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_shares" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "shared_with_id" TEXT,
    "token" TEXT,
    "permission" "SharePermission" NOT NULL DEFAULT 'read',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "files_user_id_idx" ON "files"("user_id");

-- CreateIndex
CREATE INDEX "files_sha256_hash_idx" ON "files"("sha256_hash");

-- CreateIndex
CREATE INDEX "files_expires_at_idx" ON "files"("expires_at");

-- CreateIndex
CREATE INDEX "files_user_id_is_deleted_created_at_idx" ON "files"("user_id", "is_deleted", "created_at");

-- CreateIndex
CREATE INDEX "file_versions_file_id_idx" ON "file_versions"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_file_id_version_num_key" ON "file_versions"("file_id", "version_num");

-- CreateIndex
CREATE UNIQUE INDEX "file_shares_token_key" ON "file_shares"("token");

-- CreateIndex
CREATE INDEX "file_shares_file_id_idx" ON "file_shares"("file_id");

-- CreateIndex
CREATE INDEX "file_shares_token_idx" ON "file_shares"("token");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_shared_with_id_fkey" FOREIGN KEY ("shared_with_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
