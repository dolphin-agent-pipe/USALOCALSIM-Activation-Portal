import type { WiseConfig } from "./wise-config";

export class WiseApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "WiseApiError";
  }
}

type WiseRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT";
  path: string;
  body?: unknown;
  correlationId?: string;
};

export async function wiseRequest<T>(
  config: WiseConfig,
  options: WiseRequestOptions,
): Promise<T> {
  const url = `${config.baseUrl}${options.path.startsWith("/") ? "" : "/"}${options.path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };
  if (options.correlationId) {
    headers["X-External-Correlation-Id"] = options.correlationId;
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new WiseApiError(`Wise API ${options.method ?? "GET"} ${options.path} failed`, res.status, text);
  }

  if (!text) return {} as T;
  return JSON.parse(text) as T;
}
