(function () {
  async function loadSettings() {
    try {
      const response = await fetch(`/api/settings?_=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const settings = await response.json();
      window.__siteSettings = settings;
      applyStore(settings.store || {});
      applyCheckout(settings.checkout || {});
      applyMarketing(settings.marketing || {});
    } catch (error) {
      console.warn("Configurações do admin não foram carregadas:", error.message);
    }
  }

  function text(selector, value) {
    if (value === undefined || value === null || value === "") return;
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function textAll(selector, values) {
    document.querySelectorAll(selector).forEach((element, index) => {
      const value = values[index];
      if (value !== undefined && value !== null && value !== "") element.textContent = value;
    });
  }

  function html(selector, value) {
    if (value === undefined || value === null || value === "") return;
    const element = document.querySelector(selector);
    if (element) element.innerHTML = value;
  }

  function attr(selector, name, value) {
    if (value === undefined || value === null || value === "") return;
    const element = document.querySelector(selector);
    if (element) element.setAttribute(name, value);
  }

  function applyStore(store) {
    if (!document.body || document.querySelector("#checkoutForm")) return;

    if (store.browserTitle) document.title = store.browserTitle;
    text("header h1", store.title);
    text("footer .font-semibold", store.brandName);
    text("footer .text-amber-100", store.footerCopyright);
    text("#localCidade", store.welcomeCity);
    text("#store-delivery-time", store.deliveryTime);
    text("#store-delivery-label", store.deliveryLabel);
    text("#store-distance-text", store.distanceText);
    text("#store-rating", store.rating);
    text("#store-rating-count", store.ratingCount);
    text("#store-badge-text", store.badgeText);
    text("#store-tag-1", store.tag1);
    text("#store-tag-2", store.tag2);
    text("#store-open-status", store.openStatus);
    text("#reviews h2", store.reviewsTitle);
    text("#reviews .text-sm.text-gray-700", store.reviewsRecent);
    text("#reviews .text-xs.text-gray-500", store.reviewsTotal);
    text("#cart-expanded h3", store.cartTitle);
    text("#cart-expanded button[onclick='goToCheckout()']", store.cartButton);
    text("#cart-collapsed .font-semibold", store.cartCollapsed);
    text("#responsible-warning", store.responsibleWarning);
    attr("#search-bar", "placeholder", store.searchPlaceholder);
    text("#age-gate h2", store.ageTitle);
    html("#age-gate p", store.ageDescription);
    text("#age-gate button:first-of-type", store.ageAccept);
    text("#age-gate button:last-of-type", store.ageReject);
    text("#age-gate .text-xs", store.ageFootnote);
  }

  function applyCheckout(checkout) {
    if (!document.querySelector("#checkoutForm")) return;

    if (checkout.browserTitle) document.title = checkout.browserTitle;
    text("header a span", checkout.headerBrand);
    text("#checkout-notice", checkout.notice);
    text("#summaryToggleText", checkout.summaryToggle);
    text("#checkout-details-title", checkout.detailsTitle);
    text("#checkout-loading-title", checkout.loadingTitle);
    text("#checkout-loading-subtitle", checkout.loadingSubtitle);
    text("#checkout-driver-title", checkout.driverFoundTitle);
    text("#driverFoundStep .bg-amber-50 p", checkout.driverHint);
    text("#checkout-review-title", checkout.reviewTitle);
    text("#checkout-payment-title", checkout.paymentTitle);
    text("#mainPayButtonText", checkout.pixButton);
    html("#checkout-footer-contact", checkout.footerContact ? `Dúvidas? Entre em contato!<br>${checkout.footerContact}` : "");
    text("#checkout-footer-text", checkout.footerText);

    window.__checkoutTextOverrides = checkout;
  }

  function normalizeAdsId(input) {
    const match = String(input || "").match(/AW-\d+/i);
    return match ? match[0].toUpperCase() : "";
  }

  function parseEventConfig(snippet, fallbackName) {
    const value = String(snippet || "").trim();
    const eventMatch = value.match(/gtag\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]/i);
    const sendToMatch =
      value.match(/send_to['"]?\s*:\s*['"]([^'"]+)['"]/i) ||
      value.match(/['"]send_to['"]\s*,\s*['"]([^'"]+)['"]/i) ||
      value.match(/(AW-\d+\/[A-Za-z0-9_-]+)/i);
    const currencyMatch = value.match(/currency['"]?\s*:\s*['"]([^'"]+)['"]/i);
    const valueMatch = value.match(/value['"]?\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);

    return {
      eventName: eventMatch?.[1] || (sendToMatch ? "conversion" : fallbackName),
      sendTo: sendToMatch?.[1] || "",
      currency: currencyMatch?.[1] || "BRL",
      value: valueMatch ? Number(valueMatch[1]) : undefined,
    };
  }

  function ensureGtag(googleAdsId) {
    if (!googleAdsId) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };

    const hasMatchingScript = [...document.scripts].some((script) =>
      script.src.includes("googletagmanager.com/gtag/js") && script.src.includes(`id=${encodeURIComponent(googleAdsId)}`)
    );
    if (!hasMatchingScript && !document.querySelector(`script[data-delivery-gtag="${googleAdsId}"]`)) {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAdsId)}`;
      script.dataset.deliveryGtag = googleAdsId;
      document.head.appendChild(script);
    }

    if (window.__deliveryGoogleAdsId !== googleAdsId) {
      window.gtag("js", new Date());
      window.gtag("config", googleAdsId);
      window.__deliveryGoogleAdsId = googleAdsId;
    }
  }

  function applyMarketing(marketing) {
    const googleAdsId = normalizeAdsId(marketing.googleAdsId || marketing.googleAdsInput);
    ensureGtag(googleAdsId);

    const events = marketing.events || {};
    window.__deliveryMarketing = {
      googleAdsId,
      events: {
        pageView: parseEventConfig(events.pageView, "conversion"),
        addToCart: parseEventConfig(events.addToCart, "add_to_cart"),
        beginCheckout: parseEventConfig(events.beginCheckout, "begin_checkout"),
        purchase: parseEventConfig(events.purchase, "purchase"),
      },
    };

    const pageView = window.__deliveryMarketing.events.pageView;
    if (pageView.sendTo && !window.__deliveryPageViewConversionSent && typeof window.gtag === "function") {
      window.__deliveryPageViewConversionSent = true;
      window.gtag("event", pageView.eventName || "conversion", {
        send_to: pageView.sendTo,
        value: pageView.value ?? 1.0,
        currency: pageView.currency || "BRL",
      });
    }
  }

  window.deliveryTrackEvent = function deliveryTrackEvent(eventKey, payload = {}) {
    const marketing = window.__deliveryMarketing || {};
    const config = marketing.events?.[eventKey] || {};
    const eventName = config.eventName || eventKey;
    const params = {
      currency: payload.currency || config.currency || "BRL",
      value: payload.value ?? config.value,
      ...payload,
    };

    if (config.sendTo) params.send_to = config.sendTo;
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSettings);
  } else {
    loadSettings();
  }
})();
