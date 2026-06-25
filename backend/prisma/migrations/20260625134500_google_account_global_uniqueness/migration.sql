-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_provider_email_key" ON "OAuthToken"("provider", "email");
