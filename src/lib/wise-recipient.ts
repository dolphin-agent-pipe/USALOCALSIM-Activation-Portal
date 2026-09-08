import type { PartnerPayoutProfile } from "@prisma/client";
import { prisma } from "./db";
import { getWiseConfig } from "./wise-config";
import { wiseRequest } from "./wise-client";

type WiseRecipientResponse = {
  id: number;
  active?: boolean;
  [key: string]: unknown;
};

function mapAccountType(accountType: string | null): string {
  const t = accountType?.trim().toUpperCase();
  if (t === "SAVINGS" || t === "POUPANCA" || t === "POUPANÇA") return "SAVINGS";
  return "CHECKING";
}

function buildRecipientPayload(profile: PartnerPayoutProfile, profileId: number) {
  const details: Record<string, string> = {};
  if (profile.taxIdType === "CPF") {
    details.cpf = profile.taxId;
  } else {
    details.cnpj = profile.taxId;
  }
  if (profile.bankCode) details.bankCode = profile.bankCode;
  if (profile.branchCode) details.branchCode = profile.branchCode;
  if (profile.accountNumber) details.accountNumber = profile.accountNumber;
  details.accountType = mapAccountType(profile.accountType);

  const address: Record<string, string> = {};
  if (profile.addressLine1) address.addressLine = profile.addressLine1;
  if (profile.addressCity) address.city = profile.addressCity;
  if (profile.addressState) address.state = profile.addressState;
  if (profile.addressPostCode) address.postCode = profile.addressPostCode;
  if (profile.addressCountry) address.country = profile.addressCountry;

  if (Object.keys(address).length) {
    details.address = address as unknown as string;
  }

  return {
    currency: "BRL",
    type: "brazil",
    profile: profileId,
    accountHolderName: profile.accountHolderName,
    legalType: profile.legalType,
    details,
  };
}

export type EnsureWiseRecipientResult =
  | { ok: true; wiseRecipientId: string; created: boolean }
  | { ok: false; error: string };

/**
 * Create or reuse a Wise BRL bank recipient for a partner payout profile.
 */
export async function ensureWiseRecipientForPartner(
  partnerId: string,
): Promise<EnsureWiseRecipientResult> {
  const config = getWiseConfig();
  if (!config) {
    return { ok: false, error: "wise_not_configured" };
  }

  const profile = await prisma.partnerPayoutProfile.findUnique({
    where: { partnerId },
  });
  if (!profile) {
    return { ok: false, error: "payout_profile_missing" };
  }
  if (!profile.bankCode || !profile.branchCode || !profile.accountNumber) {
    return { ok: false, error: "bank_details_incomplete" };
  }

  if (profile.wiseRecipientId) {
    return { ok: true, wiseRecipientId: profile.wiseRecipientId, created: false };
  }

  const payload = buildRecipientPayload(profile, config.profileId);
  const recipient = await wiseRequest<WiseRecipientResponse>(config, {
    method: "POST",
    path: "/v1/accounts",
    body: payload,
    correlationId: `partner-recipient-${partnerId}`,
  });

  const wiseRecipientId = String(recipient.id);
  await prisma.partnerPayoutProfile.update({
    where: { partnerId },
    data: {
      wiseRecipientId,
      wiseRecipientStatus: recipient.active === false ? "inactive" : "active",
      wiseRecipientRaw: JSON.stringify(recipient),
      verifiedAt: new Date(),
    },
  });

  return { ok: true, wiseRecipientId, created: true };
}
