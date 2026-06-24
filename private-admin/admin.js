const state = {
  products: [],
  categories: [],
  orders: [],
  settings: {},
  updatedAt: null,
  activeTab: "overview",
  database: "json-local",
  textCatalog: [],
  textDraft: {},
  textLimit: 100,
  catalogLoaded: false,
};

const textSources = [
  { page: "store", label: "Loja", path: "/", scripts: [] },
  { page: "checkout", label: "Etapa", path: "/etapa/", scripts: ["/etapa/script.js"] },
  { page: "privacy", label: "Privacidade", path: "/privacidade.html", scripts: [] },
  { page: "returns", label: "Trocas e devoluções", path: "/trocas-devolucoes.html", scripts: [] },
];

const textPageLabels = Object.fromEntries(textSources.map((source) => [source.page, source.label]));
textPageLabels.all = "Todas";

const storeFields = [
  ["browserTitle", "Título da aba"],
  ["title", "Título principal"],
  ["brandName", "Nome da marca"],
  ["deliveryTime", "Tempo de entrega"],
  ["deliveryLabel", "Texto do frete"],
  ["welcomeCity", "Texto de localização"],
  ["distanceText", "Distância"],
  ["rating", "Nota"],
  ["ratingCount", "Quantidade de avaliações"],
  ["badgeText", "Selo"],
  ["tag1", "Tag 1"],
  ["tag2", "Tag 2"],
  ["openStatus", "Status de funcionamento"],
  ["reviewsTitle", "Título das avaliações"],
  ["reviewsRecent", "Avaliações recentes"],
  ["reviewsTotal", "Avaliações totais"],
  ["footerCopyright", "Texto do rodapé"],
  ["responsibleWarning", "Aviso de bebida alcoólica", "textarea"],
  ["searchPlaceholder", "Placeholder da busca"],
  ["cartTitle", "Título do carrinho"],
  ["cartButton", "Botão do carrinho"],
  ["cartCollapsed", "Carrinho fechado"],
  ["ageTitle", "Título da idade"],
  ["ageDescription", "Descrição da idade", "textarea"],
  ["ageAccept", "Botão aceitar idade"],
  ["ageReject", "Botão recusar idade"],
  ["ageFootnote", "Rodapé da idade", "textarea"],
];

const checkoutFields = [
  ["browserTitle", "Título da aba"],
  ["headerBrand", "Marca no topo"],
  ["notice", "Barra de aviso"],
  ["summaryToggle", "Texto do resumo"],
  ["detailsTitle", "Título dos dados"],
  ["loadingTitle", "Título buscando entregador"],
  ["loadingSubtitle", "Subtítulo buscando entregador"],
  ["driverFoundTitle", "Título entregador encontrado"],
  ["driverHint", "Aviso do entregador"],
  ["reviewTitle", "Título revisão"],
  ["paymentTitle", "Título pagamento"],
  ["pixButton", "Botão Pix"],
  ["footerContact", "Contato do rodapé"],
  ["footerText", "Texto completo do rodapé"],
  ["receiptBrand", "Marca no recibo"],
];

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindActions();
  loadAll();
});

async function loadAll() {
  try {
    const data = await api("/api/admin/bootstrap");
    state.products = data.products || [];
    state.categories = data.categories || [];
    state.orders = data.orders || [];
    state.settings = data.settings || {};
    state.updatedAt = data.updatedAt || null;
    state.database = data.database || data.state?.database || "json-local";
    if (state.catalogLoaded) hydrateTextDraftFromSettings();
    renderAll();
    if (!state.catalogLoaded) loadTextCatalog();
    toast("Dados carregados.");
  } catch (error) {
    toast(`Erro ao carregar: ${error.message}`, true);
  }
}

async function api(url, options = {}) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function bindNavigation() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => openTab(button.dataset.tab));
  });
  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => openTab(button.dataset.jump));
  });
}

function openTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active-panel", panel.id === tab));
  const active = document.querySelector(`.tab[data-tab="${tab}"] span`);
  document.getElementById("pageTitle").textContent = active?.textContent || "Painel";
}

function bindActions() {
  document.getElementById("reloadBtn").addEventListener("click", loadAll);
  document.getElementById("saveAllBtn").addEventListener("click", () => runSaveAction(saveAll));
  document.getElementById("saveProductsBtn").addEventListener("click", () => runSaveAction(saveProducts));
  document.getElementById("saveCategoriesBtn").addEventListener("click", () => runSaveAction(saveCategories));
  document.getElementById("saveStoreBtn").addEventListener("click", () => runSaveAction(() => saveSettingsSection("store", readNamedForm("storeForm"))));
  document.getElementById("saveCheckoutBtn").addEventListener("click", () => runSaveAction(() => saveSettingsSection("checkout", readNamedForm("checkoutFormAdmin"))));
  document.getElementById("saveTextOverridesBtn").addEventListener("click", () => runSaveAction(saveTextOverrides));
  document.getElementById("savePaymentBtn").addEventListener("click", () => runSaveAction(savePayment));
  document.getElementById("saveMarketingBtn").addEventListener("click", () => runSaveAction(() => saveSettingsSection("marketing", readMarketingForm())));
  document.getElementById("saveSupabaseBtn").addEventListener("click", () => runSaveAction(() => saveSettingsSection("supabase", readSupabaseForm())));
  document.getElementById("addProductBtn").addEventListener("click", addProduct);
  document.getElementById("addCategoryBtn").addEventListener("click", addCategory);
  document.getElementById("refreshOrdersBtn").addEventListener("click", () => runSaveAction(loadOrders));
  document.getElementById("orderStatusFilter").addEventListener("change", renderOrders);
  document.getElementById("ordersTable").addEventListener("click", handleOrderClick);
  document.getElementById("orderDetails").addEventListener("change", handleOrderStatusChange);
  document.getElementById("productSearch").addEventListener("input", renderProducts);
  document.getElementById("productCategoryFilter").addEventListener("change", renderProducts);
  document.getElementById("textSearch").addEventListener("input", resetTextCatalogView);
  document.getElementById("textPageFilter").addEventListener("change", resetTextCatalogView);
  document.getElementById("textChangedOnly").addEventListener("change", resetTextCatalogView);
  document.getElementById("showMoreTextsBtn").addEventListener("click", () => {
    state.textLimit += 100;
    renderUniversalTextEditor();
  });
  document.getElementById("addTextOverrideBtn").addEventListener("click", () => {
    const form = document.getElementById("manualTextOverride");
    form.hidden = !form.hidden;
  });
  document.getElementById("confirmTextOverrideBtn").addEventListener("click", addManualTextOverride);
  document.getElementById("textOverrideList").addEventListener("input", handleTextDraftInput);
  document.getElementById("textOverrideList").addEventListener("click", handleTextDraftClick);
}

async function runSaveAction(action) {
  try {
    toast("Salvando...");
    await action();
  } catch (error) {
    toast(error.message || "Não foi possível salvar.", true);
  }
}

function renderAll() {
  renderMetrics();
  renderOrders();
  renderCategoryFilter();
  renderProducts();
  renderCategories();
  renderTextForm("storeForm", storeFields, state.settings.store || {});
  renderTextForm("checkoutFormAdmin", checkoutFields, state.settings.checkout || {});
  renderUniversalTextEditor();
  renderPaymentForm();
  renderMarketingForm();
  renderSupabaseForm();
  const when = state.updatedAt ? new Date(state.updatedAt).toLocaleString("pt-BR") : "agora";
  document.getElementById("updatedAt").textContent = `Última atualização: ${when}`;
  window.lucide?.createIcons();
}

function renderMetrics() {
  const products = state.products.length;
  const categories = state.categories.length;
  const orders = state.orders.length;
  const stock = state.products.filter((product) => Number(product.stock) > 0).length;
  const pix = state.settings.payment?.mode === "blackcat" ? "BlackCat" : "Manual";
  document.getElementById("metricProducts").textContent = products;
  document.getElementById("metricOrders").textContent = orders;
  document.getElementById("metricCategories").textContent = categories;
  document.getElementById("metricStock").textContent = stock;
  document.getElementById("metricPix").textContent = pix;
  document.getElementById("overviewPix").textContent = pix;
  const usingSupabase = state.database && state.database.toLowerCase().includes("supabase");
  document.getElementById("overviewDatabase").textContent = usingSupabase ? "Supabase Storage" : "JSON local";
  document.getElementById("overviewDatabase").style.color = usingSupabase ? "#138a55" : "#c24132";
  const warning = document.getElementById("persistenceWarning");
  if (warning) warning.hidden = usingSupabase;
}

async function loadOrders() {
  const data = await api("/api/orders");
  state.orders = data.orders || [];
  renderMetrics();
  renderOrders();
  toast("Pedidos atualizados.");
}

function renderOrders() {
  const table = document.getElementById("ordersTable");
  if (!table) return;
  const status = document.getElementById("orderStatusFilter")?.value || "";
  const orders = state.orders.filter((order) => !status || order.status === status);
  const rows = orders.map((order) => {
    const total = formatMoney(order.totals?.totalCents || 0);
    const when = order.createdAt ? new Date(order.createdAt).toLocaleString("pt-BR") : "-";
    const customer = order.customer || {};
    const shipping = order.shipping || {};
    return `
      <tr data-order-id="${escapeAttr(order.id || order.transactionId)}">
        <td><span class="status-pill ${escapeAttr(order.status || "pending")}">${escapeHtml(orderStatusLabel(order.status))}</span></td>
        <td><strong>${escapeHtml(customer.name || "Cliente")}</strong><small>${escapeHtml(customer.phone || "")}</small></td>
        <td>${escapeHtml(`${shipping.city || ""}/${shipping.state || ""}`)}</td>
        <td>${escapeHtml(String((order.items || []).length))} itens</td>
        <td><strong>${total}</strong></td>
        <td>${escapeHtml(when)}</td>
        <td class="actions-cell"><button class="ghost compact" type="button" data-view-order="${escapeAttr(order.id || order.transactionId)}"><i data-lucide="eye"></i></button></td>
      </tr>`;
  }).join("");
  table.innerHTML = `
    <table>
      <thead><tr><th>Status</th><th>Cliente</th><th>Cidade</th><th>Itens</th><th>Total</th><th>Gerado em</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7">Nenhum pedido encontrado.</td></tr>`}</tbody>
    </table>`;
  window.lucide?.createIcons();
}

function handleOrderClick(event) {
  const button = event.target.closest("[data-view-order]");
  if (!button) return;
  const order = state.orders.find((item) => (item.id || item.transactionId) === button.dataset.viewOrder);
  if (order) renderOrderDetails(order);
}

function renderOrderDetails(order) {
  const details = document.getElementById("orderDetails");
  const customer = order.customer || {};
  const shipping = order.shipping || {};
  const items = order.items || [];
  const address = [
    `${shipping.street || ""}, ${shipping.number || ""}`.trim(),
    shipping.neighborhood,
    `${shipping.city || ""}/${shipping.state || ""}`,
    shipping.zipCode ? `CEP ${shipping.zipCode}` : "",
  ].filter(Boolean).join(" - ");
  details.hidden = false;
  details.innerHTML = `
    <div class="details-head">
      <div>
        <span>Pedido</span>
        <strong>${escapeHtml(order.id || order.transactionId || "-")}</strong>
      </div>
      <label>Status
        <select data-order-status="${escapeAttr(order.id || order.transactionId)}">
          ${["pending", "paid", "delivering", "completed", "cancelled"].map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${orderStatusLabel(status)}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="details-grid">
      <section>
        <h3>Cliente</h3>
        <p><b>Nome:</b> ${escapeHtml(customer.name || "-")}</p>
        <p><b>Telefone:</b> ${escapeHtml(customer.phone || "-")}</p>
        <p><b>E-mail:</b> ${escapeHtml(customer.email || "-")}</p>
        <p><b>CPF/CNPJ:</b> ${escapeHtml(customer.document || "-")}</p>
      </section>
      <section>
        <h3>Entrega</h3>
        <p>${escapeHtml(address || "-")}</p>
        <p><b>Complemento:</b> ${escapeHtml(shipping.complement || "-")}</p>
      </section>
      <section>
        <h3>Pagamento</h3>
        <p><b>Gateway:</b> ${escapeHtml(order.gateway || "-")}</p>
        <p><b>Total:</b> ${formatMoney(order.totals?.totalCents || 0)}</p>
        <p><b>Criado:</b> ${escapeHtml(order.createdAt ? new Date(order.createdAt).toLocaleString("pt-BR") : "-")}</p>
      </section>
    </div>
    <section class="items-list">
      <h3>Itens</h3>
      ${items.map((item) => `<p><span>${escapeHtml(item.quantity)}x ${escapeHtml(item.title || "Produto")}</span><strong>${formatMoney(Number(item.unitPrice || 0) * Number(item.quantity || 1))}</strong></p>`).join("") || "<p>Nenhum item registrado.</p>"}
    </section>
    <section class="pix-code-box">
      <h3>Pix copia e cola</h3>
      <textarea rows="4" readonly>${escapeHtml(order.pix?.code || "")}</textarea>
    </section>`;
  details.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleOrderStatusChange(event) {
  const select = event.target.closest("[data-order-status]");
  if (!select) return;
  const id = select.dataset.orderStatus;
  const data = await api(`/api/orders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: select.value }),
  });
  state.orders = data.orders || state.orders.map((order) => (order.id === id || order.transactionId === id ? data.order : order));
  renderMetrics();
  renderOrders();
  renderOrderDetails(data.order);
  toast("Status do pedido atualizado.");
}

function orderStatusLabel(status = "pending") {
  return {
    pending: "Pendente",
    paid: "Pago",
    delivering: "Em entrega",
    completed: "Concluido",
    cancelled: "Cancelado",
  }[status] || status;
}

function renderCategoryFilter() {
  const select = document.getElementById("productCategoryFilter");
  const current = select.value;
  select.innerHTML = `<option value="">Todas categorias</option>${state.categories
    .map((category) => `<option value="${escapeAttr(category.name)}">${escapeHtml(category.name)}</option>`)
    .join("")}`;
  select.value = current;
}

function renderProducts() {
  const query = normalize(document.getElementById("productSearch").value);
  const category = document.getElementById("productCategoryFilter").value;
  const rows = state.products
    .filter((product) => !category || product.category === category)
    .filter((product) => !query || normalize(`${product.name} ${product.category}`).includes(query))
    .map((product) => productRow(product))
    .join("");

  document.getElementById("productsTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Imagem</th><th>Nome</th><th>Categoria</th><th>Preço antigo</th><th>Preço atual</th><th>Estoque</th><th>Observação</th><th></th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="9">Nenhum produto encontrado.</td></tr>`}</tbody>
    </table>`;
  window.lucide?.createIcons();
}

function productRow(product) {
  const id = Number(product.id);
  const categoryOptions = state.categories
    .map((category) => `<option value="${escapeAttr(category.name)}" ${category.name === product.category ? "selected" : ""}>${escapeHtml(category.name)}</option>`)
    .join("");
  return `
    <tr data-product-id="${id}">
      <td class="id-cell">${id}</td>
      <td><img src="${escapeAttr(product.image || "")}" alt=""></td>
      <td><input data-field="name" value="${escapeAttr(product.name || "")}"><input data-field="image" value="${escapeAttr(product.image || "")}" placeholder="URL da imagem"></td>
      <td><select data-field="category">${categoryOptions}<option value="${escapeAttr(product.category || "")}" selected>${escapeHtml(product.category || "Sem categoria")}</option></select></td>
      <td class="number-cell"><input data-field="oldPrice" type="number" step="0.01" value="${Number(product.oldPrice || 0)}"></td>
      <td class="number-cell"><input data-field="newPrice" type="number" step="0.01" value="${Number(product.newPrice || 0)}"></td>
      <td class="number-cell"><input data-field="stock" type="number" step="1" value="${Number(product.stock || 0)}"></td>
      <td><textarea data-field="note" rows="2">${escapeHtml(product.note || "")}</textarea></td>
      <td class="actions-cell"><button class="danger" type="button" onclick="removeProduct(${id})" aria-label="Excluir produto"><i data-lucide="trash-2"></i></button></td>
    </tr>`;
}

function renderCategories() {
  const rows = state.categories
    .map((category) => `
      <tr data-category-id="${Number(category.id)}">
        <td class="id-cell">${Number(category.id)}</td>
        <td><img src="${escapeAttr(category.image_url || "")}" alt=""></td>
        <td><input data-field="name" value="${escapeAttr(category.name || "")}"></td>
        <td><input data-field="image_url" value="${escapeAttr(category.image_url || "")}"></td>
        <td class="actions-cell"><button class="danger" type="button" onclick="removeCategory(${Number(category.id)})" aria-label="Excluir categoria"><i data-lucide="trash-2"></i></button></td>
      </tr>`)
    .join("");
  document.getElementById("categoriesTable").innerHTML = `
    <table>
      <thead><tr><th>ID</th><th>Imagem</th><th>Nome</th><th>URL da imagem</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">Nenhuma categoria cadastrada.</td></tr>`}</tbody>
    </table>`;
  window.lucide?.createIcons();
}

function renderTextForm(formId, fields, values) {
  const form = document.getElementById(formId);
  form.innerHTML = fields
    .map(([name, label, type]) => {
      const value = values[name] || "";
      if (type === "textarea") {
        return `<label class="wide">${label}<textarea name="${name}" rows="3">${escapeHtml(value)}</textarea></label>`;
      }
      return `<label>${label}<input name="${name}" value="${escapeAttr(value)}"></label>`;
    })
    .join("");
}

async function loadTextCatalog() {
  const catalog = new Map();

  try {
    await Promise.all(textSources.map(async (source) => {
      const response = await fetch(`${source.path}${source.path.includes("?") ? "&" : "?"}_=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${source.label}: HTTP ${response.status}`);
      const html = await response.text();
      const documentCopy = new DOMParser().parseFromString(html, "text/html");
      collectDocumentTexts(documentCopy, source.page, "Página", catalog);
      if (source.page === "checkout") {
        documentCopy.querySelectorAll("script:not([src])").forEach((script) => {
          extractScriptTexts(script.textContent || "", source.page, catalog);
        });
      }

      await Promise.all(source.scripts.map(async (scriptPath) => {
        const scriptResponse = await fetch(`${scriptPath}?_=${Date.now()}`, { cache: "no-store" });
        if (!scriptResponse.ok) return;
        extractScriptTexts(await scriptResponse.text(), source.page, catalog);
      }));
    }));

    Object.values(state.settings.store || {}).forEach((value) => addCatalogValue(catalog, "store", value, "Configuração atual"));
    Object.values(state.settings.checkout || {}).forEach((value) => addCatalogValue(catalog, "checkout", value, "Configuração atual"));
    (state.settings.textOverrides || []).forEach((entry) => {
      addCatalogValue(catalog, entry.page || "all", entry.original, "Adicionado manualmente", true);
    });

    const pageOrder = ["store", "checkout", "privacy", "returns", "all"];
    state.textCatalog = [...catalog.values()].sort((a, b) => {
      const pageDifference = pageOrder.indexOf(a.page) - pageOrder.indexOf(b.page);
      return pageDifference || a.original.localeCompare(b.original, "pt-BR");
    });
    state.catalogLoaded = true;
    hydrateTextDraftFromSettings();
    renderUniversalTextEditor();
  } catch (error) {
    document.getElementById("textCatalogCount").textContent = `Erro ao montar catálogo: ${error.message}`;
  }
}

function collectDocumentTexts(documentCopy, page, origin, catalog) {
  addCatalogValue(catalog, page, documentCopy.title, "Título da aba");

  const ignoredTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "OPTION"]);
  const walker = documentCopy.createTreeWalker(documentCopy.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (!ignoredTags.has(node.parentElement?.tagName)) {
      addCatalogValue(catalog, page, node.nodeValue, origin);
    }
    node = walker.nextNode();
  }

  documentCopy.querySelectorAll("[placeholder], [title], [aria-label], [alt]").forEach((element) => {
    ["placeholder", "title", "aria-label", "alt"].forEach((attribute) => {
      if (element.hasAttribute(attribute)) {
        addCatalogValue(catalog, page, element.getAttribute(attribute), `Atributo ${attribute}`);
      }
    });
  });
}

function extractScriptTexts(source, page, catalog) {
  const literalPattern = /(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1/g;
  for (const match of source.matchAll(literalPattern)) {
    const quote = match[1];
    const raw = match[2];

    if (quote === "`" && raw.includes("<")) {
      const templateHtml = raw.replace(/\$\{[\s\S]*?\}/g, " ");
      const templateDocument = new DOMParser().parseFromString(templateHtml, "text/html");
      collectDocumentTexts(templateDocument, page, "Tela dinâmica", catalog);
    }

    raw.split(/\$\{[\s\S]*?\}/g).forEach((part) => {
      const value = decodeScriptText(part);
      if (isLikelyVisibleText(value)) addCatalogValue(catalog, page, value, "Mensagem dinâmica");
    });
  }
}

function decodeScriptText(value) {
  return String(value || "")
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\([\\'"`])/g, "$1");
}

function isLikelyVisibleText(value) {
  const text = cleanVisibleText(value);
  if (text.length < 2 || text.length > 400 || !/\p{L}/u.test(text)) return false;
  if (/^(?:https?:|data:|\/|\.\/|\.\.|#|\.[a-z_-]|[a-z]+\/)/i.test(text)) return false;
  if (/^(?:--|\$\{|["'\\\[\]])/.test(text)) return false;
  if (/[{}<>]|\$\{|=>|===|&&|\|\||querySelector|getElementById|console\.|document\.|window\.|application\/json|node:|(?:data-|aria-|class|onclick|alt)\s*=/i.test(text)) return false;

  const tokens = text.split(/\s+/);
  if (tokens.length >= 3) {
    const utilityTokens = tokens.filter((token) => /^(?:!?-?(?:sm:|md:|lg:|xl:)?(?:flex|grid|block|hidden|relative|absolute|fixed|items-|justify-|text-|bg-|border|rounded|shadow|hover:|focus:|p[trblxy]?-|m[trblxy]?-|w-|h-|max-|min-|gap-|space-|font-))/i.test(token));
    if (utilityTokens.length / tokens.length >= 0.45) return false;
  }
  return true;
}

function addCatalogValue(catalog, page, rawValue, origin, manual = false) {
  const original = cleanVisibleText(rawValue);
  if (!isCatalogText(original)) return;
  const key = `${page}\u0000${original}`;
  if (!catalog.has(key)) {
    catalog.set(key, {
      id: stableTextId(key),
      page,
      original,
      origin,
      manual,
    });
  }
}

function isCatalogText(value) {
  return value.length <= 1000 && isLikelyVisibleText(value);
}

function cleanVisibleText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stableTextId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `text-${(hash >>> 0).toString(36)}`;
}

function hydrateTextDraftFromSettings() {
  state.textDraft = Object.fromEntries(state.textCatalog.map((entry) => [entry.id, entry.original]));
  (state.settings.textOverrides || []).forEach((override) => {
    const entry = state.textCatalog.find((item) => item.page === (override.page || "all") && item.original === cleanVisibleText(override.original));
    if (entry) state.textDraft[entry.id] = String(override.replacement ?? "");
  });
}

function renderUniversalTextEditor() {
  const list = document.getElementById("textOverrideList");
  if (!list) return;
  if (!state.catalogLoaded) {
    list.innerHTML = '<p class="empty-catalog">Lendo todos os textos do site e do checkout...</p>';
    return;
  }

  const filtered = getFilteredTextCatalog();
  const visible = filtered.slice(0, state.textLimit);
  const changedCount = state.textCatalog.filter((entry) => currentTextDraft(entry) !== entry.original).length;
  document.getElementById("textCatalogCount").textContent = `${filtered.length} textos encontrados • ${changedCount} alterados`;

  list.innerHTML = visible.length ? visible.map((entry) => {
    const replacement = currentTextDraft(entry);
    const changed = replacement !== entry.original;
    return `
      <article class="text-override-row ${changed ? "changed" : ""}" data-text-id="${entry.id}">
        <span class="page-badge">${escapeHtml(textPageLabels[entry.page] || entry.page)}</span>
        <div class="text-origin"><span>Texto atual</span><p>${escapeHtml(entry.original)}</p></div>
        <label class="text-replacement"><span>Novo texto</span><textarea rows="2" data-text-input="${entry.id}">${escapeHtml(replacement)}</textarea></label>
        <button class="ghost reset-text" type="button" data-reset-text="${entry.id}" title="Restaurar texto original" aria-label="Restaurar texto original"><i data-lucide="undo-2"></i></button>
      </article>`;
  }).join("") : '<p class="empty-catalog">Nenhum texto corresponde a este filtro.</p>';

  const showMore = document.getElementById("showMoreTextsBtn");
  showMore.hidden = visible.length >= filtered.length;
  if (!showMore.hidden) showMore.textContent = `Mostrar mais (${filtered.length - visible.length} restantes)`;
  window.lucide?.createIcons();
}

function getFilteredTextCatalog() {
  const queries = [...new Set(String(document.getElementById("textSearch")?.value || "")
    .split(",")
    .map((query) => normalize(query.trim()))
    .filter(Boolean))];
  const page = document.getElementById("textPageFilter")?.value || "";
  const changedOnly = Boolean(document.getElementById("textChangedOnly")?.checked);
  return state.textCatalog.filter((entry) => {
    if (page && entry.page !== page && entry.page !== "all") return false;
    if (changedOnly && currentTextDraft(entry) === entry.original) return false;
    if (!queries.length) return true;
    const searchableText = normalize(`${entry.original} ${currentTextDraft(entry)} ${textPageLabels[entry.page] || entry.page}`);
    return queries.some((query) => searchableText.includes(query));
  });
}

function currentTextDraft(entry) {
  return Object.prototype.hasOwnProperty.call(state.textDraft, entry.id) ? state.textDraft[entry.id] : entry.original;
}

function resetTextCatalogView() {
  state.textLimit = 100;
  renderUniversalTextEditor();
}

function handleTextDraftInput(event) {
  const input = event.target.closest("[data-text-input]");
  if (!input) return;
  const entry = state.textCatalog.find((item) => item.id === input.dataset.textInput);
  if (!entry) return;
  state.textDraft[entry.id] = input.value;
  input.closest(".text-override-row")?.classList.toggle("changed", input.value !== entry.original);
  const changedCount = state.textCatalog.filter((item) => currentTextDraft(item) !== item.original).length;
  const filteredCount = getFilteredTextCatalog().length;
  document.getElementById("textCatalogCount").textContent = `${filteredCount} textos encontrados • ${changedCount} alterados`;
}

function handleTextDraftClick(event) {
  const button = event.target.closest("[data-reset-text]");
  if (!button) return;
  const entry = state.textCatalog.find((item) => item.id === button.dataset.resetText);
  if (!entry) return;
  state.textDraft[entry.id] = entry.original;
  renderUniversalTextEditor();
}

function addManualTextOverride() {
  const page = document.getElementById("manualTextPage").value;
  const originalInput = document.getElementById("manualTextOriginal");
  const replacementInput = document.getElementById("manualTextReplacement");
  const original = cleanVisibleText(originalInput.value);
  if (!original) {
    toast("Informe o texto atual que aparece no site.", true);
    return;
  }

  let entry = state.textCatalog.find((item) => item.page === page && item.original === original);
  if (!entry) {
    entry = { id: stableTextId(`${page}\u0000${original}`), page, original, origin: "Adicionado manualmente", manual: true };
    state.textCatalog.push(entry);
  }
  state.textDraft[entry.id] = replacementInput.value;
  originalInput.value = "";
  replacementInput.value = "";
  document.getElementById("manualTextOverride").hidden = true;
  document.getElementById("textPageFilter").value = page === "all" ? "" : page;
  document.getElementById("textSearch").value = original;
  resetTextCatalogView();
  toast("Texto adicionado. Clique em salvar todos os textos.");
}

function collectTextOverrides() {
  return state.textCatalog
    .filter((entry) => currentTextDraft(entry) !== entry.original)
    .map((entry) => ({
      id: entry.id,
      page: entry.page,
      original: entry.original,
      replacement: currentTextDraft(entry),
    }));
}

async function saveTextOverrides() {
  const overrides = collectTextOverrides();
  const data = await api("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ textOverrides: overrides }),
  });
  state.settings = data.settings;
  state.updatedAt = data.updatedAt;
  hydrateTextDraftFromSettings();
  renderUniversalTextEditor();
  toast(`${overrides.length} alterações de texto salvas e aplicadas no site.`);
}

function renderPaymentForm() {
  const form = document.getElementById("paymentForm");
  const payment = state.settings.payment || {};
  const blackcat = payment.blackcat || {};
  form.mode.value = payment.mode || "manual";
  form.manualPixCode.value = payment.manualPixCode || "";
  form.manualPixKeyType.value = payment.manualPixKeyType || "random";
  form.manualPixKey.value = payment.manualPixKey || "";
  form.manualPixMerchantName.value = payment.manualPixMerchantName || blackcat.merchantName || "";
  form.manualPixMerchantCity.value = payment.manualPixMerchantCity || "SAO PAULO";
  form.manualPixDescription.value = payment.manualPixDescription || "Pedido Digitos";
  form.blackcatEnabled.checked = Boolean(blackcat.enabled);
  form.demoFallback.checked = payment.demoFallback !== false;
  form.blackcatApiUrl.value = blackcat.apiUrl || "https://api.blackcatpay.com.br/api";
  form.blackcatPublicKey.value = blackcat.publicKey || "";
  form.blackcatMerchantName.value = blackcat.merchantName || "";
  form.blackcatMerchantDocument.value = blackcat.merchantDocument || "";
}

function renderSupabaseForm() {
  const form = document.getElementById("supabaseForm");
  const supabase = state.settings.supabase || {};
  form.enabled.checked = Boolean(supabase.enabled);
  form.url.value = supabase.url || "";
  form.anonKey.value = supabase.anonKey || "";
  form.note.value = supabase.note || "";
}

function renderMarketingForm() {
  const form = document.getElementById("marketingForm");
  const marketing = state.settings.marketing || {};
  const events = marketing.events || {};
  form.googleAdsInput.value = marketing.googleAdsInput || marketing.googleAdsId || "";
  form.pageView.value = events.pageView || "";
  form.addToCart.value = events.addToCart || "";
  form.beginCheckout.value = events.beginCheckout || "";
  form.purchase.value = events.purchase || "";
}

function addProduct() {
  const firstCategory = state.categories[0]?.name || "Ofertas";
  state.products.unshift({
    id: nextId(state.products),
    name: "Novo produto",
    category: firstCategory,
    image: "",
    oldPrice: 0,
    newPrice: 0,
    stock: 100,
    note: "",
  });
  renderMetrics();
  renderProducts();
  toast("Produto criado no painel. Clique em salvar produtos.");
}

function addCategory() {
  state.categories.push({
    id: nextId(state.categories),
    name: "Nova categoria",
    image_url: "",
  });
  renderMetrics();
  renderCategoryFilter();
  renderCategories();
  toast("Categoria criada no painel. Clique em salvar categorias.");
}

window.removeProduct = (id) => {
  if (!confirm("Excluir este produto?")) return;
  state.products = state.products.filter((product) => Number(product.id) !== Number(id));
  renderMetrics();
  renderProducts();
};

window.removeCategory = (id) => {
  if (!confirm("Excluir esta categoria? Os produtos não serão removidos.")) return;
  state.categories = state.categories.filter((category) => Number(category.id) !== Number(id));
  renderMetrics();
  renderCategoryFilter();
  renderCategories();
};

async function saveProducts() {
  readProductsTable();
  const data = await api("/api/products", {
    method: "PUT",
    body: JSON.stringify(state.products),
  });
  state.products = data.products || state.products;
  renderAll();
  toast("Produtos salvos e disponíveis no site.");
}

async function saveCategories() {
  readCategoriesTable();
  const data = await api("/api/categories", {
    method: "PUT",
    body: JSON.stringify(state.categories),
  });
  state.categories = data.categories || state.categories;
  renderAll();
  toast("Categorias salvas e disponíveis no site.");
}

async function saveSettingsSection(section, values) {
  const data = await api("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ [section]: values }),
  });
  state.settings = data.settings;
  state.updatedAt = data.updatedAt;
  renderAll();
  toast("Configuração salva e aplicada no site.");
}

async function savePayment() {
  const form = document.getElementById("paymentForm");
  const values = {
    mode: form.mode.value,
    manualPixCode: form.manualPixCode.value,
    manualPixKeyType: form.manualPixKeyType.value,
    manualPixKey: form.manualPixKey.value.trim(),
    manualPixMerchantName: form.manualPixMerchantName.value.trim(),
    manualPixMerchantCity: form.manualPixMerchantCity.value.trim(),
    manualPixDescription: form.manualPixDescription.value.trim(),
    demoFallback: form.demoFallback.checked,
    blackcat: {
      enabled: form.blackcatEnabled.checked,
      apiUrl: "https://api.blackcatpay.com.br/api",
      publicKey: form.blackcatPublicKey.value.trim(),
      merchantName: form.blackcatMerchantName.value.trim(),
      merchantDocument: form.blackcatMerchantDocument.value.trim(),
    },
  };
  await saveSettingsSection("payment", values);
}

async function saveAll() {
  readProductsTable();
  readCategoriesTable();
  await api("/api/products", { method: "PUT", body: JSON.stringify(state.products) });
  await api("/api/categories", { method: "PUT", body: JSON.stringify(state.categories) });
  const settings = {
    store: readNamedForm("storeForm"),
    checkout: readNamedForm("checkoutFormAdmin"),
    textOverrides: collectTextOverrides(),
    marketing: readMarketingForm(),
    supabase: readSupabaseForm(),
  };
  const paymentForm = document.getElementById("paymentForm");
  settings.payment = {
    mode: paymentForm.mode.value,
    manualPixCode: paymentForm.manualPixCode.value,
    manualPixKeyType: paymentForm.manualPixKeyType.value,
    manualPixKey: paymentForm.manualPixKey.value.trim(),
    manualPixMerchantName: paymentForm.manualPixMerchantName.value.trim(),
    manualPixMerchantCity: paymentForm.manualPixMerchantCity.value.trim(),
    manualPixDescription: paymentForm.manualPixDescription.value.trim(),
    demoFallback: paymentForm.demoFallback.checked,
    blackcat: {
      enabled: paymentForm.blackcatEnabled.checked,
      apiUrl: "https://api.blackcatpay.com.br/api",
      publicKey: paymentForm.blackcatPublicKey.value.trim(),
      merchantName: paymentForm.blackcatMerchantName.value.trim(),
      merchantDocument: paymentForm.blackcatMerchantDocument.value.trim(),
    },
  };
  const data = await api("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
  state.settings = data.settings;
  state.updatedAt = data.updatedAt;
  renderAll();
  toast("Tudo salvo. O site já está lendo os dados novos.");
}

function readProductsTable() {
  document.querySelectorAll("[data-product-id]").forEach((row) => {
    const id = Number(row.dataset.productId);
    const product = state.products.find((item) => Number(item.id) === id);
    if (!product) return;
    row.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      product[field] = ["oldPrice", "newPrice", "stock"].includes(field) ? Number(input.value || 0) : input.value;
    });
  });
}

function readCategoriesTable() {
  document.querySelectorAll("[data-category-id]").forEach((row) => {
    const id = Number(row.dataset.categoryId);
    const category = state.categories.find((item) => Number(item.id) === id);
    if (!category) return;
    row.querySelectorAll("[data-field]").forEach((input) => {
      category[input.dataset.field] = input.value;
    });
  });
}

function readNamedForm(formId) {
  const values = {};
  new FormData(document.getElementById(formId)).forEach((value, key) => {
    values[key] = value;
  });
  return values;
}

function readSupabaseForm() {
  const form = document.getElementById("supabaseForm");
  return {
    enabled: form.enabled.checked,
    url: form.url.value.trim(),
    anonKey: form.anonKey.value.trim(),
    note: form.note.value.trim(),
  };
}

function readMarketingForm() {
  const form = document.getElementById("marketingForm");
  const googleAdsInput = form.googleAdsInput.value.trim();
  return {
    googleAdsId: extractGoogleAdsId(googleAdsInput),
    googleAdsInput,
    events: {
      pageView: form.pageView.value.trim(),
      addToCart: form.addToCart.value.trim(),
      beginCheckout: form.beginCheckout.value.trim(),
      purchase: form.purchase.value.trim(),
    },
  };
}

function extractGoogleAdsId(value) {
  return String(value || "").match(/AW-\d+/i)?.[0]?.toUpperCase() || "";
}

function nextId(items) {
  return Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1;
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function formatMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#039;");
}

function toast(message, isError = false) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.toggle("error", Boolean(isError));
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), isError ? 7000 : 2600);
}
