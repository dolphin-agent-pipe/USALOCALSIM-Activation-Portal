export function getAsaasApiKey(): string | null {
  const key = process.env.ASAAS_API_KEY?.trim();
  return key || null;
}

export function getAsaasApiBaseUrl(): string {
  const custom = process.env.ASAAS_API_BASE_URL?.trim();
  if (custom) return custom.replace(/\/$/, "");
  const env = process.env.ASAAS_ENV?.trim().toLowerCase();
  if (env === "production" || env === "prod") {
    return "https://api.asaas.com";
  }
  return "https://api-sandbox.asaas.com";
}

export function isAsaasDirectConfigured(): boolean {
  return Boolean(getAsaasApiKey());
}
