-- Phase F: cron job locks for idempotent commission payouts

CREATE TABLE `CronJobLock` (
    `lockKey` VARCHAR(191) NOT NULL,
    `ownerToken` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`lockKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `CronJobLock_expiresAt_idx` ON `CronJobLock`(`expiresAt`);
