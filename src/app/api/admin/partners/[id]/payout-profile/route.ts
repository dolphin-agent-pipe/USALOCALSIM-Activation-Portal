import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-server";
import { getRequestClientMeta } from "@/lib/request-meta";
import { normalizeTaxId } from "@/lib/partner-inventory";
import { ensureWiseRecipientForPartner } from "@/lib/wise-recipient";
import { isWiseConfigured } from "@/lib/wise-config";

const profileSchema = z.object({
  legalType: z.enum(["PRIVATE", "BUSINESS"]),
  accountHolderName: z.string().trim().min(1).max(200),
  taxId: z.string().trim().min(11).max(32),
  bankCode: z.string().trim().max(16).optional().nullable().or(z.literal("")),
  branchCode: z.string().trim().max(16).optional().nullable().or(z.literal("")),
  accountNumber: z.string().trim().max(32).optional().nullable().or(z.literal("")),
  accountType: z.string().trim().max(32).optional().nullable().or(z.literal("")),
  addressLine1: z.string().trim().max(200).optional().nullable().or(z.literal("")),
  addressCity: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  addressState: z.string().trim().max(8).optional().nullable().or(z.literal("")),
  addressPostCode: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  addressCountry: z.string().trim().length(2).optional().nullable().or(z.literal("")),
});

type Ctx = { params: { id: string } };

function emptyToNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export async function PUT(req: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: partnerId } = ctx.params;
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
  if (!partner) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }

  let body: z.infer<typeof profileSchema>;
  try {
    body = profileSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const tax = normalizeTaxId(body.taxId);
  if (!tax) {
    return NextResponse.json(
      { error: "taxId must be a valid CPF (11 digits) or CNPJ (14 digits)." },
      { status: 400 },
    );
  }

  const data = {
    payoutMethod: "wise_br_bank",
    currency: "BRL",
    legalType: body.legalType,
    accountHolderName: body.accountHolderName,
    taxId: tax.taxId,
    taxIdType: tax.taxIdType,
    bankCode: emptyToNull(body.bankCode),
    branchCode: emptyToNull(body.branchCode),
    accountNumber: emptyToNull(body.accountNumber),
    accountType: emptyToNull(body.accountType),
    addressLine1: emptyToNull(body.addressLine1),
    addressCity: emptyToNull(body.addressCity),
    addressState: emptyToNull(body.addressState)?.toUpperCase() ?? null,
    addressPostCode: emptyToNull(body.addressPostCode),
    addressCountry: (emptyToNull(body.addressCountry) || "BR").toUpperCase(),
    // Bank detail changes invalidate any previous Wise recipient until Phase D recreates it.
    wiseRecipientId: null as string | null,
    wiseRecipientStatus: null as string | null,
    wiseRecipientRaw: null as string | null,
    verifiedAt: null as Date | null,
  };

  await prisma.partnerPayoutProfile.upsert({
    where: { partnerId },
    create: { partnerId, ...data },
    update: data,
  });

  const { ip, userAgent } = getRequestClientMeta(req);
  await prisma.auditLog.create({
    data: {
      action: "partner_payout_profile_upsert",
      userId: session.user.id,
      metadata: JSON.stringify({
        partnerId,
        taxIdType: tax.taxIdType,
        bankCode: data.bankCode,
        ip,
        userAgent,
      }),
    },
  });

  let wiseRecipient: { ok: boolean; wiseRecipientId?: string; error?: string } | null = null;
  if (isWiseConfigured() && data.bankCode && data.branchCode && data.accountNumber) {
    const result = await ensureWiseRecipientForPartner(partnerId);
    wiseRecipient = result.ok
      ? { ok: true, wiseRecipientId: result.wiseRecipientId }
      : { ok: false, error: result.error };
  }

  const refreshed = await prisma.partnerPayoutProfile.findUniqueOrThrow({
    where: { partnerId },
  });

  return NextResponse.json({
    ...refreshed,
    wiseRecipient,
  });
}
