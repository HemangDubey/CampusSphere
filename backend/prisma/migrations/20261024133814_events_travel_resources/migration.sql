-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('TECHNICAL', 'CULTURAL', 'SPORTS', 'WORKSHOP', 'SYMPOSIUM');

-- CreateEnum
CREATE TYPE "EventMode" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "DestinationType" AS ENUM ('HERITAGE', 'NATURE', 'SPIRITUAL', 'BEACH', 'CITY');

-- CreateEnum
CREATE TYPE "BudgetCategory" AS ENUM ('BUDGET', 'MODERATE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('DEPARTMENT', 'LIBRARY', 'FACILITY', 'SUPPORT', 'LINK', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "mode" "EventMode" NOT NULL DEFAULT 'IN_PERSON',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "venue" TEXT NOT NULL,
    "capacity" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "type" "DestinationType" NOT NULL,
    "budget" "BudgetCategory" NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budgetMinInr" INTEGER NOT NULL,
    "budgetMaxInr" INTEGER NOT NULL,
    "recommendedDays" INTEGER NOT NULL,
    "tips" TEXT[],
    "isDemo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteDestination" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "kind" "ResourceKind" NOT NULL,
    "category" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");

-- CreateIndex
CREATE INDEX "Event_category_idx" ON "Event"("category");

-- CreateIndex
CREATE INDEX "EventRegistration_eventId_idx" ON "EventRegistration"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_userId_eventId_key" ON "EventRegistration"("userId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_slug_key" ON "Destination"("slug");

-- CreateIndex
CREATE INDEX "Destination_type_idx" ON "Destination"("type");

-- CreateIndex
CREATE INDEX "Destination_budget_idx" ON "Destination"("budget");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteDestination_userId_destinationId_key" ON "FavoriteDestination"("userId", "destinationId");

-- CreateIndex
CREATE INDEX "Resource_kind_idx" ON "Resource"("kind");

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteDestination" ADD CONSTRAINT "FavoriteDestination_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteDestination" ADD CONSTRAINT "FavoriteDestination_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
