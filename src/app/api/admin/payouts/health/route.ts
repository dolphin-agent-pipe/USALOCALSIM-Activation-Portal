import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { getCommissionPayoutHealth } from "@/lib/commission-payout-health";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const health = await getCommissionPayoutHealth();
  return NextResponse.json(health);
}
