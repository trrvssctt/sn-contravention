-- DropIndex
DROP INDEX "Contravention_vehicleId_idx";

-- AlterTable
ALTER TABLE "Officer" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedBy" TEXT,
ADD COLUMN     "suspensionMotif" TEXT;

-- CreateIndex
CREATE INDEX "Contravention_vehicleId_statut_idx" ON "Contravention"("vehicleId", "statut");
