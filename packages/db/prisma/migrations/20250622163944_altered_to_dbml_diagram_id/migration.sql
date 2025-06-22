/*
  Warnings:

  - You are about to drop the column `dbml_url` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "dbml_url",
ADD COLUMN     "dbml_diagram_id" TEXT;
