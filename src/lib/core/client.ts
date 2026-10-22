import { coreTransactionPath, type CoreConfig } from "./config";
import {
  CORE_FIXTURE_NETWORK_LIST,
  CORE_FIXTURE_THREE_BUNDLE_SKUS,
  CORE_FIXTURE_TOKEN_RESPONSE,
  coreFixtureTransactionSuccess,
} from "./fixtures";
import type {
  CoreNetworkListResponse,
  CoreNetworkSkuResponse,
  CoreTokenResponse,
  CoreTransactionRequest,
  CoreTransactionResponse,
} from "./types";

export class CoreApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "CoreApiError";
  }
}

type BearerCache = {
  token: string;
  /** Epoch ms; null = unknown / treat as session-long */
  expiresAtMs: number | null;
};

let bearerCache: BearerCache | null = null;

/** Test helper — clears in-memory bearer cache. */
export function clearCoreBearerCache(): void {
  bearerCache = null;
}

function decodeJwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as {
      exp?: number;
    };
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

async function coreFetch(
  config: CoreConfig,
  path: string,
  init: RequestInit & { bearer?: string } = {},
): Promise<{ status: number; text: string }> {
  const url = `${config.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.bearer) {
    headers.Authorization = `Bearer ${init.bearer}`;
  }
  if (init.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
  });
  const text = await res.text();
  return { status: res.status, text };
}

function parseJsonOrThrow<T>(path: string, status: number, text: string): T {
  if (status < 200 || status >= 300) {
    throw new CoreApiError(`Core API ${path} failed`, status, text);
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CoreApiError(`Core API ${path} returned non-JSON`, status, text);
  }
}

/**
 * Exchange dashboard credentials for a short-lived Bearer token (POST /token).
 * PDF: `email` + `password` (API panel token).
 */
export async function fetchCoreBearerToken(config: CoreConfig): Promise<string> {
  if (config.simulate) {
    return CORE_FIXTURE_TOKEN_RESPONSE.data!.token!;
  }
  if (config.useStaticBearer) {
    return config.apiToken;
  }

  const { status, text } = await coreFetch(config, "/token", {
    method: "POST",
    body: JSON.stringify({
      email: config.email,
      password: config.apiToken,
    }),
  });

  const json = parseJsonOrThrow<CoreTokenResponse>("/token", status, text);
  const token = json.data?.token?.trim();
  if (!json.success || !token) {
    throw new CoreApiError(
      `Core token exchange failed: ${json.message ?? "no token"}`,
      status,
      text,
    );
  }
  return token;
}

export async function getCoreBearerToken(config: CoreConfig): Promise<string> {
  if (config.simulate) {
    return CORE_FIXTURE_TOKEN_RESPONSE.data!.token!;
  }
  if (config.useStaticBearer) {
    return config.apiToken;
  }

  const now = Date.now();
  if (bearerCache?.token && (bearerCache.expiresAtMs == null || bearerCache.expiresAtMs > now + 60_000)) {
    return bearerCache.token;
  }

  const token = await fetchCoreBearerToken(config);
  bearerCache = {
    token,
    expiresAtMs: decodeJwtExpMs(token),
  };
  return token;
}

export async function coreGetNetworkList(config: CoreConfig): Promise<CoreNetworkListResponse> {
  if (config.simulate) return CORE_FIXTURE_NETWORK_LIST;

  const bearer = await getCoreBearerToken(config);
  const { status, text } = await coreFetch(config, "/networklist", { bearer });
  return parseJsonOrThrow<CoreNetworkListResponse>("/networklist", status, text);
}

export async function coreGetNetworkSku(
  config: CoreConfig,
  opcode: string,
  typeTxn: string,
): Promise<CoreNetworkSkuResponse> {
  if (config.simulate) {
    if (opcode === "3NETWORK") return CORE_FIXTURE_THREE_BUNDLE_SKUS;
    return { ...CORE_FIXTURE_THREE_BUNDLE_SKUS, message: `Offer List (${opcode})` };
  }

  const bearer = await getCoreBearerToken(config);
  const qs = new URLSearchParams({ opcode, type_txn: typeTxn });
  const path = `/networksku?${qs.toString()}`;
  const { status, text } = await coreFetch(config, path, { bearer });
  return parseJsonOrThrow<CoreNetworkSkuResponse>(path, status, text);
}

export async function coreCreateTransaction(
  config: CoreConfig,
  body: CoreTransactionRequest,
): Promise<CoreTransactionResponse> {
  if (config.simulate) {
    return coreFixtureTransactionSuccess(body.ref_txn_id);
  }

  const bearer = await getCoreBearerToken(config);
  const path = coreTransactionPath(config.baseUrl);
  const { status, text } = await coreFetch(config, path, {
    method: "POST",
    bearer,
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow<CoreTransactionResponse>(path, status, text);
}
