(() => {
  "use strict";

  const SCALE = 10n ** 18n;
  const ENTRY_Y = 190;
  const CHART_WIDTH = 720;
  const CHART_HEIGHT = 420;
  const EPOCH_SECONDS = 900;
  const TOPBLAST_MINT = "FsiDU4zcDKvuZRk3Ft4RHnRczKh4TdSi5GpdynkCuCTS";
  const EMBER_MINT = "5dvXTZ5qwgafnHtwu3Ls3QrWx1U4LQsFeCuJgkk4QEC6";
  const JUPITER_TOKEN_API = "https://lite-api.jup.ag/tokens/v2/search";
  const config = window.__TOPBLAST_PUBLIC_CONFIG__ || window.__TOPLAST_PUBLIC_CONFIG__ || {};
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const elements = Object.fromEntries([
    "blast-chart", "buy-markers", "chart-shell", "chart-mode", "price-line", "price-area", "price-point", "price-point-halo",
    "entry-line", "current-label", "zone-status", "zone-copy", "chart-caption", "chart-price", "blast-alert", "blast-alert-wallet",
    "wallet-form", "wallet-address", "wallet-message", "data-status", "indexed-time", "position-grid", "tracked-balance",
    "tracked-entry", "current-price", "position-change", "position-status", "blast-depth", "next-epoch", "total-airdropped",
    "account-note", "copy-mint", "zone-wallet-count", "top-blast-count", "global-airdrop-total", "leaderboard-status",
    "leaderboard-list", "feed-status", "airdrop-feed", "history-status", "airdrop-history", "market-data-status",
    "market-topblast-price", "market-topblast-move", "market-ember-price", "market-ember-move", "market-epoch-count",
    "market-airdrop-total", "market-next-epoch"
  ].map(id => [id, document.getElementById(id)]));

  let protocol = null;
  let epochPrices = [];
  let recentBuys = [];
  let marketPriceSamples = [];
  let selectedEntryRaw = null;
  let selectedWallet = null;
  let selectedWalletLoaded = false;
  let previewFrame = 0;
  let lastPreviewPaint = 0;
  let showingFinalizedData = false;
  let protocolLoading = false;
  let initialBuyIndexLoaded = false;
  let knownBuyIds = new Set();
  let blastAlertTimer = 0;

  function asRaw(value, positive = false) {
    const text = typeof value === "bigint" ? value.toString() : String(value ?? "");
    if (!/^\d{1,78}$/.test(text)) return null;
    const result = BigInt(text);
    return positive && result === 0n ? null : result;
  }

  function pathFrom(points) {
    return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  }

  function setChartState(blasted, currentY) {
    elements["chart-shell"].dataset.state = blasted ? "blasted" : "clear";
    elements["zone-status"].textContent = blasted ? "BLASTED" : "CLEAR";
    elements["zone-status"].dataset.state = blasted ? "blasted" : "clear";
    elements["zone-copy"].textContent = blasted
      ? "Below the line. Inside the Blast Zone."
      : "Above the line. Outside the Blast Zone.";
    const top = Math.min(86, Math.max(9, currentY / CHART_HEIGHT * 100));
    elements["current-label"].style.top = `calc(${top.toFixed(2)}% - .8rem)`;
  }

  function paintPreview(now = 0) {
    const phase = now / 1700;
    const points = [];
    for (let index = 0; index < 37; index += 1) {
      const x = index / 36 * CHART_WIDTH;
      const wave = Math.sin(index * .42 + phase) * 32 + Math.sin(index * .17 - phase * .7) * 23;
      const drift = Math.sin(phase * .72) * 47 + (index / 36 - .5) * Math.sin(phase * .38) * 28;
      points.push([x, ENTRY_Y - wave - drift]);
    }
    const line = pathFrom(points);
    const current = points.at(-1);
    elements["price-line"].setAttribute("d", line);
    elements["price-area"].setAttribute("d", `${line} L${CHART_WIDTH} ${CHART_HEIGHT} L0 ${CHART_HEIGHT} Z`);
    for (const id of ["price-point", "price-point-halo"]) {
      elements[id].setAttribute("cx", String(current[0]));
      elements[id].setAttribute("cy", String(current[1]));
    }
    setChartState(current[1] > ENTRY_Y, current[1]);
  }

  function previewLoop(now) {
    if (showingFinalizedData) return;
    if (now - lastPreviewPaint > 70) {
      paintPreview(now);
      lastPreviewPaint = now;
    }
    previewFrame = window.requestAnimationFrame(previewLoop);
  }

  function startPreview() {
    showingFinalizedData = true;
    window.cancelAnimationFrame(previewFrame);
    elements["entry-line"].hidden = true;
    document.querySelector(".blast-field").hidden = true;
    document.querySelector(".entry-label").hidden = true;
    document.querySelector(".zone-label").hidden = true;
    elements["buy-markers"].replaceChildren();
    elements["price-line"].setAttribute("d", "");
    elements["price-area"].setAttribute("d", "");
    elements["chart-shell"].dataset.state = "market";
    elements["blast-chart"].setAttribute("aria-label", "TOPBLAST market data loading");
    elements["chart-mode"].textContent = "LOADING TOPBLAST MARKET";
    elements["zone-status"].textContent = "DATA PENDING";
    delete elements["zone-status"].dataset.state;
    elements["zone-copy"].textContent = "Loading the real TOPBLAST test-token price.";
    elements["chart-caption"].textContent = "No sample prices. Waiting for verified market data.";
    elements["chart-price"].textContent = "—";
  }

  function executionPrice(buy) {
    const amount = asRaw(buy.amount_toplast_raw, true);
    const paid = asRaw(buy.amount_ember_raw, true);
    return amount && paid ? paid * SCALE / amount : null;
  }

  function renderBuyMarkers(yFor, xFor) {
    elements["buy-markers"].replaceChildren();
    for (const buy of [...recentBuys].reverse()) {
      const price = executionPrice(buy);
      if (!price) continue;
      const x = xFor(Date.parse(buy.occurred_at));
      const y = Math.min(CHART_HEIGHT - 18, Math.max(18, yFor(price)));
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
      marker.classList.add("blast-marker");
      marker.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.classList.add("blast-marker-ring");
      ring.setAttribute("r", "10");
      const core = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      core.classList.add("blast-marker-core");
      core.setAttribute("r", "4.5");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `TOP BLAST by ${shortWallet(buy.wallet)}`;
      marker.append(title, ring, core);
      elements["buy-markers"].append(marker);
    }
  }

  function renderIndexedChart(entryRaw = null) {
    const series = epochPrices.map(row => ({
      value: asRaw(row.reference_price_raw, true),
      time: Date.parse(row.created_at)
    })).filter(point => point.value && Number.isFinite(point.time));
    const currentPrice = asRaw(protocol?.current_price_raw, true);
    const currentTime = Date.parse(protocol?.current_price_time || protocol?.indexed_through_time || "");
    if (currentPrice && Number.isFinite(currentTime)) series.push({ value: currentPrice, time: currentTime });
    series.sort((a, b) => a.time - b.time);
    if (series.length < 2) return false;

    const values = series.map(point => point.value);
    const buyPrices = recentBuys.map(executionPrice).filter(Boolean);
    const entry = asRaw(entryRaw, true);
    const all = [...values, ...buyPrices, ...(entry ? [entry] : [])];
    let minimum = all.reduce((a, b) => a < b ? a : b);
    let maximum = all.reduce((a, b) => a > b ? a : b);
    if (minimum === maximum) { minimum -= 1n; maximum += 1n; }
    const padding = (maximum - minimum) / 10n || 1n;
    minimum = minimum > padding ? minimum - padding : 0n;
    maximum += padding;
    const spread = maximum - minimum;
    const yFor = value => 28 + Number((maximum - value) * 10000n / spread) / 10000 * 354;
    const firstTime = series[0].time;
    const lastTime = series.at(-1).time;
    const xFor = time => !Number.isFinite(time) || lastTime <= firstTime
      ? CHART_WIDTH / 2
      : Math.min(CHART_WIDTH - 12, Math.max(12, (time - firstTime) / (lastTime - firstTime) * CHART_WIDTH));
    const points = series.map(point => [xFor(point.time), yFor(point.value)]);
    const line = pathFrom(points);
    const current = points.at(-1);
    elements["price-line"].setAttribute("d", line);
    elements["price-area"].setAttribute("d", `${line} L${CHART_WIDTH} ${CHART_HEIGHT} L0 ${CHART_HEIGHT} Z`);
    for (const id of ["price-point", "price-point-halo"]) {
      elements[id].setAttribute("cx", String(current[0]));
      elements[id].setAttribute("cy", String(current[1]));
    }
    renderBuyMarkers(yFor, xFor);
    showingFinalizedData = true;
    window.cancelAnimationFrame(previewFrame);
    elements["current-label"].style.top = `calc(${Math.min(86, Math.max(9, current[1] / CHART_HEIGHT * 100)).toFixed(2)}% - .8rem)`;
    elements["chart-mode"].textContent = "LIVE BLAST ZONE";
    elements["chart-price"].textContent = currentPrice ? `${formatPrice(currentPrice)} $EMBER` : "—";

    if (!entry) {
      elements["chart-shell"].dataset.state = "market";
      elements["entry-line"].hidden = true;
      document.querySelector(".blast-field").hidden = true;
      document.querySelector(".entry-label").hidden = true;
      document.querySelector(".zone-label").hidden = true;
      elements["zone-status"].textContent = "MARKET LIVE";
      elements["zone-copy"].textContent = "Search a wallet to place its tracked entry.";
      elements["chart-caption"].textContent = "Finalized pool prices. Markers are verified buys.";
      elements["blast-chart"].setAttribute("aria-label", "Finalized TOPBLAST price history with verified buy markers");
      return true;
    }

    const entryY = yFor(entry);
    elements["entry-line"].hidden = false;
    document.querySelector(".blast-field").hidden = false;
    document.querySelector(".entry-label").hidden = false;
    document.querySelector(".zone-label").hidden = false;
    elements["entry-line"].setAttribute("y1", entryY.toFixed(1));
    elements["entry-line"].setAttribute("y2", entryY.toFixed(1));
    document.querySelector(".blast-field").setAttribute("y", entryY.toFixed(1));
    document.querySelector(".blast-field").setAttribute("height", Math.max(0, CHART_HEIGHT - entryY).toFixed(1));
    document.querySelector(".entry-label").style.top = `calc(${Math.min(91, Math.max(5, entryY / CHART_HEIGHT * 100)).toFixed(2)}% - 1.5rem)`;
    setChartState(values.at(-1) < entry, current[1]);
    elements["chart-caption"].textContent = "Finalized prices and verified buys compared with this wallet's tracked entry.";
    elements["blast-chart"].setAttribute("aria-label", "Finalized indexed TOPBLAST price history and buys compared with the searched wallet's tracked entry");
    return true;
  }

  function renderMarketChart() {
    if (!marketPriceSamples.length) return false;
    const latest = marketPriceSamples.at(-1);
    const series = marketPriceSamples.length === 1
      ? [{ value: latest.value, time: latest.time - 60_000 }, latest]
      : marketPriceSamples;
    let minimum = Math.min(...series.map(point => point.value));
    let maximum = Math.max(...series.map(point => point.value));
    const basePadding = Math.max(Math.abs(latest.value) * .006, Number.EPSILON);
    if (minimum === maximum) { minimum -= basePadding; maximum += basePadding; }
    else {
      const padding = (maximum - minimum) * .14;
      minimum -= padding;
      maximum += padding;
    }
    const spread = maximum - minimum;
    const firstTime = series[0].time;
    const lastTime = series.at(-1).time;
    const xFor = time => 12 + (time - firstTime) / Math.max(1, lastTime - firstTime) * (CHART_WIDTH - 24);
    const yFor = value => 28 + (maximum - value) / spread * 354;
    const points = series.map(point => [xFor(point.time), yFor(point.value)]);
    const line = pathFrom(points);
    const current = points.at(-1);
    elements["price-line"].setAttribute("d", line);
    elements["price-area"].setAttribute("d", `${line} L${CHART_WIDTH} ${CHART_HEIGHT} L0 ${CHART_HEIGHT} Z`);
    for (const id of ["price-point", "price-point-halo"]) {
      elements[id].setAttribute("cx", String(current[0]));
      elements[id].setAttribute("cy", String(current[1]));
    }
    elements["buy-markers"].replaceChildren();
    elements["entry-line"].hidden = true;
    document.querySelector(".blast-field").hidden = true;
    document.querySelector(".entry-label").hidden = true;
    document.querySelector(".zone-label").hidden = true;
    elements["chart-shell"].dataset.state = "market";
    elements["chart-mode"].textContent = "LIVE TOPBLAST MARKET";
    elements["chart-price"].textContent = formatUsdPrice(latest.value);
    elements["zone-status"].textContent = "MARKET LIVE";
    delete elements["zone-status"].dataset.state;
    elements["zone-copy"].textContent = "Real test-token price. Search a wallet for its Blast Zone status.";
    elements["chart-caption"].textContent = "Rolling TOPBLAST price from Jupiter. Eligibility uses the finalized TOP BLAST index.";
    elements["current-label"].style.top = `calc(${Math.min(86, Math.max(9, current[1] / CHART_HEIGHT * 100)).toFixed(2)}% - .8rem)`;
    elements["blast-chart"].setAttribute("aria-label", "Live rolling TOPBLAST test-token market price from Jupiter");
    showingFinalizedData = true;
    window.cancelAnimationFrame(previewFrame);
    return true;
  }

  function isPublicIndexConfigured() {
    try {
      const url = new URL(String(config.supabaseUrl || ""));
      return url.protocol === "https:" && typeof config.supabaseKey === "string" && config.supabaseKey.length > 20;
    } catch {
      return false;
    }
  }

  async function readRows(table, query) {
    if (!isPublicIndexConfigured()) throw new Error("Public index is not configured");
    const url = new URL(`/rest/v1/${table}`, config.supabaseUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, {
        headers: { apikey: config.supabaseKey, accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Public index returned ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("Public index returned invalid data");
      return rows;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function readCount(table, query) {
    if (!isPublicIndexConfigured()) throw new Error("Public index is not configured");
    const url = new URL(`/rest/v1/${table}`, config.supabaseUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, {
        headers: { apikey: config.supabaseKey, accept: "application/json", prefer: "count=exact", range: "0-0" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Public index returned ${response.status}`);
      const match = response.headers.get("content-range")?.match(/\/(\d+)$/);
      if (!match) throw new Error("Public index omitted an exact count");
      return match[1];
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "INDEX TIME UNAVAILABLE";
    return `INDEXED ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date).toUpperCase()}`;
  }

  function shortWallet(wallet) {
    return typeof wallet === "string" && wallet.length > 12 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "—";
  }

  function formatInteger(rawValue) {
    const value = asRaw(rawValue);
    return value === null ? "—" : value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatBasisPoints(rawValue) {
    const value = asRaw(rawValue);
    if (value === null) return "—";
    const whole = value / 100n;
    const fraction = (value % 100n).toString().padStart(2, "0");
    return `${whole}.${fraction}%`;
  }

  function formatDecimal(rawValue, decimals, maxFraction = 4) {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return "—";
    const value = asRaw(rawValue);
    if (value === null) return "—";
    const negative = value < 0n;
    const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
    const integer = decimals ? digits.slice(0, -decimals) : digits;
    const fraction = decimals ? digits.slice(-decimals, -decimals + maxFraction).replace(/0+$/, "") : "";
    if (decimals && !fraction && value !== 0n && BigInt(integer) === 0n) return `${negative ? "-" : ""}<0.${"0".repeat(Math.max(0, maxFraction - 1))}1`;
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
  }

  function formatPrice(rawValue) {
    if (!rawValue || !Number.isInteger(protocol?.burned_decimals) || !Number.isInteger(protocol?.ember_decimals)) return "—";
    const tokenDecimals = protocol.burned_decimals;
    const emberDecimals = protocol.ember_decimals;
    if (tokenDecimals >= emberDecimals) return formatDecimal(BigInt(rawValue) * 10n ** BigInt(tokenDecimals - emberDecimals), 18, 6);
    return formatDecimal(rawValue, 18 + emberDecimals - tokenDecimals, 6);
  }

  function formatPercent(currentRaw, entryRaw) {
    const current = asRaw(currentRaw);
    const entry = asRaw(entryRaw, true);
    if (current === null || entry === null) return "—";
    const basisPoints = (current - entry) * 10000n / entry;
    const sign = basisPoints > 0n ? "+" : "";
    return `${sign}${(Number(basisPoints) / 100).toFixed(2)}%`;
  }

  function formatUsdPrice(value) {
    if (!Number.isFinite(value) || value <= 0) return "—";
    const maximumFractionDigits = value >= 1 ? 4 : value >= .01 ? 5 : value >= .0001 ? 7 : 10;
    return `$${value.toLocaleString("en-US", { maximumFractionDigits, minimumFractionDigits: Math.min(2, maximumFractionDigits) })}`;
  }

  function renderMarketMove(element, value) {
    if (!Number.isFinite(value)) {
      element.textContent = "—";
      delete element.dataset.state;
      return;
    }
    element.textContent = `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
    element.dataset.state = value < 0 ? "negative" : value > 0 ? "positive" : "flat";
  }

  async function loadMarketData() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const token = async mint => {
        const url = new URL(JUPITER_TOKEN_API);
        url.searchParams.set("query", mint);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Jupiter returned ${response.status}`);
        const rows = await response.json();
        const row = Array.isArray(rows) ? rows.find(item => item?.id === mint) : null;
        if (!row) throw new Error("Jupiter token data is unavailable");
        return row;
      };
      const [topblast, ember] = await Promise.all([token(TOPBLAST_MINT), token(EMBER_MINT)]);
      const topblastPrice = Number(topblast.usdPrice);
      elements["market-topblast-price"].textContent = formatUsdPrice(topblastPrice);
      elements["market-ember-price"].textContent = formatUsdPrice(Number(ember.usdPrice));
      renderMarketMove(elements["market-topblast-move"], Number(topblast.stats24h?.priceChange));
      renderMarketMove(elements["market-ember-move"], Number(ember.stats24h?.priceChange));
      elements["market-data-status"].textContent = `MARKET LIVE · ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date()).toUpperCase()}`;
      if (Number.isFinite(topblastPrice) && topblastPrice > 0) {
        const now = Date.now();
        if (!marketPriceSamples.length || now - marketPriceSamples.at(-1).time >= 5_000) {
          marketPriceSamples = [...marketPriceSamples, { value: topblastPrice, time: now }].slice(-120);
        }
        if (!protocol?.current_price_raw || !renderIndexedChart(selectedEntryRaw)) renderMarketChart();
      }
    } catch {
      for (const id of ["market-topblast-price", "market-topblast-move", "market-ember-price", "market-ember-move"]) elements[id].textContent = "—";
      elements["market-data-status"].textContent = "MARKET DATA UNAVAILABLE";
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function validSolanaAddress(value) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
    let number = 0n;
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    for (const character of value) number = number * 58n + BigInt(alphabet.indexOf(character));
    const hex = number ? number.toString(16).padStart(Math.ceil(number.toString(16).length / 2) * 2, "0") : "";
    const leadingZeroes = value.match(/^1*/)[0].length;
    return leadingZeroes + hex.length / 2 === 32;
  }

  function epochCountdown() {
    if (!Number.isInteger(protocol?.current_epoch) || !protocol?.current_price_raw) return "—";
    const remaining = Math.ceil((protocol.current_epoch + 1) * EPOCH_SECONDS - Date.now() / 1000);
    if (remaining <= 0) return "SETTLING";
    const minutes = Math.floor(remaining / 60);
    return `${String(minutes).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  }

  function updateEpochCountdown() {
    elements["market-next-epoch"].textContent = epochCountdown();
    if (selectedWalletLoaded) elements["next-epoch"].textContent = epochCountdown();
  }

  function setMessage(message, tone = "") {
    elements["wallet-message"].textContent = message;
    if (tone) elements["wallet-message"].dataset.tone = tone;
    else delete elements["wallet-message"].dataset.tone;
  }

  function clearHistory(status = "SEARCH WALLET") {
    elements["history-status"].textContent = status;
    elements["airdrop-history"].replaceChildren();
    const empty = document.createElement("p");
    empty.textContent = "No completed airdrops loaded.";
    elements["airdrop-history"].append(empty);
  }

  function renderHistory(distributions) {
    elements["airdrop-history"].replaceChildren();
    elements["history-status"].textContent = distributions.length ? `${distributions.length} VERIFIED` : "NO AIRDROPS";
    if (!distributions.length) {
      const empty = document.createElement("p");
      empty.textContent = "No completed airdrops for this wallet.";
      elements["airdrop-history"].append(empty);
      return;
    }
    for (const distribution of distributions) {
      const row = document.createElement("div");
      row.className = "history-row";
      const epoch = document.createElement("span");
      epoch.textContent = String(distribution.epoch_id);
      const amount = document.createElement("strong");
      amount.textContent = formatDecimal(distribution.amount_ember_raw, protocol.ember_decimals, 4);
      const tx = document.createElement("a");
      tx.href = `https://solscan.io/tx/${encodeURIComponent(distribution.signature)}`;
      tx.target = "_blank";
      tx.rel = "noreferrer";
      tx.textContent = "VERIFY";
      tx.setAttribute("aria-label", `Verify epoch ${distribution.epoch_id} airdrop on Solscan`);
      row.append(epoch, amount, tx);
      elements["airdrop-history"].append(row);
    }
  }

  function clearPosition() {
    selectedWalletLoaded = false;
    for (const id of ["tracked-balance", "tracked-entry", "current-price", "position-change", "position-status", "blast-depth", "next-epoch", "total-airdropped"]) {
      elements[id].textContent = "—";
      delete elements[id].dataset.state;
    }
    clearHistory();
  }

  function renderPosition(account) {
    const entryRaw = account.entry_price_raw;
    selectedEntryRaw = entryRaw || null;
    selectedWalletLoaded = true;
    const currentRaw = protocol?.current_price_raw;
    const blocked = Number.isInteger(protocol?.current_epoch) && Number(account.blocked_epoch) >= protocol.current_epoch;
    const canonicalStatus = blocked ? "excluded" : String(account.position_status || "");
    const blasted = canonicalStatus === "blasted";
    elements["tracked-balance"].textContent = `${formatDecimal(account.tracked_burned_raw, protocol.burned_decimals, 4)} $TOPBLAST`;
    elements["tracked-entry"].textContent = entryRaw ? `${formatPrice(entryRaw)} $EMBER` : "—";
    elements["current-price"].textContent = currentRaw ? `${formatPrice(currentRaw)} $EMBER` : "—";
    elements["total-airdropped"].textContent = `${formatDecimal(account.total_airdropped_ember_raw, protocol.ember_decimals, 4)} $EMBER`;
    elements["blast-depth"].textContent = currentRaw && entryRaw ? formatBasisPoints(account.burn_depth_bps) : "—";
    updateEpochCountdown();

    if (!entryRaw || !currentRaw) {
      elements["position-status"].textContent = entryRaw ? "PRICE UNAVAILABLE" : "NO ENTRY";
      setMessage(entryRaw ? "Tracked entry found. The canonical price is unavailable." : "No retained verified buy entry is indexed for this wallet.");
      return;
    }

    elements["position-change"].textContent = formatPercent(currentRaw, entryRaw);
    elements["position-change"].dataset.state = blasted ? "negative" : "positive";
    elements["position-status"].textContent = blocked ? "EXCLUDED THIS EPOCH" : blasted ? "BLASTED" : "CLEAR";
    elements["position-status"].dataset.state = blocked || blasted ? "blasted" : "clear";
    setMessage(blocked
      ? "A sell, send or burn excludes this wallet for the current epoch."
      : blasted
        ? "Below tracked entry. Final eligibility is fixed at the epoch cutoff."
        : "At or above tracked entry. This position is outside the Blast Zone.");
    renderIndexedChart(entryRaw);
  }

  function showTopBlast(buy) {
    if (!buy?.wallet) return;
    window.clearTimeout(blastAlertTimer);
    elements["blast-alert-wallet"].textContent = shortWallet(buy.wallet);
    elements["blast-alert"].hidden = false;
    elements["chart-shell"].classList.remove("new-blast");
    void elements["chart-shell"].offsetWidth;
    elements["chart-shell"].classList.add("new-blast");
    blastAlertTimer = window.setTimeout(() => {
      elements["blast-alert"].hidden = true;
      elements["chart-shell"].classList.remove("new-blast");
    }, reducedMotion ? 2800 : 4200);
  }

  async function refreshSelectedWallet(silent = false) {
    if (!selectedWallet || !protocol) return;
    try {
      const [accountRows, distributionRows] = await Promise.all([
        readRows("burned_wallet_accounts", {
          select: "wallet,tracked_burned_raw,tracked_cost_ember_raw,entry_price_raw,blocked_epoch,current_loss_ember_raw,burn_depth_bps,position_status,total_airdropped_ember_raw,last_airdrop_epoch,last_airdrop_signature,updated_at",
          project_id: `eq.${protocol.project_id}`,
          wallet: `eq.${selectedWallet}`,
          limit: "1"
        }),
        readRows("toplast_distributions", {
          select: "distribution_id,epoch_id,wallet,amount_ember_raw,signature,updated_at",
          project_id: `eq.${protocol.project_id}`,
          wallet: `eq.${selectedWallet}`,
          order: "epoch_id.desc",
          limit: "20"
        })
      ]);
      renderHistory(distributionRows);
      if (!accountRows[0]) {
        clearPosition();
        selectedWalletLoaded = true;
        renderHistory(distributionRows);
        selectedEntryRaw = null;
        if (!silent) setMessage("No verified TOPBLAST entry is indexed for this wallet.");
        elements["position-status"].textContent = "NO ENTRY";
        elements["next-epoch"].textContent = epochCountdown();
        renderIndexedChart();
      } else renderPosition(accountRows[0]);
    } catch {
      if (!silent) setMessage("Wallet data is temporarily unavailable. No estimated values are shown.", "error");
    }
  }

  function renderWatch(leaderboard, buys, distributions, delayed) {
    elements["zone-wallet-count"].textContent = delayed ? "—" : formatInteger(protocol.wallets_in_zone);
    elements["top-blast-count"].textContent = formatInteger(protocol.top_blasts_indexed);
    elements["global-airdrop-total"].textContent = protocol.total_airdropped_ember_raw === null
      ? "—"
      : `${formatDecimal(protocol.total_airdropped_ember_raw, protocol.ember_decimals, 3)} $EMBER`;
    elements["market-airdrop-total"].textContent = protocol.total_airdropped_ember_raw === null
      ? "—"
      : `${formatDecimal(protocol.total_airdropped_ember_raw, protocol.ember_decimals, 3)} $EMBER`;

    elements["leaderboard-list"].replaceChildren();
    if (delayed || !leaderboard.length) {
      const row = document.createElement("li");
      row.className = "empty-row";
      row.innerHTML = "<span>—</span><p>No current Blast Zone positions.</p><strong>—</strong>";
      elements["leaderboard-list"].append(row);
      elements["leaderboard-status"].textContent = delayed ? "INDEX DELAYED" : "NO POSITIONS";
    } else {
      elements["leaderboard-status"].textContent = "FINALIZED SNAPSHOT";
      for (const account of leaderboard) {
        const row = document.createElement("li");
        const rank = document.createElement("span");
        const wallet = document.createElement("p");
        wallet.textContent = shortWallet(account.wallet);
        const detail = document.createElement("small");
        detail.textContent = `ENTRY ${formatPrice(account.entry_price_raw)} $EMBER`;
        wallet.append(detail);
        const depth = document.createElement("strong");
        depth.textContent = `-${formatBasisPoints(account.burn_depth_bps)} · BLASTED`;
        row.append(rank, wallet, depth);
        elements["leaderboard-list"].append(row);
      }
    }

    elements["airdrop-feed"].replaceChildren();
    const feed = [
      ...buys.slice(0, 4).map(item => ({ kind: "BUY", wallet: item.wallet, amount: item.amount_toplast_raw, decimals: protocol.burned_decimals, unit: "$TOPBLAST", detail: "VERIFIED POOL BUY", order: new Date(item.occurred_at).getTime(), signature: item.signature })),
      ...distributions.slice(0, 4).map(item => ({ kind: "AIRDROP", wallet: item.wallet, amount: item.amount_ember_raw, decimals: protocol.ember_decimals, unit: "$EMBER", detail: `EPOCH ${item.epoch_id}`, order: Number(item.epoch_id) * EPOCH_SECONDS * 1000, signature: item.signature }))
    ].sort((a, b) => b.order - a.order).slice(0, 6);
    if (!feed.length) {
      const empty = document.createElement("div");
      empty.className = "empty-feed";
      empty.innerHTML = '<span class="feed-pulse" aria-hidden="true"></span><p>Waiting for a verified buy or settled airdrop.</p>';
      elements["airdrop-feed"].append(empty);
      elements["feed-status"].textContent = "VERIFIED ONLY";
    } else {
      elements["feed-status"].textContent = "AUTO REFRESH 15S";
      for (const item of feed) {
        const row = document.createElement("div");
        row.className = "feed-row";
        const kind = document.createElement("span");
        kind.className = `feed-kind${item.kind === "AIRDROP" ? " airdrop" : ""}`;
        kind.textContent = item.kind;
        const wallet = document.createElement("p");
        wallet.className = "feed-wallet";
        wallet.textContent = shortWallet(item.wallet);
        const detail = document.createElement("small");
        detail.textContent = item.detail;
        wallet.append(detail);
        const amount = document.createElement(item.kind === "AIRDROP" ? "a" : "strong");
        amount.className = "feed-amount";
        amount.textContent = `${formatDecimal(item.amount, item.decimals, 3)} ${item.unit}`;
        if (item.kind === "AIRDROP") {
          amount.href = `https://solscan.io/tx/${encodeURIComponent(item.signature)}`;
          amount.target = "_blank";
          amount.rel = "noreferrer";
          amount.setAttribute("aria-label", `Verify ${amount.textContent} airdrop on Solscan`);
        }
        row.append(kind, wallet, amount);
        elements["airdrop-feed"].append(row);
      }
    }
  }

  async function loadProtocol() {
    if (!isPublicIndexConfigured() || protocolLoading) return;
    protocolLoading = true;
    try {
      const projectId = /^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.projectId || "") ? config.projectId : "toplast";
      const [statusRows, priceRows, leaderboardRows, buyRows, distributionRows, epochCount] = await Promise.all([
        readRows("burned_worker_status", {
          select: "project_id,current_epoch,current_price_raw,current_price_time,burned_decimals,ember_decimals,indexed_through_slot,indexed_through_time,wallets_in_zone,top_blasts_indexed,total_airdropped_ember_raw,updated_at,mode",
          project_id: `eq.${projectId}`,
          limit: "1"
        }),
        readRows("burned_epochs", {
          select: "epoch_id,reference_price_raw,created_at",
          project_id: `eq.${projectId}`,
          reference_price_raw: "not.is.null",
          order: "epoch_id.desc",
          limit: "48"
        }),
        readRows("burned_wallet_accounts", {
          select: "wallet,entry_price_raw,burn_depth_bps,position_status",
          project_id: `eq.${projectId}`,
          position_status: "eq.blasted",
          order: "burn_depth_bps.desc",
          limit: "5"
        }),
        readRows("toplast_buys", {
          select: "event_id,wallet,amount_toplast_raw,amount_ember_raw,occurred_at,signature",
          project_id: `eq.${projectId}`,
          order: "occurred_at.desc",
          limit: "12"
        }),
        readRows("toplast_distributions", {
          select: "distribution_id,wallet,amount_ember_raw,epoch_id,signature,updated_at",
          project_id: `eq.${projectId}`,
          order: "epoch_id.desc",
          limit: "12"
        }),
        readCount("burned_epochs", { select: "epoch_id", project_id: `eq.${projectId}` })
      ]);
      if (!statusRows[0]) {
        elements["data-status"].textContent = "AWAITING INDEX";
        return;
      }
      protocol = statusRows[0];
      protocol.current_epoch = protocol.current_epoch === null ? null : Number(protocol.current_epoch);
      protocol.burned_decimals = protocol.burned_decimals === null ? null : Number(protocol.burned_decimals);
      protocol.ember_decimals = protocol.ember_decimals === null ? null : Number(protocol.ember_decimals);
      elements["market-epoch-count"].textContent = formatInteger(epochCount);
      epochPrices = priceRows.reverse();
      recentBuys = buyRows;
      const newBuys = initialBuyIndexLoaded ? buyRows.filter(row => row.event_id && !knownBuyIds.has(row.event_id)) : [];
      knownBuyIds = new Set(buyRows.map(row => row.event_id).filter(Boolean));
      initialBuyIndexLoaded = true;
      const age = Date.now() - new Date(protocol.updated_at).getTime();
      const delayed = !Number.isFinite(age) || age > 180000;
      if (delayed) protocol.current_price_raw = null;
      const statusbar = document.querySelector(".account-statusbar");
      statusbar.dataset.connected = delayed ? "false" : "true";
      elements["data-status"].textContent = delayed ? "INDEX DELAYED" : "FINALIZED INDEX READY";
      elements["indexed-time"].textContent = formatTimestamp(protocol.indexed_through_time || protocol.updated_at);
      renderWatch(leaderboardRows, buyRows, distributionRows, delayed);
      if (delayed && !renderMarketChart()) startPreview();
      else if (selectedEntryRaw) renderIndexedChart(selectedEntryRaw);
      else renderIndexedChart();
      if (newBuys.length) showTopBlast(newBuys[0]);
      if (selectedWallet) await refreshSelectedWallet(true);
      else setMessage("Enter a wallet to load its verified TOPBLAST position.");
      updateEpochCountdown();
    } catch {
      elements["data-status"].textContent = "INDEX UNAVAILABLE";
      elements["leaderboard-status"].textContent = "INDEX UNAVAILABLE";
      elements["feed-status"].textContent = "INDEX UNAVAILABLE";
      setMessage("The public index could not be reached. Try again shortly.", "error");
    } finally {
      protocolLoading = false;
    }
  }

  elements["wallet-form"].addEventListener("submit", async event => {
    event.preventDefault();
    const wallet = elements["wallet-address"].value.trim();
    selectedWallet = null;
    selectedEntryRaw = null;
    clearPosition();
    if (!renderMarketChart()) startPreview();
    if (!validSolanaAddress(wallet)) {
      setMessage("Enter a valid Solana wallet address.", "error");
      elements["wallet-address"].focus();
      return;
    }
    if (!isPublicIndexConfigured()) {
      setMessage("Wallet lookup is ready. Connect the public Supabase index in Vercel to load real positions.", "error");
      return;
    }
    selectedWallet = wallet;
    const button = elements["wallet-form"].querySelector("button");
    button.disabled = true;
    button.textContent = "CHECKING";
    elements["history-status"].textContent = "LOADING";
    try {
      if (!protocol) await loadProtocol();
      if (!protocol) throw new Error("Index unavailable");
      await refreshSelectedWallet(false);
    } catch {
      setMessage("Wallet data is temporarily unavailable. No estimated values are shown.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "CHECK WALLET";
    }
  });

  elements["copy-mint"].addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(elements["copy-mint"].dataset.copy);
      elements["copy-mint"].textContent = "COPIED";
      window.setTimeout(() => { elements["copy-mint"].textContent = "COPY TEST CA"; }, 1600);
    } catch {
      elements["copy-mint"].textContent = "COPY FAILED";
    }
  });

  startPreview();
  loadMarketData();
  loadProtocol();
  window.setInterval(() => { if (!document.hidden) loadProtocol(); }, 15000);
  window.setInterval(() => { if (!document.hidden) loadMarketData(); }, 30000);
  window.setInterval(updateEpochCountdown, 1000);
})();
