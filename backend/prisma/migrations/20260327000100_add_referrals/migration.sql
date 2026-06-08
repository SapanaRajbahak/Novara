CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

ALTER TABLE "User"
ADD COLUMN "referralCode" TEXT,
ADD COLUMN "referredBy" TEXT,
ADD COLUMN "signupIp" TEXT,
ADD COLUMN "referralCashEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "aiCredits" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Referral" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "rewardAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rewardCredits" INTEGER NOT NULL DEFAULT 0,
  "rewardGiven" BOOLEAN NOT NULL DEFAULT false,
  "referredUniqueReaders" INTEGER NOT NULL DEFAULT 0,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");

CREATE INDEX "User_referredBy_idx" ON "User"("referredBy");
CREATE INDEX "User_referralCode_idx" ON "User"("referralCode");
CREATE INDEX "Referral_referrerId_status_idx" ON "Referral"("referrerId", "status");
CREATE INDEX "Referral_status_createdAt_idx" ON "Referral"("status", "createdAt");

ALTER TABLE "User"
ADD CONSTRAINT "User_referredBy_fkey" FOREIGN KEY ("referredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Referral"
ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Referral"
ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
