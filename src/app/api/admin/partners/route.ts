import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-server";
import { getRequestClientMeta } from "@/lib/request-meta";
import { DEFAULT_PARTNER_COMMISSION_BRL_CENTS } from "@/lib/partner-inventory";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  countryCode: z.string().trim().length(2).default("BR"),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  phoneE164: z.string().trim().max(32).optional().nullable().or(z.literal("")),
  defaultCommissionCents: z.number().int().min(0).max(10_000_000).optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partners = await prisma.partner.findMany({
    orderBy: { name: "asc" },
    include: {
      payoutProfile: {
        select: {
          id: true,
          taxIdType: true,
          taxId: true,
          wiseRecipientId: true,
          accountHolderName: true,
        },
      },
      _count: {
        select: { vouchers: true, stores: true, users: true },
      },
    },
  });

  return NextResponse.json(partners);
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const partner = await prisma.partner.create({
    data: {
      name: body.name,
      countryCode: (body.countryCode || "BR").toUpperCase(),
      email: body.email?.trim() || null,
      phoneE164: body.phoneE164?.trim() || null,
      defaultCommissionCents: body.defaultCommissionCents ?? DEFAULT_PARTNER_COMMISSION_BRL_CENTS,
      active: body.active ?? true,
    },
  });

  const { ip, userAgent } = getRequestClientMeta(req);
  await prisma.auditLog.create({
    data: {
      action: "partner_create",
      userId: session.user.id,
      metadata: JSON.stringify({ partnerId: partner.id, name: partner.name, ip, userAgent }),
    },
  });

  return NextResponse.json(partner);
}
