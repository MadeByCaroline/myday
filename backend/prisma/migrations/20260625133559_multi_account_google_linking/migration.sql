-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OAuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" DATETIME,
    "scope" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OAuthToken" ("accessToken", "createdAt", "expiresAt", "id", "provider", "refreshToken", "scope", "updatedAt", "userId") SELECT "accessToken", "createdAt", "expiresAt", "id", "provider", "refreshToken", "scope", "updatedAt", "userId" FROM "OAuthToken";
DROP TABLE "OAuthToken";
ALTER TABLE "new_OAuthToken" RENAME TO "OAuthToken";
CREATE UNIQUE INDEX "OAuthToken_userId_provider_email_key" ON "OAuthToken"("userId", "provider", "email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
