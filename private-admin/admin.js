const state = {
  products: [],
  categories: [],
  settings: {},
  updatedAt: null,
  activeTab: "overview",
  database: "json-local",
};

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
    state.settings = data.settings || {};
    state.updatedAt = data.updatedAt || null;
    state.database = data.database || data.state?.database || "json-local";
    renderAll();
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
  document.getElementById("savePaymentBtn").addEventListener("click", () => runSaveAction(savePayment));
  document.getElementById("saveMarketingBtn").addEventListener("click", () => runSaveAction(() => saveSettingsSection("marketing", readMarketingForm())));
  document.getElementById("saveSupabaseBtn").addEventListener("click", () => runSaveAction(() => saveSettingsSection("supabase", readSupabaseForm())));
  document.getElementById("addProductBtn").addEventListener("click", addProduct);
  document.getElementById("addCategoryBtn").addEventListener("click", addCategory);
  document.getElementById("productSearch").addEventListener("input", renderProducts);
  document.getElementById("productCategoryFilter").addEventListener("change", renderProducts);
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
  renderCategoryFilter();
  renderProducts();
  renderCategories();
  renderTextForm("storeForm", storeFields, state.settings.store || {});
  renderTextForm("checkoutFormAdmin", checkoutFields, state.settings.checkout || {});
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
  const stock = state.products.filter((product) => Number(product.stock) > 0).length;
  const pix = state.settings.payment?.mode === "blackcat" ? "BlackCat" : "Manual";
  document.getElementById("metricProducts").textContent = products;
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

function renderPaymentForm() {
  const form = document.getElementById("paymentForm");
  const payment = state.settings.payment || {};
  const blackcat = payment.blackcat || {};
  form.mode.value = payment.mode || "manual";
  form.manualPixCode.value = payment.manualPixCode || "";
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
    marketing: readMarketingForm(),
    supabase: readSupabaseForm(),
  };
  const paymentForm = document.getElementById("paymentForm");
  settings.payment = {
    mode: paymentForm.mode.value,
    manualPixCode: paymentForm.manualPixCode.value,
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
