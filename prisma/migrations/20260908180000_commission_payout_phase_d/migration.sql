-- Phase D: daily Wise consolidated partner payouts (MySQL/MariaDB)

CREATE TABLE `PayoutBatch` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CREATED',
    `totalBrlCents` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `payoutDate` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PayoutBatch_partnerId_payoutDate_key`(`partnerId`, `payoutDate`),
    INDEX `PayoutBatch_status_payoutDate_idx`(`status`, `payoutDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayoutAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `wiseRecipientId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CREATED',
    `amountBrlCents` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `wiseQuoteId` VARCHAR(191) NULL,
    `wiseTransferId` VARCHAR(191) NULL,
    `wiseFeeSourceCents` INTEGER NULL,
    `wiseRate` VARCHAR(191) NULL,
    `wiseTransferNature` VARCHAR(191) NULL,
    `wiseRawQuote` TEXT NULL,
    `wiseRawTransfer` TEXT NULL,
    `wiseStatusMessage` TEXT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `failedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PayoutAttempt_wiseTransferId_key`(`wiseTransferId`),
    INDEX `PayoutAttempt_partnerId_status_idx`(`partnerId`, `status`),
    INDEX `PayoutAttempt_batchId_idx`(`batchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PayoutBatch` ADD CONSTRAINT `PayoutBatch_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PayoutAttempt` ADD CONSTRAINT `PayoutAttempt_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `PayoutBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Commission` ADD CONSTRAINT `Commission_payoutBatchId_fkey` FOREIGN KEY (`payoutBatchId`) REFERENCES `PayoutBatch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Commission` ADD CONSTRAINT `Commission_payoutAttemptId_fkey` FOREIGN KEY (`payoutAttemptId`) REFERENCES `PayoutAttempt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
