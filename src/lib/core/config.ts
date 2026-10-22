export type CoreConfig = {
  baseUrl: string;
  email: string;
  /** Dashboard API token — sent as `password` to POST /token (PDF Token Generation). */
  apiToken: string;
  /**
   * When true, skip POST /token and use `apiToken` as the Bearer value.
   * Useful when the dashboard already issues a JWT-style API token.
   */
  useStaticBearer: boolean;
  /** Dev/offline: never call Core HTTP; top-up jobs complete via fixtures. */
  simulate: boolean;
};

export function isCoreTopupsEnabled(): boolean {
  return process.env.CORE_TOPUPS_ENABLED === "true";
}

/**
 * Offline / fixture mode. Ignored when live top-ups are enabled in production
 * so a mis-set env cannot invent SUCCESS without calling Core.
 */
export function isCoreSimulateMode(): boolean {
  if (process.env.CORE_TOPUPS_SIMULATE !== "true") return false;
  if (isCoreTopupsEnabled() && process.env.NODE_ENV === "production") {
    return false;
  }
  return true;
}

const DEFAULT_UAT_BASE = "https://ctop-api.core-retail.com/api/uat";

export function getCoreConfig(): CoreConfig | null {
  const email = process.env.CORE_API_EMAIL?.trim();
  const apiToken = process.env.CORE_API_TOKEN?.trim();
  const simulate = isCoreSimulateMode();

  // Simulate may run without real credentials (unit tests / offline).
  if (!simulate && (!email || !apiToken)) return null;
  if (simulate && !email && !apiToken) {
    return {
      baseUrl: (process.env.CORE_API_BASE_URL?.trim() || DEFAULT_UAT_BASE).replace(/\/$/, ""),
      email: "simulate@local",
      apiToken: "simulate",
      useStaticBearer: true,
      simulate: true,
    };
  }
  if (!email || !apiToken) return null;

  const baseUrl = process.env.CORE_API_BASE_URL?.trim() || DEFAULT_UAT_BASE;

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    email,
    apiToken,
    useStaticBearer: process.env.CORE_API_USE_STATIC_BEARER === "true",
    simulate,
  };
}

export function isCoreConfigured(): boolean {
  return getCoreConfig() !== null;
}

/** UAT base paths use `uat-transaction`; production uses `transaction`. */
export function coreTransactionPath(baseUrl: string): string {
  const normalized = baseUrl.toLowerCase();
  if (normalized.includes("/uat") || normalized.endsWith("uat")) {
    return "/uat-transaction";
  }
  return "/transaction";
}
