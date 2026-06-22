const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3333);
loadLocalEnv();

const PRODUCTS_FILE = path.join(ROOT, "products.json");
const CATEGORIES_FILE = path.join(ROOT, "categories.json");
const ADMIN_DATA_FILE = path.join(ROOT, "admin-data.json");
const ADMIN_DIR = path.join(ROOT, "private-admin");
const PAY_DIR = path.join(ROOT, "pay");
const DEFAULT_TEXT_OVERRIDES = require("./neutral-text-overrides.json");
const BLACKCAT_API_BASE = "https://api.blackcatpay.com.br/api";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  "";
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
const NEEDS_SUPABASE_FOR_WRITE = Boolean(process.env.VERCEL && !SUPABASE_ENABLED);
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "delivery-admin";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const IS_PRODUCTION = Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const defaultData = {
  settings: {
    store: {
      browserTitle: "Zé Delivery - Bebidas e ConveniÃªncia",
      title: "Zé Delivery - Sua Bebida Gelada Online",
      brandName: "Zé Delivery",
      deliveryTime: "Entrega em atÃ© 40 min",
      deliveryLabel: "Entrega GrÃ¡tis",
      welcomeCity: "Bem-vindo!",
      distanceText: "1,9km de vocÃª",
      rating: "4,9",
      ratingCount: "(1.890 avaliaÃ§Ãµes)",
      badgeText: "Super",
      tag1: "Bebida Gelada",
      tag2: "Entrega RÃ¡pida",
      openStatus: "ABERTO 24 HORAS",
      reviewsTitle: "O que nossos clientes dizem! ðŸŒŸ",
      reviewsRecent: "412 avaliaÃ§Ãµes â€¢ Ãºltimos 90 dias",
      reviewsTotal: "1.890 avaliaÃ§Ãµes no total",
      footerCopyright: "Todos os direitos reservados.",
      responsibleWarning: "ðŸ”ž A venda e o consumo de bebidas alcoÃ³licas sÃ£o proibidos para menores de 18 anos.",
      searchPlaceholder: "Pesquise sua bebida favorita",
      cartTitle: "Seu Carrinho",
      cartButton: "Finalizar Pedido",
      cartCollapsed: "Ver meu carrinho",
      ageTitle: "VerificaÃ§Ã£o de idade",
      ageDescription: "Este site vende bebidas alcoÃ³licas.<br>VocÃª tem <strong>18 anos ou mais?</strong>",
      ageAccept: "Sim, tenho 18 anos ou mais",
      ageReject: "NÃ£o, sou menor de idade",
      ageFootnote: "Ao entrar, vocÃª concorda com nossos termos de uso e confirma ter idade legal para comprar bebidas alcoÃ³licas."
    },
    checkout: {
      browserTitle: "Finalizar Pedido - Zé Delivery",
      headerBrand: "Z Express",
      notice: "Sua bebida sempre gelada, com entrega super rÃ¡pida! ðŸ»",
      summaryToggle: "Mostrar resumo do pedido",
      detailsTitle: "Detalhes de entrega",
      loadingTitle: "Buscando o entregador mais prÃ³ximo...",
      loadingSubtitle: "Estamos localizando o melhor entregador para o seu endereÃ§o:",
      driverFoundTitle: "Entregador disponÃ­vel!",
      driverHint: "O entregador jÃ¡ estÃ¡ na sua regiÃ£o.",
      reviewTitle: "RevisÃ£o do Pedido",
      paymentTitle: "Escolha como pagar",
      pixButton: "Finalizar Compra com PIX",
      footerContact: "(99) 98500-5032",
      footerText: "Zé Delivery Â© 2025/2026 | Todos os direitos reservados",
      receiptBrand: "Zé Delivery"
    },
    textOverrides: DEFAULT_TEXT_OVERRIDES,
    payment: {
      mode: "manual",
      manualPixCode: "PIX-DEMONSTRACAO-LOCAL-SEM-VALOR-REAL",
      demoFallback: true,
      blackcat: {
        enabled: false,
        apiUrl: "",
        publicKey: "",
        merchantName: "",
        merchantDocument: ""
      }
    },
    marketing: {
      googleAdsId: "AW-18192494319",
      googleAdsInput: "AW-18192494319",
      events: {
        pageView: "gtag('event', 'conversion', { 'send_to': 'AW-18192494319/XDgFCL354sIcEO_d7eJD', 'value': 1.0, 'currency': 'BRL' });",
        addToCart: "",
        beginCheckout: "",
        purchase: "gtag('event', 'conversion', { 'send_to': 'AW-18192494319/traDCMD54sIcEO_d7eJD', 'value': 1.0, 'currency': 'BRL', 'transaction_id': '' });"
      }
    },
    supabase: {
      enabled: false,
      url: "",
      anonKey: "",
      note: "Painel operando com banco JSON local. Use supabase/schema.sql para migrar."
    }
  },
  updatedAt: new Date().toISOString()
};

function loadLocalEnv() {
  const envFile = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

function json(res, payload, status = 200) {
  send(res, status, JSON.stringify(payload, null, 2), {
    "content-type": "application/json; charset=utf-8",
  });
}

function supabaseRequired(res) {
  return json(res, {
    success: false,
    error: "Admin em produÃ§Ã£o precisa do Supabase configurado. Crie as tabelas de supabase/schema.sql e configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY na Vercel.",
  }, 503);
}

function timingSafeTextEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isAdminRequest(pathname, method) {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname === "/api/admin/bootstrap") return true;
  if ((pathname === "/api/settings" || pathname.startsWith("/api/products") || pathname.startsWith("/api/categories")) && method !== "GET") return true;
  return false;
}

function requireAdmin(req, res, pathname) {
  if (!isAdminRequest(pathname, req.method)) return true;
  if (!ADMIN_PASSWORD) {
    if (IS_PRODUCTION) {
      return json(res, { success: false, error: "ADMIN_PASSWORD nÃƒÂ£o configurado no servidor." }, 503);
    }
    return true;
  }

  const auth = String(req.headers.authorization || "");
  const [scheme, encoded] = auth.split(/\s+/, 2);
  let user = "";
  let password = "";
  if (/^basic$/i.test(scheme || "") && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    user = separator >= 0 ? decoded.slice(0, separator) : decoded;
    password = separator >= 0 ? decoded.slice(separator + 1) : "";
  }

  if (timingSafeTextEqual(user, ADMIN_USER) && timingSafeTextEqual(password, ADMIN_PASSWORD)) return true;

  res.writeHead(401, {
    "www-authenticate": 'Basic realm="Painel Admin", charset="UTF-8"',
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
  });
  res.end("AutenticaÃƒÂ§ÃƒÂ£o necessÃƒÂ¡ria.");
  return false;
}

function safeLocalPath(urlPath) {
  const normalized = urlPath === "/" ? "/index.html" : urlPath;
  const clean = path.normalize(decodeURIComponent(normalized)).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(ROOT, clean);
  return file.startsWith(ROOT) ? file : null;
}

function safeAdminPath(urlPath) {
  const adminRelative = urlPath === "/admin/" ? "/index.html" : urlPath.replace(/^\/admin/, "");
  const clean = path.normalize(decodeURIComponent(adminRelative)).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(ADMIN_DIR, clean);
  return file.startsWith(ADMIN_DIR) ? file : null;
}

function safeFlowPath(urlPath) {
  const relative = urlPath === "/etapa/" ? "/checkout.html" : urlPath.replace(/^\/etapa/, "");
  const clean = path.normalize(decodeURIComponent(relative)).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(PAY_DIR, clean);
  return file.startsWith(PAY_DIR) ? file : null;
}

function serveFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  return send(res, 200, fs.readFileSync(file), {
    "content-type": mime[ext] || "application/octet-stream",
  });
}

function servePublicFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  const cacheable = new Set([".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"]);
  return send(res, 200, fs.readFileSync(file), {
    "content-type": mime[ext] || "application/octet-stream",
    "cache-control": cacheable.has(ext) ? "public, max-age=31536000, immutable" : "no-store",
  });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return structuredClone(fallback);
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    console.error(`Erro lendo ${path.basename(file)}:`, error.message);
    return structuredClone(fallback);
  }
}

function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = deepMerge(base?.[key] || {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function loadAdminData() {
  const current = readJson(ADMIN_DATA_FILE, defaultData);
  return deepMerge(defaultData, current);
}

function saveAdminData(data) {
  const next = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  writeJson(ADMIN_DATA_FILE, next);
  return next;
}

async function supabaseRequest(table, query = "", options = {}) {
  if (!SUPABASE_ENABLED) throw new Error("Supabase nao configurado.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const detail = data?.message || data?.hint || data?.details || text || `HTTP ${response.status}`;
    throw new Error(`Supabase ${table}: ${detail}`);
  }
  return data;
}

let supabaseStorageReady = false;

async function ensureSupabaseStorageBucket() {
  if (!SUPABASE_ENABLED || supabaseStorageReady) return;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ id: SUPABASE_STORAGE_BUCKET, name: SUPABASE_STORAGE_BUCKET, public: false }),
  });
  if (!response.ok && response.status !== 400 && response.status !== 409) {
    const text = await response.text();
    throw new Error(`Supabase Storage: ${text || `HTTP ${response.status}`}`);
  }
  supabaseStorageReady = true;
}

async function loadSupabaseJson(objectName, fallback) {
  if (!SUPABASE_ENABLED) return structuredClone(fallback);
  await ensureSupabaseStorageBucket();
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${objectName}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (response.status === 404) {
    await saveSupabaseJson(objectName, fallback);
    return structuredClone(fallback);
  }
  const text = await response.text();
  if (!response.ok && /Object not found|not_found|statusCode"\s*:\s*"*404/i.test(text)) {
    await saveSupabaseJson(objectName, fallback);
    return structuredClone(fallback);
  }
  if (!response.ok) {
    throw new Error(`Supabase Storage ${objectName}: ${text || `HTTP ${response.status}`}`);
  }
  return text ? JSON.parse(text) : structuredClone(fallback);
}

async function saveSupabaseJson(objectName, data) {
  if (!SUPABASE_ENABLED) return data;
  await ensureSupabaseStorageBucket();
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${objectName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "content-type": "application/json",
      "x-upsert": "true",
    },
    body: JSON.stringify(data, null, 2),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase Storage ${objectName}: ${text || `HTTP ${response.status}`}`);
  }
  return data;
}

function storageObjectForTable(table) {
  if (table === "delivery_products") return "products.json";
  if (table === "delivery_categories") return "categories.json";
  throw new Error(`Tabela sem mapeamento de storage: ${table}`);
}

async function getSupabaseItems(table, fallbackFile) {
  if (!SUPABASE_ENABLED) return readJson(fallbackFile, []);
  const seed = readJson(fallbackFile, []);
  const items = await loadSupabaseJson(storageObjectForTable(table), seed);
  return Array.isArray(items) ? items : seed;
}

async function replaceSupabaseItems(table, items) {
  if (!SUPABASE_ENABLED) {
    writeJson(table === "delivery_products" ? PRODUCTS_FILE : CATEGORIES_FILE, items);
    return items;
  }
  await saveSupabaseJson(storageObjectForTable(table), items);
  return items;
}

async function upsertSupabaseItem(table, item) {
  const current = await getSupabaseItems(table, table === "delivery_products" ? PRODUCTS_FILE : CATEGORIES_FILE);
  const index = current.findIndex((entry) => Number(entry.id) === Number(item.id));
  if (index >= 0) current[index] = item;
  else current.push(item);
  await replaceSupabaseItems(table, current);
  return item;
}

async function deleteSupabaseItem(table, id) {
  const current = await getSupabaseItems(table, table === "delivery_products" ? PRODUCTS_FILE : CATEGORIES_FILE);
  await replaceSupabaseItems(table, current.filter((entry) => Number(entry.id) !== Number(id)));
}

async function loadSettingsData() {
  if (!SUPABASE_ENABLED) return loadAdminData();
  const seed = loadAdminData();
  const data = await loadSupabaseJson("settings.json", seed);
  return deepMerge(defaultData, data);
}

async function saveSettingsData(data) {
  const next = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  if (!SUPABASE_ENABLED) return saveAdminData(next);
  await saveSupabaseJson("settings.json", next);
  return next;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        req.destroy();
        reject(new Error("Payload muito grande."));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON invÃ¡lido."));
      }
    });
    req.on("error", reject);
  });
}

function nextId(items) {
  return Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1;
}

function normalizeProduct(input, existing = {}) {
  return {
    ...existing,
    ...input,
    id: Number(input.id ?? existing.id),
    name: String(input.name ?? existing.name ?? "").trim(),
    category: String(input.category ?? existing.category ?? "").trim(),
    image: String(input.image ?? input.image_url ?? existing.image ?? "").trim(),
    oldPrice: Number(input.oldPrice ?? existing.oldPrice ?? 0),
    newPrice: Number(input.newPrice ?? existing.newPrice ?? 0),
    stock: Number(input.stock ?? existing.stock ?? 0),
    note: String(input.note ?? existing.note ?? ""),
  };
}

function normalizeCategory(input, existing = {}) {
  return {
    ...existing,
    ...input,
    id: Number(input.id ?? existing.id),
    name: String(input.name ?? existing.name ?? "").trim(),
    image_url: String(input.image_url ?? input.image ?? existing.image_url ?? "").trim(),
  };
}

async function handleCollection(req, res, pathname, file, normalizer, itemLabel, table) {
  const match = pathname.match(/^\/api\/(products|categories)\/(\d+)$/);
  const items = await getSupabaseItems(table, file);

  if (req.method === "GET" && !match) return json(res, items);

  if (req.method === "PUT" && !match) {
    if (NEEDS_SUPABASE_FOR_WRITE) return supabaseRequired(res);
    const payload = await readBody(req);
    if (!Array.isArray(payload)) return json(res, { success: false, error: "Envie uma lista." }, 400);
    const normalized = payload.map((item) => normalizer(item)).filter((item) => item.id && item.name);
    if (SUPABASE_ENABLED) {
      await replaceSupabaseItems(table, normalized);
    } else {
      writeJson(file, normalized);
    }
    return json(res, { success: true, [itemLabel]: normalized });
  }

  if (req.method === "POST" && !match) {
    if (NEEDS_SUPABASE_FOR_WRITE) return supabaseRequired(res);
    const payload = await readBody(req);
    const item = normalizer({ ...payload, id: payload.id || nextId(items) });
    if (!item.name) return json(res, { success: false, error: "Nome Ã© obrigatÃ³rio." }, 400);
    const next = [...items, item];
    if (SUPABASE_ENABLED) {
      await upsertSupabaseItem(table, item);
    } else {
      writeJson(file, next);
    }
    return json(res, { success: true, item });
  }

  if (match) {
    const id = Number(match[2]);
    const index = items.findIndex((item) => Number(item.id) === id);
    if (index === -1) return json(res, { success: false, error: "Registro nÃ£o encontrado." }, 404);

    if (req.method === "PUT" || req.method === "PATCH") {
      if (NEEDS_SUPABASE_FOR_WRITE) return supabaseRequired(res);
      const payload = await readBody(req);
      const item = normalizer({ ...items[index], ...payload, id }, items[index]);
      items[index] = item;
      if (SUPABASE_ENABLED) {
        await upsertSupabaseItem(table, item);
      } else {
        writeJson(file, items);
      }
      return json(res, { success: true, item });
    }

    if (req.method === "DELETE") {
      if (NEEDS_SUPABASE_FOR_WRITE) return supabaseRequired(res);
      const [removed] = items.splice(index, 1);
      if (SUPABASE_ENABLED) {
        await deleteSupabaseItem(table, id);
      } else {
        writeJson(file, items);
      }
      return json(res, { success: true, item: removed });
    }
  }

  return json(res, { success: false, error: "MÃ©todo nÃ£o suportado." }, 405);
}

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");
const asText = (value) => String(value || "").trim();

function blackcatEnv() {
  const privateKey = process.env.BLACKCATPAY_PRIVATE_KEY || process.env.BLACKCATPAY_API_KEY || "";
  const publicKey = process.env.BLACKCATPAY_PUBLIC_KEY || "";
  if (!privateKey) return null;
  return { privateKey, publicKey };
}

function normalizeCustomer(customer = {}) {
  const documentNumber = onlyDigits(customer.document?.number || customer.document || customer.cpf);
  return {
    name: asText(customer.name).slice(0, 120),
    email: asText(customer.email || `cliente${Date.now()}@expressdelivery.food`).toLowerCase(),
    phone: onlyDigits(customer.phone),
    document: {
      number: documentNumber,
      type: asText(customer.document?.type || "cpf").toLowerCase() || "cpf",
    },
  };
}

function normalizeShipping(shipping = {}, customer = {}) {
  return {
    name: asText(shipping.name || customer.name).slice(0, 120),
    phone: onlyDigits(shipping.phone || customer.phone),
    street: asText(shipping.street || shipping.address),
    number: asText(shipping.number || "S/N"),
    complement: asText(shipping.complement),
    district: asText(shipping.district || shipping.neighborhood),
    neighborhood: asText(shipping.neighborhood || shipping.district),
    city: asText(shipping.city),
    state: asText(shipping.state).toUpperCase().slice(0, 2),
    zipCode: onlyDigits(shipping.zipCode || shipping.zipcode || shipping.cep),
    country: asText(shipping.country || "BR").toUpperCase(),
  };
}

function buildBlackcatSalePayload(body, amountCents) {
  let items = Array.isArray(body.items)
    ? body.items.map((item) => ({
        title: asText(item.title || item.name || "Produto").slice(0, 120),
        unitPrice: Math.max(1, Math.round(Number(item.unitPrice || item.price || 0))),
        quantity: Math.max(1, Math.round(Number(item.quantity || 1))),
        tangible: item.tangible !== false,
      }))
    : [];

  if (!items.length) {
    items = [{ title: "Pedido Zé Delivery", unitPrice: amountCents, quantity: 1, tangible: true }];
  }

  const itemTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  if (itemTotal !== amountCents) {
    items = [{ title: asText(items[0].title || "Pedido Zé Delivery").slice(0, 120), unitPrice: amountCents, quantity: 1, tangible: true }];
  }

  const customer = normalizeCustomer(body.customer || body);
  const payload = {
    amount: amountCents,
    currency: "BRL",
    paymentMethod: "pix",
    items,
    customer,
    pix: { expiresInDays: Number(body.pix?.expiresInDays || 2) },
    metadata: typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata || {}),
    externalRef: asText(body.externalRef || `ZE-${Date.now()}`),
    shipping: normalizeShipping(body.shipping || {}, customer),
  };

  if (!payload.customer.name) throw new Error("Informe o nome do comprador.");
  if (!payload.customer.email) throw new Error("Informe o e-mail do comprador.");
  if (!payload.customer.phone) throw new Error("Informe o telefone do comprador.");
  if (!payload.customer.document.number) throw new Error("Informe o CPF do comprador.");
  if (!payload.shipping.street || !payload.shipping.city || !payload.shipping.state || !payload.shipping.zipCode) {
    throw new Error("Informe o endereÃ§o completo para gerar o PIX.");
  }

  return payload;
}

function pickBlackcatPixData(data) {
  const paymentData = data?.data?.paymentData || data?.paymentData || data?.pix || data?.data?.pix || {};
  const source = data?.data || data || {};
  const code =
    paymentData.copyPaste ||
    paymentData.copy_paste ||
    paymentData.qrCodeText ||
    paymentData.qrCode ||
    source.copyPaste ||
    source.pixCode ||
    source.qrCode ||
    "";
  const image =
    paymentData.qrCodeBase64 ||
    paymentData.qr_code_base64 ||
    paymentData.qrCodeImage ||
    paymentData.qrCodeUrl ||
    source.qrCodeBase64 ||
    source.qrCodeImage ||
    "";
  return { code, image };
}

function normalizeGatewayImage(value) {
  const image = asText(value);
  if (!image) return "";
  if (/^(https?:|data:image\/)/i.test(image)) return image;
  if (/^[A-Za-z0-9+/=\s]+$/.test(image) && image.length > 120) return `data:image/png;base64,${image.replace(/\s/g, "")}`;
  return "";
}

async function createPix(req, res) {
  const adminData = await loadSettingsData();
  const payment = adminData.settings.payment || defaultData.settings.payment;
  const body = await readBody(req).catch(() => ({}));
  const amount = Number(body.amount || 0);
  const amountCents = Math.max(100, Math.round(amount * 100));

  if (payment.mode === "blackcat" && payment.blackcat?.enabled) {
    try {
      const response = await createBlackcatPix(body, amountCents);
      return json(res, {
        success: true,
        gateway: "blackcatpay",
        data: {
          transactionId: response.id,
          pix: {
            code: response.pixCode,
            base64: null,
            image: response.pixImage || null,
          },
        },
      });
    } catch (error) {
      if (!payment.demoFallback) {
        return json(res, { success: false, error: error.message }, 502);
      }
    }
  }

  return json(res, {
    success: true,
    gateway: payment.mode === "blackcat" ? "blackcat-fallback" : "manual",
    data: {
      transactionId: `local-${Date.now()}`,
      amount,
      pix: {
        code: payment.manualPixCode || defaultData.settings.payment.manualPixCode,
        base64: null,
        image: null,
      },
    },
  });
}

async function createBlackcatPix(body, amountCents) {
  const env = blackcatEnv();
  if (!env) {
    const error = new Error("BlackCatPay nÃ£o configurada no ambiente.");
    error.statusCode = 500;
    throw error;
  }

  const payload = buildBlackcatSalePayload(body, amountCents);
  const data = await postBlackcat(`${BLACKCAT_API_BASE}/sales/create-sale`, payload, env);
  const source = data.data || data;
  const transactionId = source.transactionId || source.id || source.saleId || source._id;
  const pix = pickBlackcatPixData(data);
  if (!transactionId || !pix.code) {
    const error = new Error("A BlackCatPay respondeu sem transaÃ§Ã£o ou cÃ³digo PIX.");
    error.statusCode = 502;
    throw error;
  }
  return {
    id: `blackcatpay:${transactionId}`,
    provider: "blackcatpay",
    amount: amountCents,
    pixCode: pix.code,
    pixImage: normalizeGatewayImage(pix.image),
  };
}

async function getBlackcatPaymentStatus(id) {
  const env = blackcatEnv();
  if (!env) {
    const error = new Error("BlackCatPay nÃ£o configurada no ambiente.");
    error.statusCode = 500;
    throw error;
  }

  const transactionId = String(id || "").replace(/^blackcatpay:/, "");
  if (!transactionId) return { paid: false, finalizadoSemPagar: false };

  const data = await getBlackcat(`${BLACKCAT_API_BASE}/sales/${encodeURIComponent(transactionId)}/status`, env);
  const status = String(data.data?.status || data.status || "").toUpperCase();
  return {
    paid: status === "PAID",
    finalizadoSemPagar: ["CANCELLED", "REFUNDED", "EXPIRED", "FAILED"].includes(status),
    provider: "blackcatpay",
    providerStatus: status || "PENDING",
  };
}

function postBlackcat(url, body, env) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(url);
    const payload = JSON.stringify(body);
    const headers = {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
      "X-API-Key": env.privateKey,
    };
    if (env.publicKey) headers["X-Public-Key"] = env.publicKey;
    const client = endpoint.protocol === "http:" ? http : https;
    const request = client.request(
      endpoint,
      {
        method: "POST",
        headers,
        timeout: 15000,
      },
      (response) => {
        let raw = "";
        response.on("data", (chunk) => (raw += chunk));
        response.on("end", () => {
          let parsed = {};
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            parsed = { raw };
          }
          if (response.statusCode >= 200 && response.statusCode < 300) return resolve(parsed);
          reject(new Error(parsed.error || parsed.message || `BlackCat retornou HTTP ${response.statusCode}`));
        });
      },
    );
    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy(new Error("Timeout ao chamar BlackCat."));
    });
    request.write(payload);
    request.end();
  });
}

function getBlackcat(url, env) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(url);
    const client = endpoint.protocol === "http:" ? http : https;
    const request = client.request(
      endpoint,
      {
        method: "GET",
        headers: { "X-API-Key": env.privateKey },
        timeout: 15000,
      },
      (response) => {
        let raw = "";
        response.on("data", (chunk) => (raw += chunk));
        response.on("end", () => {
          let parsed = {};
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            parsed = { message: raw };
          }
          if (response.statusCode >= 200 && response.statusCode < 300 && parsed.success !== false) return resolve(parsed);
          reject(new Error(parsed.error || parsed.message || `BlackCat retornou HTTP ${response.statusCode}`));
        });
      },
    );
    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy(new Error("Timeout ao chamar BlackCat."));
    });
    request.end();
  });
}

function proxyRemote(remoteUrl, res) {
  https
    .get(remoteUrl, (remote) => {
      if (remote.statusCode >= 300 && remote.statusCode < 400 && remote.headers.location) {
        proxyRemote(new URL(remote.headers.location, remoteUrl).toString(), res);
        return;
      }
      res.writeHead(remote.statusCode || 200, {
        "content-type": remote.headers["content-type"] || "application/octet-stream",
        "cache-control": "public, max-age=86400",
      });
      remote.pipe(res);
    })
    .on("error", (error) => {
      send(res, 502, `Proxy error: ${error.message}`, {
        "content-type": "text/plain; charset=utf-8",
      });
    });
}

async function route(req, res) {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;

  try {
    if (!requireAdmin(req, res, pathname)) return;

    if (req.method === "POST" && (pathname === "/log_ip.php" || pathname === "/api/log-data.php")) {
      await readBody(req).catch(() => ({}));
      return json(res, { success: true, localDemo: true });
    }

    if (pathname === "/admin") {
      res.writeHead(308, { location: "/admin/" });
      return res.end();
    }

    if (pathname === "/admin/" || pathname.startsWith("/admin/")) {
      let file = safeAdminPath(pathname);
      if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        file = path.join(file, "index.html");
      }
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return send(res, 404, "Admin file not found", { "content-type": "text/plain; charset=utf-8" });
      }
      return serveFile(res, file);
    }

    if (pathname === "/api/admin/bootstrap") {
      const adminData = await loadSettingsData();
      return json(res, {
        success: true,
        database: SUPABASE_ENABLED ? "supabase-storage" : "json-local",
        products: await getSupabaseItems("delivery_products", PRODUCTS_FILE),
        categories: await getSupabaseItems("delivery_categories", CATEGORIES_FILE),
        settings: adminData.settings,
        updatedAt: adminData.updatedAt,
      });
    }

    if (pathname === "/api/settings") {
      if (req.method === "GET") return json(res, (await loadSettingsData()).settings);
      if (req.method === "PUT" || req.method === "PATCH") {
        if (NEEDS_SUPABASE_FOR_WRITE) return supabaseRequired(res);
        const payload = await readBody(req);
        const current = await loadSettingsData();
        const next = await saveSettingsData({ ...current, settings: deepMerge(current.settings, payload.settings || payload) });
        return json(res, { success: true, settings: next.settings, updatedAt: next.updatedAt });
      }
      return json(res, { success: false, error: "MÃ©todo nÃ£o suportado." }, 405);
    }

    if (pathname === "/api/products" || pathname.startsWith("/api/products/")) {
      return handleCollection(req, res, pathname, PRODUCTS_FILE, normalizeProduct, "products", "delivery_products");
    }

    if (pathname === "/api/categories" || pathname.startsWith("/api/categories/")) {
      return handleCollection(req, res, pathname, CATEGORIES_FILE, normalizeCategory, "categories", "delivery_categories");
    }

    if (pathname === "/api/payment-api.php") {
      if (parsed.searchParams.get("action") === "status") {
        const id = parsed.searchParams.get("id") || "";
        if (id.startsWith("blackcatpay:")) {
          const status = await getBlackcatPaymentStatus(id);
          return json(res, { success: true, status: status.paid ? "paid" : "pending", ...status });
        }
        return json(res, { success: true, status: "pending", localDemo: true });
      }
      if (req.method === "POST" && parsed.searchParams.get("action") === "create_pix") {
        return createPix(req, res);
      }
      if (req.method === "POST") await readBody(req).catch(() => ({}));
      return json(res, { success: true, localDemo: true });
    }

    if (pathname === "/api/admin-api.php") {
      return json(res, { success: true, status: "pending", google: [], facebook: [] });
    }

    if (pathname === "/pay" || pathname.startsWith("/pay/")) {
      const destination = pathname === "/pay" || pathname === "/pay/checkout.html" ? "/etapa/" : pathname.replace(/^\/pay/, "/etapa");
      res.writeHead(308, { location: destination, "cache-control": "no-store" });
      return res.end();
    }

    if (pathname === "/etapa") {
      res.writeHead(308, { location: "/etapa/", "cache-control": "no-store" });
      return res.end();
    }

    if (pathname === "/etapa/" || pathname.startsWith("/etapa/")) {
      const file = safeFlowPath(pathname);
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return send(res, 404, "Flow file not found", { "content-type": "text/plain; charset=utf-8" });
      }
      return servePublicFile(res, file);
    }

    if (pathname === "/remote-image") {
      const remote = parsed.searchParams.get("url");
      if (!remote || !/^https?:\/\//.test(remote)) {
        return send(res, 400, "Invalid image URL", { "content-type": "text/plain; charset=utf-8" });
      }
      return proxyRemote(remote, res);
    }

    let file = safeLocalPath(pathname);
    if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
    }

    return servePublicFile(res, file);
  } catch (error) {
    console.error(error);
    return json(res, { success: false, error: error.message }, 500);
  }
}

if (!fs.existsSync(ADMIN_DATA_FILE)) {
  saveAdminData(defaultData);
}

if (require.main === module) {
  http.createServer(route).listen(PORT, () => {
    console.log(`Delivery local em http://localhost:${PORT}`);
    console.log(`Painel admin em http://localhost:${PORT}/admin/`);
    console.log(`Banco: ${SUPABASE_ENABLED ? "Supabase" : "JSON local"}`);
  });
}

module.exports = route;

