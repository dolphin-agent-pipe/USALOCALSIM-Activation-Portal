-- Phase D: daily Wise consolidated partner payouts

CREATE TABLE "PayoutBatch" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "totalBrlCents" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "payoutDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayoutAttempt" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "wiseRecipientId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "amountBrlCents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "wiseQuoteId" TEXT,
    "wiseTransferId" TEXT,
    "wiseFeeSourceCents" INTEGER,
    "wiseRate" TEXT,
    "wiseTransferNature" TEXT,
    "wiseRawQuote" TEXT,
    "wiseRawTransfer" TEXT,
    "wiseStatusMessage" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "PayoutAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayoutBatch_partnerId_payoutDate_key" ON "PayoutBatch"("partnerId", "payoutDate");
CREATE INDEX "PayoutBatch_status_payoutDate_idx" ON "PayoutBatch"("status", "payoutDate");
CREATE UNIQUE INDEX "PayoutAttempt_wiseTransferId_key" ON "PayoutAttempt"("wiseTransferId");
CREATE INDEX "PayoutAttempt_partnerId_status_idx" ON "PayoutAttempt"("partnerId", "status");
CREATE INDEX "PayoutAttempt_batchId_idx" ON "PayoutAttempt"("batchId");

ALTER TABLE "PayoutBatch" ADD CONSTRAINT "PayoutBatch_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "PayoutAttempt_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Commission" ADD CONSTRAINT "Commission_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "PayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_payoutAttemptId_fkey" FOREIGN KEY ("payoutAttemptId") REFERENCES "PayoutAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
