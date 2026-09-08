import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-server";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(64).optional().nullable().or(z.literal("")),
  active: z.boolean().optional(),
});

type Ctx = { params: { id: string } };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: partnerId } = ctx.params;
  const stores = await prisma.partnerStore.findMany({
    where: { partnerId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(stores);
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: partnerId } = ctx.params;
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const store = await prisma.partnerStore.create({
    data: {
      partnerId,
      name: body.name,
      code: body.code?.trim() || null,
      active: body.active ?? true,
    },
  });

  return NextResponse.json(store);
}
