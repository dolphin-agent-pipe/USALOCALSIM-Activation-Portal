import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-server";
import { getRequestClientMeta } from "@/lib/request-meta";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  countryCode: z.string().trim().length(2).optional(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  phoneE164: z.string().trim().max(32).optional().nullable().or(z.literal("")),
  defaultCommissionCents: z.number().int().min(0).max(10_000_000).optional(),
  active: z.boolean().optional(),
});

type Ctx = { params: { id: string } };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = ctx.params;
  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      payoutProfile: true,
      stores: { orderBy: { name: "asc" } },
      users: {
        include: {
          user: { select: { id: true, email: true, name: true, role: true, disabled: true } },
        },
      },
      _count: { select: { vouchers: true } },
    },
  });

  if (!partner) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }

  return NextResponse.json(partner);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = ctx.params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const existing = await prisma.partner.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }

  const partner = await prisma.partner.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.countryCode !== undefined ? { countryCode: body.countryCode.toUpperCase() } : {}),
      ...(body.email !== undefined ? { email: body.email?.trim() || null } : {}),
      ...(body.phoneE164 !== undefined ? { phoneE164: body.phoneE164?.trim() || null } : {}),
      ...(body.defaultCommissionCents !== undefined
        ? { defaultCommissionCents: body.defaultCommissionCents }
        : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
  });

  const { ip, userAgent } = getRequestClientMeta(req);
  await prisma.auditLog.create({
    data: {
      action: "partner_update",
      userId: session.user.id,
      metadata: JSON.stringify({ partnerId: id, patch: body, ip, userAgent }),
    },
  });

  return NextResponse.json(partner);
}
