-- AlterTable
ALTER TABLE "ReadingListItem" ADD COLUMN     "collection" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progress" INTEGER;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "accessUrl" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedYear" INTEGER,
ADD COLUMN     "publisher" TEXT,
ADD COLUMN     "tags" TEXT[];

-- CreateTable
CREATE TABLE "ResourceView" (
    "userId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceView_pkey" PRIMARY KEY ("userId","resourceId")
);

-- CreateIndex
CREATE INDEX "ResourceView_userId_viewedAt_idx" ON "ResourceView"("userId", "viewedAt");

-- AddForeignKey
ALTER TABLE "ResourceView" ADD CONSTRAINT "ResourceView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceView" ADD CONSTRAINT "ResourceView_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

