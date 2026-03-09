-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_ip_day_key" ON "RateLimit"("ip", "day");
