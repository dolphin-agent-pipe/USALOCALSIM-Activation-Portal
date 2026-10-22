-- Core C-TOP top-up jobs (scaffold; live submit after IP whitelist)

CREATE TABLE `CoreTopupJob` (
    `id` VARCHAR(191) NOT NULL,
    `cartPurchaseId` VARCHAR(191) NULL,
    `voucherId` VARCHAR(191) NULL,
    `activationRequestId` VARCHAR(191) NULL,
    `mobile` VARCHAR(20) NOT NULL,
    `opcode` VARCHAR(16) NOT NULL,
    `typeTxn` VARCHAR(16) NOT NULL,
    `amountMajor` DOUBLE NOT NULL,
    `refTxnId` VARCHAR(20) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `coreTransactionId` VARCHAR(64) NULL,
    `coreStatus` INTEGER NULL,
    `coreMessage` TEXT NULL,
    `requestPayload` TEXT NULL,
    `responsePayload` TEXT NULL,
    `callbackPayload` TEXT NULL,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `lastAttemptAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `failedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CoreTopupJob_refTxnId_key`(`refTxnId`),
    INDEX `CoreTopupJob_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `CoreTopupJob_cartPurchaseId_idx`(`cartPurchaseId`),
    INDEX `CoreTopupJob_voucherId_idx`(`voucherId`),
    INDEX `CoreTopupJob_coreTransactionId_idx`(`coreTransactionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
