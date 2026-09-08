import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-server";
import { getRequestClientMeta } from "@/lib/request-meta";
import { assignVouchersBySerial } from "@/lib/partner-assign";

const assignSchema = z
  .object({
    partnerId: z.string().min(1).nullable(),
    storeId: z.string().min(1).optional().nullable(),
    serialFrom: z.string().optional().nullable(),
    serialTo: z.string().optional().nullable(),
    serials: z.array(z.string()).optional(),
    batchLabel: z.string().max(120).optional().nullable(),
    note: z.string().max(2000).optional().nullable(),
  })
  .refine(
    (b) =>
      (Array.isArray(b.serials) && b.serials.some((s) => s.trim())) ||
      (Boolean(b.serialFrom?.trim()) && Boolean(b.serialTo?.trim())),
    { message: "Provide serials or serialFrom+serialTo" },
  );

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof assignSchema>;
  try {
    body = assignSchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : "Invalid body";
    return NextResponse.json({ error: msg ?? "Invalid body" }, { status: 400 });
  }

  try {
    const result = await assignVouchersBySerial({
      partnerId: body.partnerId,
      storeId: body.storeId,
      serialFrom: body.serialFrom,
      serialTo: body.serialTo,
      serials: body.serials,
      batchLabel: body.batchLabel,
      note: body.note,
      assignedById: session.user.id,
    });

    const { ip, userAgent } = getRequestClientMeta(req);
    await prisma.auditLog.create({
      data: {
        action: body.partnerId ? "partner_voucher_assign" : "partner_voucher_unassign",
        userId: session.user.id,
        metadata: JSON.stringify({
          partnerId: body.partnerId,
          storeId: body.storeId,
          serialFrom: body.serialFrom,
          serialTo: body.serialTo,
          serialCount: body.serials?.length ?? null,
          result,
          ip,
          userAgent,
        }),
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assignment failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const partnerId = url.searchParams.get("partnerId");
  const take = Math.min(Number(url.searchParams.get("limit") || 50), 200);

  const rows = await prisma.voucherAssignment.findMany({
    where: partnerId ? { partnerId } : undefined,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      voucher: {
        select: {
          id: true,
          code: true,
          inventoryStatus: true,
          prepaidCard: { select: { serial: true } },
        },
      },
      partner: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(rows);
}
