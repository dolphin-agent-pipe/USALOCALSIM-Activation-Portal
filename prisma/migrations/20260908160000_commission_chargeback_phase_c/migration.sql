-- Partner commission Phase C: chargeback balances and offset allocations

ALTER TABLE `Commission` ADD COLUMN `offsetAppliedBrlCents` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `PartnerChargebackBalance` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `sourceCommissionId` VARCHAR(191) NOT NULL,
    `voucherSerialSnapshot` VARCHAR(191) NULL,
    `remainingBrlCents` INTEGER NOT NULL,
    `originalBrlCents` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `reason` VARCHAR(191) NOT NULL DEFAULT 'customer_refund',
    `refundExternalRef` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PartnerChargebackBalance_sourceCommissionId_key`(`sourceCommissionId`),
    INDEX `PartnerChargebackBalance_partnerId_status_idx`(`partnerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommissionOffsetAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `chargebackBalanceId` VARCHAR(191) NOT NULL,
    `oldCommissionId` VARCHAR(191) NOT NULL,
    `newCommissionId` VARCHAR(191) NOT NULL,
    `amountBrlCents` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CommissionOffsetAllocation_oldCommissionId_idx`(`oldCommissionId`),
    INDEX `CommissionOffsetAllocation_newCommissionId_idx`(`newCommissionId`),
    INDEX `CommissionOffsetAllocation_chargebackBalanceId_idx`(`chargebackBalanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PartnerChargebackBalance` ADD CONSTRAINT `PartnerChargebackBalance_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PartnerChargebackBalance` ADD CONSTRAINT `PartnerChargebackBalance_sourceCommissionId_fkey` FOREIGN KEY (`sourceCommissionId`) REFERENCES `Commission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CommissionOffsetAllocation` ADD CONSTRAINT `CommissionOffsetAllocation_chargebackBalanceId_fkey` FOREIGN KEY (`chargebackBalanceId`) REFERENCES `PartnerChargebackBalance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CommissionOffsetAllocation` ADD CONSTRAINT `CommissionOffsetAllocation_oldCommissionId_fkey` FOREIGN KEY (`oldCommissionId`) REFERENCES `Commission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CommissionOffsetAllocation` ADD CONSTRAINT `CommissionOffsetAllocation_newCommissionId_fkey` FOREIGN KEY (`newCommissionId`) REFERENCES `Commission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
