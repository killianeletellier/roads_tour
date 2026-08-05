-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ConvoyStatus" AS ENUM ('draft', 'ready', 'active', 'archived');
CREATE TYPE "MemberRole" AS ENUM ('participant', 'organizer');
CREATE TYPE "OrganizerRole" AS ENUM ('lead', 'sweep', 'door');

-- CreateTable
CREATE TABLE "Convoy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessCode" TEXT NOT NULL,
    "adminPasswordHash" TEXT NOT NULL,
    "status" "ConvoyStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Convoy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "geometry" JSONB NOT NULL,
    "lengthM" DOUBLE PRECISION NOT NULL,
    "durationMin" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "POI" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "POI_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConvoyMember" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'participant',
    "organizerRole" "OrganizerRole",
    "sessionToken" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "isOffRoute" BOOLEAN NOT NULL DEFAULT false,
    "lastSeen" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConvoyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Convoy_accessCode_key" ON "Convoy"("accessCode");
CREATE INDEX "Segment_convoyId_idx" ON "Segment"("convoyId");
CREATE UNIQUE INDEX "POI_segmentId_key" ON "POI"("segmentId");
CREATE UNIQUE INDEX "ConvoyMember_sessionToken_key" ON "ConvoyMember"("sessionToken");
CREATE INDEX "ConvoyMember_convoyId_idx" ON "ConvoyMember"("convoyId");
CREATE UNIQUE INDEX "ConvoyMember_convoyId_displayName_key" ON "ConvoyMember"("convoyId", "displayName");

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "POI" ADD CONSTRAINT "POI_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConvoyMember" ADD CONSTRAINT "ConvoyMember_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
