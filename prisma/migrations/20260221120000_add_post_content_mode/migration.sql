-- CreateEnum
CREATE TYPE "PostContentMode" AS ENUM ('PLAIN', 'LATEX');

-- AlterTable
ALTER TABLE "Post"
ADD COLUMN "contentMode" "PostContentMode" NOT NULL DEFAULT 'PLAIN';
