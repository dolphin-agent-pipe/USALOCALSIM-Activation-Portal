-- Partner commission Phase A: partners, payout profiles, voucher assignment

CREATE TABLE `Partner` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `countryCode` VARCHAR(2) NOT NULL DEFAULT 'BR',
    `email` VARCHAR(191) NULL,
    `phoneE164` VARCHAR(191) NULL,
    `defaultCommissionCents` INTEGER NOT NULL DEFAULT 6000,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PartnerStore` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `PartnerStore_partnerId_idx`(`partnerId`),
    CONSTRAINT `PartnerStore_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PartnerUser` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'dealer',

    PRIMARY KEY (`id`),
    UNIQUE INDEX `PartnerUser_partnerId_userId_key`(`partnerId`, `userId`),
    INDEX `PartnerUser_userId_idx`(`userId`),
    CONSTRAINT `PartnerUser_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `PartnerUser_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PartnerPayoutProfile` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `payoutMethod` VARCHAR(191) NOT NULL DEFAULT 'wise_br_bank',
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
    `legalType` VARCHAR(191) NOT NULL,
    `accountHolderName` VARCHAR(191) NOT NULL,
    `taxId` VARCHAR(191) NOT NULL,
    `taxIdType` VARCHAR(191) NOT NULL,
    `bankCode` VARCHAR(191) NULL,
    `branchCode` VARCHAR(191) NULL,
    `accountNumber` VARCHAR(191) NULL,
    `accountType` VARCHAR(191) NULL,
    `addressLine1` VARCHAR(191) NULL,
    `addressCity` VARCHAR(191) NULL,
    `addressState` VARCHAR(191) NULL,
    `addressPostCode` VARCHAR(191) NULL,
    `addressCountry` VARCHAR(2) NULL DEFAULT 'BR',
    `wiseRecipientId` VARCHAR(191) NULL,
    `wiseRecipientStatus` VARCHAR(191) NULL,
    `wiseRecipientRaw` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `PartnerPayoutProfile_partnerId_key`(`partnerId`),
    UNIQUE INDEX `PartnerPayoutProfile_wiseRecipientId_key`(`wiseRecipientId`),
    INDEX `PartnerPayoutProfile_payoutMethod_idx`(`payoutMethod`),
    CONSTRAINT `PartnerPayoutProfile_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VoucherAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `voucherId` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NULL,
    `storeId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `batchLabel` VARCHAR(191) NULL,
    `serialFrom` VARCHAR(191) NULL,
    `serialTo` VARCHAR(191) NULL,
    `assignedById` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `VoucherAssignment_voucherId_createdAt_idx`(`voucherId`, `createdAt`),
    INDEX `VoucherAssignment_partnerId_idx`(`partnerId`),
    CONSTRAINT `VoucherAssignment_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `Voucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `VoucherAssignment_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable Voucher
ALTER TABLE `Voucher` ADD COLUMN `inventoryStatus` VARCHAR(191) NOT NULL DEFAULT 'UNASSIGNED',
    ADD COLUMN `partnerId` VARCHAR(191) NULL,
    ADD COLUMN `storeId` VARCHAR(191) NULL,
    ADD COLUMN `assignedAt` DATETIME(3) NULL,
    ADD COLUMN `saleTransactionId` VARCHAR(191) NULL,
    ADD COLUMN `soldAt` DATETIME(3) NULL;

CREATE INDEX `Voucher_inventoryStatus_idx` ON `Voucher`(`inventoryStatus`);
CREATE INDEX `Voucher_partnerId_idx` ON `Voucher`(`partnerId`);
CREATE INDEX `Voucher_storeId_idx` ON `Voucher`(`storeId`);

ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `PartnerStore`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable PrepaidCard
ALTER TABLE `PrepaidCard` ADD COLUMN `partnerId` VARCHAR(191) NULL;
CREATE INDEX `PrepaidCard_partnerId_idx` ON `PrepaidCard`(`partnerId`);
ALTER TABLE `PrepaidCard` ADD CONSTRAINT `PrepaidCard_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `Partner_active_idx` ON `Partner`(`active`);
