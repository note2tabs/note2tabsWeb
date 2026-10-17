CREATE TABLE "AccountLanguage" (
  "accountId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "locale" TEXT NOT NULL CHECK ("locale" IN ('en','es','pt-BR','fr','it','pl','ja','ko','zh-Hans','ar')),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
