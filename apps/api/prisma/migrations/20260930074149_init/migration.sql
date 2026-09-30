-- CreateEnum
CREATE TYPE "OfficerStatus" AS ENUM ('actif', 'suspendu', 'inactif');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'commandant', 'tresorier', 'superviseur');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('actif', 'en_attente', 'revoque');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('VP', 'Moto', 'Camion', 'Bus');

-- CreateEnum
CREATE TYPE "ContraventionStatus" AS ENUM ('impayee', 'partielle', 'payee', 'annulee');

-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('mobile', 'admin');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('especes', 'wave', 'orange_money', 'carte');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('en_attente', 'confirme', 'echoue');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('officer', 'usager', 'admin');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('admin', 'officer', 'user', 'system');

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "commissariat" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "isDakar" BOOLEAN NOT NULL DEFAULT false,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Officer" (
    "id" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "photoUrl" TEXT,
    "statut" "OfficerStatus" NOT NULL DEFAULT 'actif',
    "passwordHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lang" TEXT NOT NULL DEFAULT 'fr',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Officer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "zoneId" TEXT,
    "statut" "AdminStatus" NOT NULL DEFAULT 'actif',
    "passwordHash" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "cni" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "adresse" TEXT,
    "quartier" TEXT,
    "email" TEXT,
    "photoCniUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "twoFactor" BOOLEAN NOT NULL DEFAULT true,
    "biometric" BOOLEAN NOT NULL DEFAULT false,
    "lang" TEXT NOT NULL DEFAULT 'fr',
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "plaque" TEXT NOT NULL,
    "marque" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "couleur" TEXT,
    "annee" INTEGER,
    "type" "VehicleType" NOT NULL DEFAULT 'VP',
    "carburant" TEXT,
    "chassis" TEXT,
    "ownerId" TEXT NOT NULL,
    "assuranceExp" TIMESTAMP(3),
    "visiteTechExp" TIMESTAMP(3),
    "carteGriseOk" BOOLEAN NOT NULL DEFAULT true,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfractionType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montantDefaut" INTEGER NOT NULL,
    "icone" TEXT NOT NULL DEFAULT 'warning',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfractionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contravention" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "officerId" TEXT,
    "zoneId" TEXT NOT NULL,
    "montantTotal" INTEGER NOT NULL,
    "montantPaye" INTEGER NOT NULL DEFAULT 0,
    "lieuTexte" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "dateHeure" TIMESTAMP(3) NOT NULL,
    "photoPreuveUrl" TEXT,
    "notes" TEXT,
    "statut" "ContraventionStatus" NOT NULL DEFAULT 'impayee',
    "canal" "Canal" NOT NULL DEFAULT 'mobile',
    "clientUuid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contravention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContraventionItem" (
    "id" TEXT NOT NULL,
    "contraventionId" TEXT NOT NULL,
    "infractionTypeId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,

    CONSTRAINT "ContraventionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "numeroRecu" TEXT,
    "officerId" TEXT,
    "ownerId" TEXT,
    "mode" "PaymentMode" NOT NULL,
    "referenceExterne" TEXT,
    "montant" INTEGER NOT NULL,
    "dateHeure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" "PaymentStatus" NOT NULL DEFAULT 'en_attente',
    "canal" "PaymentChannel" NOT NULL,
    "checkoutUrl" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "paymentId" TEXT NOT NULL,
    "contraventionId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("paymentId","contraventionId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "destinataireType" "ActorType" NOT NULL,
    "destinataireId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "corps" TEXT NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Zone_code_key" ON "Zone"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Officer_matricule_key" ON "Officer"("matricule");

-- CreateIndex
CREATE INDEX "Officer_zoneId_idx" ON "Officer"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_cni_key" ON "Owner"("cni");

-- CreateIndex
CREATE INDEX "Owner_telephone_idx" ON "Owner"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_ownerId_key" ON "UserAccount"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_telephone_key" ON "UserAccount"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plaque_key" ON "Vehicle"("plaque");

-- CreateIndex
CREATE INDEX "Vehicle_ownerId_idx" ON "Vehicle"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "InfractionType_code_key" ON "InfractionType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Contravention_numero_key" ON "Contravention"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Contravention_clientUuid_key" ON "Contravention"("clientUuid");

-- CreateIndex
CREATE INDEX "Contravention_dateHeure_idx" ON "Contravention"("dateHeure");

-- CreateIndex
CREATE INDEX "Contravention_statut_idx" ON "Contravention"("statut");

-- CreateIndex
CREATE INDEX "Contravention_zoneId_dateHeure_idx" ON "Contravention"("zoneId", "dateHeure");

-- CreateIndex
CREATE INDEX "Contravention_officerId_dateHeure_idx" ON "Contravention"("officerId", "dateHeure");

-- CreateIndex
CREATE INDEX "Contravention_vehicleId_idx" ON "Contravention"("vehicleId");

-- CreateIndex
CREATE INDEX "ContraventionItem_contraventionId_idx" ON "ContraventionItem"("contraventionId");

-- CreateIndex
CREATE INDEX "ContraventionItem_infractionTypeId_idx" ON "ContraventionItem"("infractionTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_numeroRecu_key" ON "Payment"("numeroRecu");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_dateHeure_idx" ON "Payment"("dateHeure");

-- CreateIndex
CREATE INDEX "Payment_statut_dateHeure_idx" ON "Payment"("statut", "dateHeure");

-- CreateIndex
CREATE INDEX "PaymentAllocation_contraventionId_idx" ON "PaymentAllocation"("contraventionId");

-- CreateIndex
CREATE INDEX "Notification_destinataireType_destinataireId_createdAt_idx" ON "Notification"("destinataireType", "destinataireId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "Officer" ADD CONSTRAINT "Officer_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contravention" ADD CONSTRAINT "Contravention_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contravention" ADD CONSTRAINT "Contravention_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Officer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contravention" ADD CONSTRAINT "Contravention_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContraventionItem" ADD CONSTRAINT "ContraventionItem_contraventionId_fkey" FOREIGN KEY ("contraventionId") REFERENCES "Contravention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContraventionItem" ADD CONSTRAINT "ContraventionItem_infractionTypeId_fkey" FOREIGN KEY ("infractionTypeId") REFERENCES "InfractionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Officer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_contraventionId_fkey" FOREIGN KEY ("contraventionId") REFERENCES "Contravention"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
