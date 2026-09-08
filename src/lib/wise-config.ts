export type WiseConfig = {
  baseUrl: string;
  token: string;
  profileId: number;
  sourceCurrency: string;
  transferNature: string;
  simulate: boolean;
};

export function isCommissionPayoutsEnabled(): boolean {
  return process.env.COMMISSION_PAYOUTS_ENABLED === "true";
}

export function isWiseSimulateMode(): boolean {
  return process.env.COMMISSION_PAYOUTS_SIMULATE === "true";
}

export function getWiseConfig(): WiseConfig | null {
  const token = process.env.WISE_API_TOKEN?.trim();
  const profileIdRaw = process.env.WISE_PROFILE_ID?.trim();
  if (!token || !profileIdRaw) return null;

  const profileId = Number(profileIdRaw);
  if (!Number.isFinite(profileId) || profileId <= 0) return null;

  const baseUrl =
    process.env.WISE_API_BASE_URL?.trim() || "https://api.sandbox.transferwise.tech";

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    token,
    profileId,
    sourceCurrency: (process.env.WISE_SOURCE_CURRENCY?.trim() || "USD").toUpperCase(),
    transferNature: process.env.WISE_TRANSFER_NATURE?.trim() || "SERVICES",
    simulate: isWiseSimulateMode(),
  };
}

export function isWiseConfigured(): boolean {
  return getWiseConfig() !== null;
}
