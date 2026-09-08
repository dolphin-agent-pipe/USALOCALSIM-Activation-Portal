import { prisma } from "@/lib/db";
import {
  isAssignmentLocked,
  VOUCHER_ASSIGNMENT_ACTION,
  VOUCHER_INVENTORY_STATUS,
} from "@/lib/partner-inventory";

export type AssignBySerialInput = {
  partnerId: string | null;
  storeId?: string | null;
  serialFrom?: string | null;
  serialTo?: string | null;
  serials?: string[];
  batchLabel?: string | null;
  note?: string | null;
  assignedById?: string | null;
};

export type AssignResult = {
  matched: number;
  updated: number;
  skippedLocked: number;
  skippedMissing: number;
  voucherIds: string[];
};

function normalizeSerialList(serials: string[] | undefined): string[] {
  if (!serials?.length) return [];
  const out = new Set<string>();
  for (const raw of serials) {
    const s = raw.trim();
    if (s) out.add(s);
  }
  return Array.from(out);
}

/**
 * Assign / unassign / reassign prepaid vouchers by serial list or inclusive serial range.
 * Locked inventory (SOLD / REDEEMED / CANCELLED) is never reassigned.
 */
export async function assignVouchersBySerial(input: AssignBySerialInput): Promise<AssignResult> {
  const serialList = normalizeSerialList(input.serials);
  const serialFrom = input.serialFrom?.trim() || null;
  const serialTo = input.serialTo?.trim() || null;

  if (!serialList.length && (!serialFrom || !serialTo)) {
    throw new Error("Provide serials[] or both serialFrom and serialTo.");
  }

  if (input.partnerId) {
    const partner = await prisma.partner.findUnique({
      where: { id: input.partnerId },
      select: { id: true, active: true },
    });
    if (!partner) throw new Error("Partner not found.");
    if (!partner.active) throw new Error("Partner is inactive.");
  }

  let storeId: string | null = input.storeId?.trim() || null;
  if (storeId) {
    if (!input.partnerId) throw new Error("storeId requires partnerId.");
    const store = await prisma.partnerStore.findFirst({
      where: { id: storeId, partnerId: input.partnerId, active: true },
      select: { id: true },
    });
    if (!store) throw new Error("Store not found for this partner.");
  } else {
    storeId = null;
  }

  const cards =
    serialList.length > 0
      ? await prisma.prepaidCard.findMany({
          where: { serial: { in: serialList } },
          select: {
            id: true,
            serial: true,
            voucherId: true,
            voucher: {
              select: {
                id: true,
                partnerId: true,
                inventoryStatus: true,
                paymentStatus: true,
                status: true,
              },
            },
          },
        })
      : await prisma.prepaidCard.findMany({
          where: {
            serial: {
              gte: serialFrom! <= serialTo! ? serialFrom! : serialTo!,
              lte: serialFrom! <= serialTo! ? serialTo! : serialFrom!,
            },
          },
          select: {
            id: true,
            serial: true,
            voucherId: true,
            voucher: {
              select: {
                id: true,
                partnerId: true,
                inventoryStatus: true,
                paymentStatus: true,
                status: true,
              },
            },
          },
        });

  const foundSerials = new Set(cards.map((c) => c.serial));
  const skippedMissing =
    serialList.length > 0 ? serialList.filter((s) => !foundSerials.has(s)).length : 0;

  let updated = 0;
  let skippedLocked = 0;
  const voucherIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const card of cards) {
      const v = card.voucher;
      const locked =
        isAssignmentLocked(v.inventoryStatus) ||
        v.paymentStatus === true ||
        v.status === "redeemed";

      if (locked) {
        skippedLocked += 1;
        continue;
      }

      const previousPartnerId = v.partnerId;
      let action: string;
      if (!input.partnerId) {
        action = VOUCHER_ASSIGNMENT_ACTION.UNASSIGNED;
      } else if (previousPartnerId && previousPartnerId !== input.partnerId) {
        action = VOUCHER_ASSIGNMENT_ACTION.REASSIGNED;
      } else if (previousPartnerId === input.partnerId) {
        action = VOUCHER_ASSIGNMENT_ACTION.ASSIGNED;
      } else {
        action = VOUCHER_ASSIGNMENT_ACTION.ASSIGNED;
      }

      const nextInventory = input.partnerId
        ? VOUCHER_INVENTORY_STATUS.ASSIGNED
        : VOUCHER_INVENTORY_STATUS.UNASSIGNED;

      await tx.voucher.update({
        where: { id: v.id },
        data: {
          partnerId: input.partnerId,
          storeId: input.partnerId ? storeId : null,
          assignedAt: input.partnerId ? new Date() : null,
          inventoryStatus: nextInventory,
        },
      });

      await tx.prepaidCard.update({
        where: { id: card.id },
        data: { partnerId: input.partnerId },
      });

      await tx.voucherAssignment.create({
        data: {
          voucherId: v.id,
          partnerId: input.partnerId,
          storeId: input.partnerId ? storeId : null,
          action,
          batchLabel: input.batchLabel?.trim() || null,
          serialFrom: serialFrom,
          serialTo: serialTo,
          assignedById: input.assignedById ?? null,
          note: input.note?.trim() || null,
        },
      });

      updated += 1;
      voucherIds.push(v.id);
    }
  });

  return {
    matched: cards.length,
    updated,
    skippedLocked,
    skippedMissing,
    voucherIds,
  };
}
