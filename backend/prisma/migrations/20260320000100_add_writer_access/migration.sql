ALTER TABLE "User"
ADD COLUMN "isWriter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "penName" TEXT,
ADD COLUMN "bio" TEXT,
ADD COLUMN "preferredGenres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "User_isWriter_idx" ON "User"("isWriter");