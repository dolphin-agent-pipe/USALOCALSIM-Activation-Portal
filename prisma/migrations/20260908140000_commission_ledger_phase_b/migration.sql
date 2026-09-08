-- Partner commission Phase B: commission ledger

CREATE TABLE `Commission` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_FUNDS',
    `amountBrlCents` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `voucherId` VARCHAR(191) NOT NULL,
    `voucherSerialSnapshot` VARCHAR(191) NULL,
    `cartPurchaseId` VARCHAR(191) NULL,
    `saleTransactionId` VARCHAR(191) NOT NULL,
    `paymentProvider` VARCHAR(191) NOT NULL,
    `saleAmountCents` INTEGER NULL,
    `saleCurrency` VARCHAR(3) NULL,
    `customerCountry` VARCHAR(2) NULL,
    `soldAt` DATETIME(3) NOT NULL,
    `fundsAvailableAt` DATETIME(3) NULL,
    `eligibleAt` DATETIME(3) NULL,
    `payoutBatchId` VARCHAR(191) NULL,
    `payoutAttemptId` VARCHAR(191) NULL,
    `chargebackOfCommissionId` VARCHAR(191) NULL,
    `refundExternalRef` VARCHAR(191) NULL,
    `failureReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Commission_voucherId_key`(`voucherId`),
    UNIQUE INDEX `Commission_cartPurchaseId_key`(`cartPurchaseId`),
    UNIQUE INDEX `Commission_saleTransactionId_key`(`saleTransactionId`),
    INDEX `Commission_partnerId_status_idx`(`partnerId`, `status`),
    INDEX `Commission_status_soldAt_idx`(`status`, `soldAt`),
    INDEX `Commission_payoutBatchId_idx`(`payoutBatchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommissionStatusEvent` (
    `id` VARCHAR(191) NOT NULL,
    `commissionId` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CommissionStatusEvent_commissionId_createdAt_idx`(`commissionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Commission` ADD CONSTRAINT `Commission_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Commission` ADD CONSTRAINT `Commission_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `Voucher`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Commission` ADD CONSTRAINT `Commission_cartPurchaseId_fkey` FOREIGN KEY (`cartPurchaseId`) REFERENCES `ShopPurchase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CommissionStatusEvent` ADD CONSTRAINT `CommissionStatusEvent_commissionId_fkey` FOREIGN KEY (`commissionId`) REFERENCES `Commission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
