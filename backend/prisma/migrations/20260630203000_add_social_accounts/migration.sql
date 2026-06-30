-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiry" DATETIME,
    "tokenExpiringNotifiedAt" DATETIME,
    "lastTotalViews" INTEGER NOT NULL DEFAULT 0,
    "lastFollowerCount" INTEGER NOT NULL DEFAULT 0,
    "lastEngagementRate" REAL NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialMetricSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "socialAccountId" TEXT NOT NULL,
    "totalViews" INTEGER NOT NULL,
    "followerCount" INTEGER NOT NULL,
    "engagementRate" REAL NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialMetricSnapshot_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SocialAccount_userId_provider_idx" ON "SocialAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_userId_provider_externalAccountId_key" ON "SocialAccount"("userId", "provider", "externalAccountId");

-- CreateIndex
CREATE INDEX "SocialMetricSnapshot_socialAccountId_recordedAt_idx" ON "SocialMetricSnapshot"("socialAccountId", "recordedAt");
