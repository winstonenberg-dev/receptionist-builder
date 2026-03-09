-- Recreate RateLimit with projectId (table is ephemeral — safe to drop)
DROP TABLE IF EXISTS "RateLimit";

CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RateLimit_ip_projectId_day_key" ON "RateLimit"("ip", "projectId", "day");
