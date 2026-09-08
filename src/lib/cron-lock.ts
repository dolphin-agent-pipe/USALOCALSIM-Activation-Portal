import { randomUUID } from "crypto";
import { prisma } from "./db";

export type CronLockAcquireResult =
  | { acquired: true; ownerToken: string }
  | { acquired: false; reason: "locked"; expiresAt: Date | null };

const DEFAULT_TTL_SECONDS = 60 * 60;

function ttlSeconds(): number {
  const raw = Number(process.env.COMMISSION_CRON_LOCK_TTL_SECONDS ?? String(DEFAULT_TTL_SECONDS));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_SECONDS;
}

export async function acquireCronLock(lockKey: string): Promise<CronLockAcquireResult> {
  const ownerToken = randomUUID();
  const expiresAt = new Date(Date.now() + ttlSeconds() * 1000);

  await prisma.cronJobLock.deleteMany({
    where: { lockKey, expiresAt: { lt: new Date() } },
  });

  try {
    await prisma.cronJobLock.create({
      data: { lockKey, ownerToken, expiresAt },
    });
    return { acquired: true, ownerToken };
  } catch {
    const existing = await prisma.cronJobLock.findUnique({ where: { lockKey } });
    if (!existing) {
      return { acquired: false, reason: "locked", expiresAt: null };
    }
    if (existing.expiresAt <= new Date()) {
      await prisma.cronJobLock.delete({ where: { lockKey } });
      return acquireCronLock(lockKey);
    }
    return { acquired: false, reason: "locked", expiresAt: existing.expiresAt };
  }
}

export async function releaseCronLock(lockKey: string, ownerToken: string): Promise<void> {
  await prisma.cronJobLock.deleteMany({
    where: { lockKey, ownerToken },
  });
}

export async function isCronLockHeld(lockKey: string): Promise<boolean> {
  const row = await prisma.cronJobLock.findUnique({ where: { lockKey } });
  if (!row) return false;
  if (row.expiresAt <= new Date()) {
    await prisma.cronJobLock.delete({ where: { lockKey } });
    return false;
  }
  return true;
}

export function dailyPayoutLockKey(payoutDate: Date): string {
  return `daily_payout:${payoutDate.toISOString().slice(0, 10)}`;
}

export function partnerPayoutLockKey(partnerId: string, payoutDate: Date): string {
  return `partner_payout:${partnerId}:${payoutDate.toISOString().slice(0, 10)}`;
}

export const PROMOTE_ELIGIBLE_LOCK_KEY = "promote_eligible_commissions";
