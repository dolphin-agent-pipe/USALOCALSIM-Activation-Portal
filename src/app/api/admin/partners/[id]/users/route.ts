import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-server";

const linkSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["dealer", "manager"]).optional(),
});

const unlinkSchema = z.object({
  userId: z.string().min(1),
});

type Ctx = { params: { id: string } };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: partnerId } = ctx.params;
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  let body: z.infer<typeof linkSchema>;
  try {
    body = linkSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, role: true, disabled: true },
  });
  if (!user || user.disabled) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const link = await prisma.partnerUser.upsert({
    where: { partnerId_userId: { partnerId, userId: body.userId } },
    create: {
      partnerId,
      userId: body.userId,
      role: body.role ?? "dealer",
    },
    update: { role: body.role ?? "dealer" },
    include: {
      user: { select: { id: true, email: true, name: true, role: true } },
    },
  });

  return NextResponse.json(link);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: partnerId } = ctx.params;
  let body: z.infer<typeof unlinkSchema>;
  try {
    body = unlinkSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await prisma.partnerUser.deleteMany({
    where: { partnerId, userId: body.userId },
  });

  return NextResponse.json({ ok: true });
}
