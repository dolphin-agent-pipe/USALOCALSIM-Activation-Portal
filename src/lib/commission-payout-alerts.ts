import { formatBrlFromCents } from "./partner-inventory";
import type { DailyPayoutRunSummary, PartnerPayoutRunResult } from "./partner-daily-payout";

function getAlertRecipients(): string[] {
  const raw = process.env.COMMISSION_ALERT_EMAIL?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function sendAlertEmail(subject: string, text: string): Promise<{ sent: boolean }> {
  const recipients = getAlertRecipients();
  if (!recipients.length) return { sent: false };

  const from = process.env.EMAIL_FROM ?? "noreply@usalocalsim.com";

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({ from, to: recipients, subject, text }),
      });
      return { sent: res.ok };
    } catch {
      return { sent: false };
    }
  }

  return { sent: false };
}

function summarizeFailures(partners: PartnerPayoutRunResult[]): string {
  return partners
    .filter((p) => p.status === "failed")
    .map(
      (p) =>
        `- ${p.partnerName} (${p.partnerId}): ${p.reason ?? "unknown"}` +
        (p.totalBrlCents != null ? ` · ${formatBrlFromCents(p.totalBrlCents)}` : ""),
    )
    .join("\n");
}

export async function alertOnDailyPayoutRun(summary: DailyPayoutRunSummary): Promise<void> {
  const failed = summary.partners.filter((p) => p.status === "failed");
  if (!failed.length) return;

  const body =
    `Daily partner payout run for ${summary.payoutDate} completed with ${failed.length} failure(s).\n\n` +
    summarizeFailures(summary.partners) +
    "\n\nReview batches at /admin/payouts and audit logs.";

  await sendAlertEmail(`[USALOCALSIM] ${failed.length} payout failure(s) – ${summary.payoutDate}`, body);
}

export async function alertOnStuckProcessingBatches(
  batches: Array<{ id: string; partnerName: string; payoutDate: string; wiseTransferId: string | null }>,
): Promise<void> {
  if (!batches.length) return;

  const body =
    `${batches.length} payout batch(es) have been PROCESSING for longer than the alert threshold.\n\n` +
    batches
      .map(
        (b) =>
          `- ${b.partnerName} · ${b.payoutDate} · batch ${b.id}` +
          (b.wiseTransferId ? ` · Wise ${b.wiseTransferId}` : ""),
      )
      .join("\n") +
    "\n\nUse Sync Wise on /admin/payouts or check the Wise dashboard.";

  await sendAlertEmail(`[USALOCALSIM] ${batches.length} stuck payout batch(es)`, body);
}

export function getCommissionAlertRecipients(): string[] {
  return getAlertRecipients();
}
