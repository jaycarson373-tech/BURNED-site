(() => {
  "use strict";

  const SCALE = 10n ** 18n;
  const CHART_WIDTH = 720;
  const CHART_HEIGHT = 420;

  const JUPITER_TOKEN_API = "https://lite-api.jup.ag/tokens/v2/search";
  const config = window.__BURNED_PUBLIC_CONFIG__ || {};
  const QUOTE_MINT = config.rewardMint || "";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const elements = Object.fromEntries([
    "blast-chart", "buy-markers", "chart-shell", "chart-mode", "price-line", "price-area", "price-point", "price-point-halo",
    "entry-line", "current-label", "zone-status", "zone-copy", "chart-caption", "chart-price", "blast-alert", "blast-alert-wallet",
    "wallet-form", "wallet-address", "wallet-message", "data-status", "indexed-time", "position-grid", "tracked-balance",
    "tracked-entry", "current-price", "position-change", "position-status", "blast-depth", "total-received",
    "account-note", "zone-wallet-count", "top-blast-count", "global-reward-total", "leaderboard-status",
    "leaderboard-list", "feed-status", "activity-feed", "history-status", "reward-history", "market-data-status",
    "market-topblast-price", "market-topblast-move", "market-ray-price", "market-ray-move",
    "market-reward-total", "top-activity", "top-activity-event", "top-activity-copy", "top-activity-state",
    "activity-announcer", "market-epoch-total", "market-next-epoch", "total-epoch-count", "next-epoch-time",
    "wallet-next-epoch", "hero-next-epoch", "copy-ca"
  ].map(id => [id, document.getElementById(id)]));

  let protocol = null;
  let walletMapRows = [];
  let chartView = "wallets";
  let walletMap;
  let recentBuys = [];
  let marketPriceSamples = [];
  let marketAvailable = false;
  let completedEpochCount = null;
  let selectedEntryRaw = null;
  let selectedWallet = null;
  let selectedWalletLoaded = false;
  let walletRequestVersion = 0;
  let selectedAccount = null;
  let policyPriceSamples = [];
  let protocolLoading = false;
  let activityLoading = false;
  let initialBuyIndexLoaded = false;
  let knownBuyIds = new Set();
  let initialActivityLoaded = false;
  let knownActivityIds = new Set();
  let newActivityIds = new Set();
  let activityBuys = [];
  let activityDistributions = [];
  let crossingActivity = [];
  let positionStates = new Map();
  let activityUpdatedAt = null;
  let activityUnavailable = false;
  let activityBannerIndex = 0;
  let activityBannerPaused = false;
  let activityBannerNewId = null;
  let blastAlertTimer = 0;
  function asRaw(value, positive = false) {
    if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
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
    elements["zone-status"].textContent = blasted ? "BURNED" : "CLEAR";
    elements["zone-status"].dataset.state = blasted ? "blasted" : "clear";
    elements["zone-copy"].textContent = blasted
      ? "Below the line. Inside the Burn Zone."
      : "Above the line. Outside the Burn Zone.";
    const top = Math.min(86, Math.max(9, currentY / CHART_HEIGHT * 100));
    elements["current-label"].style.top = `calc(${top.toFixed(2)}% - .8rem)`;
  }

  // Illustration only. Never writes protocol, account, eligibility or market samples.
  function renderMechanicPreview(burned) {
    const controls = document.getElementById("preview-controls");
    controls.hidden = false;
    for (const button of controls.querySelectorAll("button")) button.setAttribute("aria-pressed", String((button.dataset.preview === "burned") === burned));
    const points = burned ? [[0,110],[110,85],[220,145],[310,125],[400,190],[510,230],[610,215],[700,280]] : [[0,270],[110,220],[220,245],[310,195],[400,160],[510,190],[610,130],[700,105]];
    const y = points.at(-1)[1];
    elements["price-line"].setAttribute("d", pathFrom(points));
    elements["price-area"].setAttribute("d", `${pathFrom(points)} L700 420 L0 420 Z`);
    elements["price-point"].setAttribute("cy", y);
    elements["price-point-halo"].setAttribute("cy", y);
    elements["chart-mode"].textContent = "MECHANIC PREVIEW";
    elements["chart-price"].textContent = "—";
    elements["chart-caption"].textContent = "Illustration only. No live price, wallet or reward data.";
    elements["blast-chart"].setAttribute("aria-label", burned ? "Mechanic preview: illustrative price below entry, in the Burn Zone" : "Mechanic preview: illustrative price above entry, outside the Burn Zone");
    const previous = elements["chart-shell"].dataset.state;
    setChartState(burned, y);
    if (burned && previous !== "blasted" && !reducedMotion) {
      elements["chart-shell"].classList.remove("is-crossing");
      requestAnimationFrame(() => elements["chart-shell"].classList.add("is-crossing"));
    }
  }
  document.getElementById("preview-controls").addEventListener("click", event => {
    const button = event.target.closest("button[data-preview]");
    if (button && !config.indexVerified) renderMechanicPreview(button.dataset.preview === "burned");
  });

  function showPendingMarket() {
    if (!config.indexVerified) { renderMechanicPreview(true); return; }
    const awaitingMint = !validSolanaAddress(config.topblastMint || "");
    for (const id of ["price-point", "price-point-halo"]) elements[id].toggleAttribute("hidden", true);
    elements["entry-line"].toggleAttribute("hidden", true);
    document.querySelector(".blast-field").toggleAttribute("hidden", true);
    document.querySelector(".entry-label").hidden = true;
    document.querySelector(".zone-label").hidden = true;
    elements["buy-markers"].replaceChildren();
    elements["price-line"].setAttribute("d", "");
    elements["price-area"].setAttribute("d", "");
    elements["chart-shell"].dataset.state = "market";
    elements["blast-chart"].setAttribute("aria-label", "BURNED market data loading");
    elements["chart-mode"].textContent = awaitingMint ? "AWAITING PRODUCTION MINT" : "CONNECTING TO INDEX";
    elements["zone-status"].textContent = "DATA PENDING";
    delete elements["zone-status"].dataset.state;
    elements["zone-copy"].textContent = awaitingMint ? "Production market data activates after the verified launch." : "Waiting for the canonical BURNED price.";
    elements["chart-caption"].textContent = "No unverified price or position data is shown.";
    elements["chart-price"].textContent = "—";
  }

  function executionPrice(buy) {
    const amount = asRaw(buy.amount_toplast_raw, true);
    const paid = asRaw(buy.amount_ember_raw, true);
    return amount && paid ? paid * SCALE / amount : null;
  }

  function renderBuyMarkers(yFor, xFor, buys) {
    elements["buy-markers"].replaceChildren();
    for (const buy of [...buys].reverse()) {
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
      title.textContent = `BURNED by ${shortWallet(buy.wallet)}`;
      marker.append(title, ring, core);
      elements["buy-markers"].append(marker);
    }
  }

  function renderIndexedChart(entryRaw = null) {
    const currentPrice = asRaw(protocol?.current_price_raw, true);
    const currentTime = Date.parse(protocol?.current_price_time || "");
    if (!currentPrice || !Number.isFinite(currentTime)) return false;
    const point = { value: currentPrice, time: currentTime };
    if (!policyPriceSamples.length || policyPriceSamples.at(-1).time !== currentTime) policyPriceSamples.push(point);
    policyPriceSamples = policyPriceSamples.slice(-90);
    const series = policyPriceSamples;

    const values = series.map(point => point.value);
    const visibleBuys = window.TopBlastIndex.buysInWindow(recentBuys, series[0].time, series.at(-1).time);
    const buyPrices = visibleBuys.map(executionPrice).filter(Boolean);
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
    elements["price-area"].setAttribute("d", points.length > 1 ? `${line} L${CHART_WIDTH} ${CHART_HEIGHT} L0 ${CHART_HEIGHT} Z` : "");
    for (const id of ["price-point", "price-point-halo"]) {
      elements[id].toggleAttribute("hidden", false);
      elements[id].setAttribute("cx", String(current[0]));
      elements[id].setAttribute("cy", String(current[1]));
    }
    renderBuyMarkers(yFor, xFor, visibleBuys);
    elements["current-label"].style.top = `calc(${Math.min(86, Math.max(9, current[1] / CHART_HEIGHT * 100)).toFixed(2)}% - .8rem)`;
    elements["chart-mode"].textContent = window.TopBlastIndex.fresh(protocol) ? "LIVE BURN ZONE" : "BURN ZONE";
    elements["chart-price"].textContent = currentPrice ? `${formatPrice(currentPrice)} $EMBER` : "—";

    if (!entry || !selectedAccount || !window.TopBlastIndex.sameSnapshot(selectedAccount, protocol)) {
      elements["chart-shell"].dataset.state = "market";
      elements["entry-line"].toggleAttribute("hidden", true);
      document.querySelector(".blast-field").toggleAttribute("hidden", true);
      document.querySelector(".entry-label").hidden = true;
      document.querySelector(".zone-label").hidden = true;
      elements["zone-status"].textContent = "MARKET LIVE";
      elements["zone-copy"].textContent = "Search a wallet to place its tracked entry.";
      elements["chart-caption"].textContent = "Canonical price in EMBER. Markers are verified buys indexed from the verified pool.";
      elements["blast-chart"].setAttribute("aria-label", "Finalized BURNED price history with verified buy markers");
      renderWalletMap();
      return true;
    }

    const entryY = yFor(entry);
    elements["entry-line"].toggleAttribute("hidden", false);
    document.querySelector(".blast-field").toggleAttribute("hidden", false);
    document.querySelector(".entry-label").hidden = false;
    document.querySelector(".zone-label").hidden = false;
    elements["entry-line"].setAttribute("y1", entryY.toFixed(1));
    elements["entry-line"].setAttribute("y2", entryY.toFixed(1));
    document.querySelector(".blast-field").setAttribute("y", entryY.toFixed(1));
    document.querySelector(".blast-field").setAttribute("height", Math.max(0, CHART_HEIGHT - entryY).toFixed(1));
    document.querySelector(".entry-label").style.top = `calc(${Math.min(91, Math.max(5, entryY / CHART_HEIGHT * 100)).toFixed(2)}% - 1.5rem)`;
    setChartState(selectedAccount.position_status === "blasted", current[1]);
    if (selectedAccount.position_status === "excluded") {
      elements["zone-status"].textContent = "EXCLUDED";
      elements["zone-copy"].textContent = "A sell or send recalculates this wallet's tracked position.";
      elements["chart-shell"].dataset.state = "excluded";
    }
    elements["chart-caption"].textContent = "Canonical indexed price compared with this wallet's verified average entry.";
    elements["blast-chart"].setAttribute("aria-label", "Finalized indexed BURNED price history and buys compared with the searched wallet's tracked entry");
    renderWalletMap();
    return true;
  }

  function renderWalletMap() {
    if (!walletMap) return;
    if (chartView !== 'wallets') return;
    if (!walletMap.render(walletMapRows, protocol, selectedWallet)) return;
    if (!selectedAccount) {
      elements['zone-status'].textContent = `${protocol.wallets_in_zone ?? '—'} IN ZONE`;
      elements['zone-copy'].textContent = 'Tap a wallet dot to see its verified entry.';
    }
    elements['chart-caption'].textContent = `Canonical price · updated ${formatTimestamp(protocol.indexed_through_time)} · refreshes every 15 seconds`;
  }
  function renderMarketChart() {
    // External USD quotes belong to the market strip only. The Burn Zone uses
    // the reward engine's canonical EMBER reference, never a substitute price.
    return false;
  }

  function isPublicIndexConfigured() {
    if (config.indexVerified !== true || !validSolanaAddress(config.topblastMint || "") || !validSolanaAddress(QUOTE_MINT)) return false;
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
      const rows = window.TopBlastIndex.parse(await response.text());
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

  let rewardCycle = {loaded:false};
  let cycleLoading = false;
  let sentVisibleUntil = 0;
  let priorSentEpoch = null;
  function cycleView() {
    return window.BurnedRewardCycle.describe({...rewardCycle, scheduledEpoch:config.reviewedEpoch, active:window.TopBlastIndex.payoutClockActive(protocol, config),currentEpoch:protocol?.current_epoch});
  }
  async function loadRewardCycle() {
    if (cycleLoading || !window.TopBlastIndex.matchesMarket(protocol, config)) return;
    cycleLoading = true;
    const snapshot = protocol;
    try {
      const epochs = await readRows("burned_epochs", {select:"epoch_id,total_reward_raw,eligible_count,reason",project_id:`eq.${snapshot.project_id}`,order:"epoch_id.desc",limit:"1"});
      const epoch = epochs[0] || null;
      const batches = epoch ? await readRows("burned_batches", {select:"batch_id,epoch_id,kind,status,signature,total_reward_raw",project_id:`eq.${snapshot.project_id}`,epoch_id:`eq.${epoch.epoch_id}`,kind:"eq.payout",limit:"1000"}) : [];
      if (protocol !== snapshot) return;
      const previous = cycleView();
      rewardCycle = {loaded:true,epoch,batches,observedAt:Date.now()};
      const next = cycleView();
      if (next.phase === "sent" && next.epoch !== priorSentEpoch) {
        // Only animate a transition actually observed here, never historical data on load.
        if (previous.epoch === next.epoch && ["queued","distributing","confirming"].includes(previous.phase)) sentVisibleUntil = Date.now() + 15000;
        priorSentEpoch = next.epoch;
      }
    } catch { rewardCycle = {loaded:false}; }
    finally { cycleLoading = false; renderEpochClock(); }
  }
  function renderEpochClock() {
    const targets = [elements["market-next-epoch"], elements["next-epoch-time"], elements["wallet-next-epoch"], elements["hero-next-epoch"]];
    const view = cycleView();
    for (const target of targets) target.textContent = view.phase === "paused" && target === elements["hero-next-epoch"] ? "~15 MIN" : view.countdown;
    const bar = document.querySelector(".reward-cycle");
    bar.dataset.phase = view.phase;
    document.getElementById("reward-cycle-state").textContent = view.phase === "sent" && view.countdown !== "—" && Date.now() >= sentVisibleUntil ? "NEXT SNAPSHOT · LAST EPOCH SENT" : view.label;
    document.getElementById("reward-cycle-clock").textContent = view.countdown;
    const proof = document.getElementById("reward-cycle-proof");
    proof.hidden = !view.signature;
    if (view.signature) proof.href = `https://solscan.io/tx/${view.signature}`;
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
    const quoteDecimals = protocol.ember_decimals;
    if (tokenDecimals >= quoteDecimals) return formatDecimal(BigInt(rawValue) * 10n ** BigInt(tokenDecimals - quoteDecimals), 18, 6);
    return formatDecimal(rawValue, 18 + quoteDecimals - tokenDecimals, 6);
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
    if (!config.indexVerified || !validSolanaAddress(QUOTE_MINT)) { elements["market-data-status"].textContent = "BURNED / EMBER · MARKET SETUP PENDING"; return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const token = async mint => {
        const url = new URL(JUPITER_TOKEN_API);
        url.searchParams.set("query", mint);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Jupiter returned ${response.status}`);
        const rows = window.TopBlastIndex.parse(await response.text());
        const row = Array.isArray(rows) ? rows.find(item => item?.id === mint) : null;
        if (!row) throw new Error("Jupiter token data is unavailable");
        return row;
      };
      const [topblast, quote] = await Promise.all([config.topblastMint ? token(config.topblastMint) : null, token(QUOTE_MINT)]);
      const topblastPrice = Number(topblast?.usdPrice);
      marketAvailable = Number.isFinite(topblastPrice) && topblastPrice > 0;
      elements["market-topblast-price"].textContent = formatUsdPrice(topblastPrice);
      elements["market-ray-price"].textContent = formatUsdPrice(Number(quote.usdPrice));
      renderMarketMove(elements["market-topblast-move"], Number(topblast?.stats24h?.priceChange));
      renderMarketMove(elements["market-ray-move"], Number(quote.stats24h?.priceChange));
      const source = "EMBER MARKET";
      elements["market-data-status"].textContent = `${source} · ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date()).toUpperCase()}`;
      if (Number.isFinite(topblastPrice) && topblastPrice > 0) {
        const now = Date.now();
        if (!marketPriceSamples.length || now - marketPriceSamples.at(-1).time >= 5_000) {
          marketPriceSamples = [...marketPriceSamples, { value: topblastPrice, time: now }].slice(-120);
        }
        if (!protocol?.current_price_raw || !renderIndexedChart(selectedEntryRaw)) renderMarketChart();
      }
    } catch {
      for (const id of ["market-topblast-price", "market-topblast-move", "market-ray-price", "market-ray-move"]) elements[id].textContent = "—";
      marketAvailable = false;
      elements["market-data-status"].textContent = "MARKET DATA UNAVAILABLE";
      if (!renderIndexedChart(selectedEntryRaw)) {
        showPendingMarket();
        elements["chart-mode"].textContent = "DATA UNAVAILABLE";
      }
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

  function setMessage(message, tone = "") {
    elements["wallet-message"].textContent = message;
    if (tone) elements["wallet-message"].dataset.tone = tone;
    else delete elements["wallet-message"].dataset.tone;
  }

  function clearHistory(status = "SEARCH WALLET") {
    elements["history-status"].textContent = status;
    elements["reward-history"].replaceChildren();
    const empty = document.createElement("p");
    empty.textContent = "No confirmed EMBER rewards loaded.";
    elements["reward-history"].append(empty);
  }

  function renderHistory(distributions) {
    elements["reward-history"].replaceChildren();
    elements["history-status"].textContent = distributions.length ? `${distributions.length} VERIFIED` : "NO REWARDS";
    if (!distributions.length) {
      const empty = document.createElement("p");
      empty.textContent = "No confirmed EMBER rewards for this wallet.";
      elements["reward-history"].append(empty);
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
      tx.setAttribute("aria-label", `Verify EMBER reward ${distribution.epoch_id} on Solscan`);
      row.append(epoch, amount, tx);
      elements["reward-history"].append(row);
    }
  }

  function clearPosition() {
    selectedEntryRaw = null;
    selectedWalletLoaded = false;
    selectedAccount = null;
    for (const id of ["tracked-balance", "tracked-entry", "current-price", "position-change", "position-status", "blast-depth", "total-received"]) {
      elements[id].textContent = "—";
      delete elements[id].dataset.state;
    }
    elements["wallet-next-epoch"].textContent = protocol ? elements["next-epoch-time"].textContent : "—";
    clearHistory();
  }

  function renderPosition(account) {
    if (!window.TopBlastIndex.sameSnapshot(account, protocol)) {
      clearPosition();
      elements["position-status"].textContent = "INDEX SYNCING";
      setMessage("Waiting for a matching finalized position snapshot.");
      if (!renderMarketChart()) showPendingMarket();
      return;
    }
    selectedAccount = account;
    const entryRaw = account.entry_price_raw;
    selectedEntryRaw = entryRaw || null;
    selectedWalletLoaded = true;
    const currentRaw = protocol?.current_price_raw;
    const blocked = Number.isInteger(protocol?.current_epoch) && Number(account.blocked_epoch) >= protocol.current_epoch;
    const canonicalStatus = blocked ? "excluded" : String(account.position_status || "");
    const blasted = canonicalStatus === "blasted";
    elements["tracked-balance"].textContent = `${formatDecimal(account.tracked_burned_raw, protocol.burned_decimals, 4)} $BURNED`;
    elements["tracked-entry"].textContent = entryRaw ? `${formatPrice(entryRaw)} $EMBER` : "—";
    elements["current-price"].textContent = currentRaw ? `${formatPrice(currentRaw)} $EMBER` : "—";
    elements["total-received"].textContent = `${formatDecimal(account.total_airdropped_ember_raw, protocol.ember_decimals, 4)} $EMBER`;
    elements["blast-depth"].textContent = currentRaw && entryRaw ? formatBasisPoints(account.burn_depth_bps) : "—";
    if (!entryRaw || !currentRaw) {
      elements["position-status"].textContent = blocked ? "EXCLUDED THIS EPOCH" : entryRaw ? "PRICE UNAVAILABLE" : "NO ENTRY";
      setMessage(blocked ? "A sell or send changed this wallet's indexed position." : entryRaw ? "Tracked entry found. Canonical price coverage is unavailable." : "No retained verified buy entry is indexed for this wallet.");
      if (!renderMarketChart()) showPendingMarket();
      return;
    }

    elements["position-change"].textContent = formatPercent(currentRaw, entryRaw);
    elements["position-change"].dataset.state = blasted ? "negative" : "positive";
    elements["position-status"].textContent = blocked ? "EXCLUDED THIS EPOCH" : blasted ? "BURNED" : "CLEAR";
    elements["position-status"].dataset.state = blocked || blasted ? "blasted" : "clear";
    setMessage(blocked
      ? "A sell, send or burn changed this wallet's indexed position."
      : blasted
        ? "Below tracked entry. This wallet is inside the Burn Zone."
        : "At or above tracked entry. This position is outside the Burn Zone.");
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
    if (!selectedWallet || !window.TopBlastIndex.matchesMarket(protocol, config)) return;
    const requestVersion = ++walletRequestVersion;
    const requestWallet = selectedWallet;
    const requestProtocol = protocol;
    const currentRequest = () => requestVersion === walletRequestVersion && requestWallet === selectedWallet && requestProtocol === protocol;
    try {
      const [accountRows, distributionRows] = await Promise.all([
        readRows("burned_wallet_accounts", {
          select: "wallet,tracked_burned_raw,tracked_cost_ember_raw,entry_price_raw,blocked_epoch,current_loss_ember_raw,burn_depth_bps,position_status,total_airdropped_ember_raw,last_airdrop_epoch,last_airdrop_signature,updated_at",
          project_id: `eq.${requestProtocol.project_id}`,
          wallet: `eq.${requestWallet}`,
          limit: "1"
        }),
        readRows("toplast_distributions", {
          select: "distribution_id,epoch_id,wallet,amount_ember_raw,signature,updated_at",
          project_id: `eq.${requestProtocol.project_id}`,
          wallet: `eq.${requestWallet}`,
          order: "epoch_id.desc",
          limit: "20"
        })
      ]);
      if (!currentRequest()) return;
      if (accountRows[0] && accountRows[0].wallet !== requestWallet) throw new Error("Wallet identity mismatch");
      if (!accountRows[0]) {
        clearPosition();
        selectedWalletLoaded = true;
        selectedEntryRaw = null;
        setMessage("No verified BURNED entry is indexed for this wallet.");
        elements["position-status"].textContent = "NO ENTRY";
        renderIndexedChart();
      } else renderPosition(accountRows[0]);
      renderHistory(distributionRows.filter(item => item.wallet === requestWallet && verifiedDistribution(item)));
    } catch {
      if (!currentRequest()) return;
      clearPosition();
      selectedEntryRaw = null;
      if (!renderMarketChart()) showPendingMarket();
      if (!silent) setMessage("Wallet data is temporarily unavailable. No estimated values are shown.", "error");
    }
  }

  function validSignature(value) {
    return /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(String(value || ""));
  }

  function verifiedIndexedBuy(item) {
    return Boolean(item?.event_id && validSolanaAddress(item.wallet) && validSignature(item.signature) &&
      asRaw(item.amount_toplast_raw, true) && asRaw(item.amount_ember_raw, true) && Number.isFinite(Date.parse(item.occurred_at || "")));
  }

  function verifiedDistribution(item) {
    return Boolean(item?.distribution_id && validSolanaAddress(item.wallet) && validSignature(item.signature) &&
      asRaw(item.amount_ember_raw, true) && Number.isSafeInteger(Number(item.epoch_id)));
  }

  function activityId(kind, item) {
    return `${kind}:${kind === "buy" ? item.event_id : item.distribution_id}`;
  }

  function recordPositionCrossings(accounts, delayed) {
    if (delayed || !protocol?.current_price_raw) return;
    const currentStates = new Map();
    for (const account of accounts) {
      if (!validSolanaAddress(account.wallet) || !window.TopBlastIndex.sameSnapshot(account, protocol) || !["safe", "blasted"].includes(account.position_status)) continue;
      currentStates.set(account.wallet, account);
      const previous = positionStates.get(account.wallet);
      const crossing = window.TopBlastIndex.crossing(previous, account);
      if (!crossing) continue;
      const id = `crossing:${account.wallet}:${protocol.updated_at}:${crossing}`;
      if (crossingActivity.some(item => item.id === id)) continue;
      crossingActivity.unshift({
        id,
        kind: crossing === "entered" ? "ENTERED BURN ZONE" : "LEFT BURN ZONE",
        className: crossing,
        wallet: account.wallet,
        detail: crossing === "entered" ? `${formatBasisPoints(account.burn_depth_bps)} BELOW ENTRY` : "AT OR ABOVE ENTRY",
        order: Date.parse(protocol.current_price_time || protocol.indexed_through_time || protocol.updated_at)
      });
      newActivityIds.add(id);
    }
    if (currentStates.size || !positionStates.size) positionStates = currentStates;
    crossingActivity = crossingActivity.slice(0, 12);
  }

  function activityTimestamp() {
    if (!activityUpdatedAt) return "UPDATES EVERY MINUTE";
    const value = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(activityUpdatedAt).toUpperCase();
    return `UPDATES EVERY MINUTE · ${value}`;
  }

  function renderActivityBanner({ animate = false, newestId = null } = {}) {
    if (!validSolanaAddress(config.topblastMint || "")) {
      elements["top-activity"].dataset.state = "ready";
      elements["top-activity-copy"].textContent = "GET BURNED. GET $EMBER.";
      elements["top-activity-state"].textContent = "MARKET SETUP PENDING";
      elements["top-activity-event"].href = "#watch";
      elements["top-activity-event"].removeAttribute("target");
      elements["top-activity-event"].removeAttribute("rel");
      elements["top-activity-event"].setAttribute("aria-label", "BURNED verified activity begins at launch.");
      return;
    }
    if (!isPublicIndexConfigured()) {
      elements["top-activity"].dataset.state = "stale";
      elements["top-activity-copy"].textContent = "WAITING FOR THE PRODUCTION INDEX";
      elements["top-activity-state"].textContent = "INDEX NOT CONNECTED";
      elements["top-activity-event"].href = "#watch";
      elements["top-activity-event"].removeAttribute("target");
      elements["top-activity-event"].removeAttribute("rel");
      elements["top-activity-event"].setAttribute("aria-label", "Waiting for the production BURNED index.");
      return;
    }
    const unavailable = !protocol || activityUnavailable;
    elements["top-activity"].dataset.state = unavailable ? "ready" : "live";
    elements["top-activity-event"].classList.remove("is-changing", "is-new");
    elements["top-activity-copy"].replaceChildren();
    if (unavailable && !activityBuys.length) {
      elements["top-activity-copy"].textContent = protocol ? "WAITING FOR THE NEXT VERIFIED BUY" : "CONNECTING TO VERIFIED ACTIVITY";
      elements["top-activity-state"].textContent = protocol ? "VERIFIED ONCHAIN" : "CONNECTING";
      elements["top-activity-event"].href = "#watch";
      elements["top-activity-event"].removeAttribute("target");
      elements["top-activity-event"].removeAttribute("rel");
      elements["top-activity-event"].setAttribute("aria-label", elements["top-activity-copy"].textContent);
      return;
    }
    if (!activityBuys.length) {
      elements["top-activity-copy"].textContent = "WAITING FOR THE NEXT VERIFIED BUY";
      elements["top-activity-state"].textContent = "VERIFIED ONCHAIN";
      elements["top-activity-event"].href = "#watch";
      elements["top-activity-event"].removeAttribute("target");
      elements["top-activity-event"].removeAttribute("rel");
      elements["top-activity-event"].setAttribute("aria-label", "Waiting for the next verified BURNED buy.");
      return;
    }
    activityBannerIndex %= activityBuys.length;
    const buy = activityBuys[activityBannerIndex];
    const id = activityId("buy", buy);
    const wallet = document.createElement("span");
    wallet.textContent = shortWallet(buy.wallet);
    const action = document.createElement("strong");
    action.textContent = "VERIFIED BUY";
    const amount = formatDecimal(buy.amount_ember_raw, protocol.ember_decimals, 3);
    const time = document.createElement("time");
    time.dateTime = buy.occurred_at;
    time.textContent = window.TopBlastIndex.relativeTime(buy.occurred_at);
    elements["top-activity-copy"].append(wallet, " ", action, ` · Bought ${amount} $EMBER worth · `, time);
    elements["top-activity-event"].href = `https://solscan.io/tx/${encodeURIComponent(buy.signature)}`;
    elements["top-activity-event"].target = "_blank";
    elements["top-activity-event"].rel = "noreferrer";
    elements["top-activity-event"].setAttribute("aria-label", `${shortWallet(buy.wallet)} bought BURNED. Bought ${amount} EMBER worth. Open transaction proof.`);
    elements["top-activity-state"].textContent = "OPEN PROOF";
    if (animate && !reducedMotion) {
      void elements["top-activity-event"].offsetWidth;
      elements["top-activity-event"].classList.add("is-changing");
    }
    if (newestId === id && !reducedMotion) {
      elements["top-activity-event"].classList.add("is-new");
      window.setTimeout(() => elements["top-activity-event"].classList.remove("is-new"), 1800);
    }
  }

  function renderActivityFeed(delayed = !protocol || !window.TopBlastIndex.fresh(protocol)) {
    elements["activity-feed"].replaceChildren();
    const feed = [
      ...activityBuys.slice(0, 8).map(item => ({ id: activityId("buy", item), kind: "VERIFIED BUY", className: "buy", wallet: item.wallet, amount: item.amount_ember_raw, decimals: protocol?.ember_decimals, unit: "$EMBER", detail: "VERIFIED BUY", order: Date.parse(item.occurred_at), signature: item.signature })),
      ...activityDistributions.slice(0, 8).map(item => ({ id: activityId("distribution", item), kind: "EMBER RECEIVED", className: "reward", wallet: item.wallet, amount: item.amount_ember_raw, decimals: protocol?.ember_decimals, unit: "$EMBER", detail: `EPOCH ${item.epoch_id}`, order: Date.parse(item.updated_at || "") || 0, signature: item.signature })),
      ...crossingActivity
    ].sort((a, b) => b.order - a.order).slice(0, 7);
    const newest = feed.find(item => newActivityIds.has(item.id));
    if (newest) {
      const value = newest.amount === undefined ? newest.detail : `${formatDecimal(newest.amount, newest.decimals, 3)} ${newest.unit}`;
      elements["activity-announcer"].textContent = `New verified activity. ${shortWallet(newest.wallet)}. ${newest.kind}. ${value}.`;
    }
    if (!feed.length) {
      const empty = document.createElement("div");
      empty.className = "empty-feed";
      empty.innerHTML = '<span class="feed-pulse" aria-hidden="true"></span><p>Waiting for a verified buy, crossing or confirmed reward.</p>';
      elements["activity-feed"].append(empty);
    } else {
      for (const item of feed) {
        const row = document.createElement("div");
        row.className = `feed-row${newActivityIds.has(item.id) ? " is-new" : ""}`;
        row.dataset.activityId = item.id;
        const kind = document.createElement("span");
        kind.className = `feed-kind ${item.className || ""}`;
        kind.textContent = item.kind;
        const wallet = document.createElement("p");
        wallet.className = "feed-wallet";
        wallet.textContent = shortWallet(item.wallet);
        const detail = document.createElement("small");
        detail.textContent = item.detail;
        wallet.append(detail);
        const amount = document.createElement(item.signature ? "a" : "strong");
        amount.className = "feed-amount";
        amount.textContent = item.amount === undefined ? "INDEXED" : `${formatDecimal(item.amount, item.decimals, 3)} ${item.unit}`;
        if (item.signature) {
          amount.href = `https://solscan.io/tx/${encodeURIComponent(item.signature)}`;
          amount.target = "_blank";
          amount.rel = "noreferrer";
          amount.setAttribute("aria-label", `Verify ${item.kind.toLowerCase()} transaction on Solscan`);
        }
        row.append(kind, wallet, amount);
        elements["activity-feed"].append(row);
      }
      if (newActivityIds.size && !reducedMotion) window.setTimeout(() => {
        for (const row of elements["activity-feed"].querySelectorAll(".is-new")) row.classList.remove("is-new");
      }, 4200);
    }
    elements["feed-status"].textContent = activityTimestamp();
    renderActivityBanner({ newestId: activityBannerNewId });
    newActivityIds.clear();
    activityBannerNewId = null;
  }

  async function loadActivity() {
    if (!isPublicIndexConfigured() || !window.TopBlastIndex.matchesMarket(protocol, config) || activityLoading) return;
    activityLoading = true;
    try {
      const projectId = /^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.projectId || "") ? config.projectId : "burned-ember";
      const [buyRows, distributionRows] = await Promise.all([
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
        })
      ]);
      activityBuys = buyRows.filter(verifiedIndexedBuy);
      activityDistributions = distributionRows.filter(verifiedDistribution);
      recentBuys = activityBuys;
      const ids = new Set([
        ...activityBuys.map(item => activityId("buy", item)),
        ...activityDistributions.map(item => activityId("distribution", item))
      ]);
      if (initialActivityLoaded) {
        for (const id of ids) if (!knownActivityIds.has(id)) newActivityIds.add(id);
      }
      const newBuys = initialBuyIndexLoaded ? activityBuys.filter(row => row.event_id && !knownBuyIds.has(row.event_id)) : [];
      knownBuyIds = new Set(activityBuys.map(row => row.event_id));
      initialBuyIndexLoaded = true;
      knownActivityIds = ids;
      initialActivityLoaded = true;
      activityUpdatedAt = new Date();
      activityUnavailable = false;
      if (newBuys.length) {
        activityBannerIndex = Math.max(0, activityBuys.findIndex(row => row.event_id === newBuys[0].event_id));
        activityBannerNewId = activityId("buy", newBuys[0]);
        showTopBlast(newBuys[0]);
      }
      renderActivityFeed();
    } catch {
      activityUnavailable = true;
      renderActivityFeed();
    } finally {
      activityLoading = false;
    }
  }

  function renderWatch(leaderboard, delayed) {
    const noPrice = !protocol.current_price_raw;
    leaderboard = leaderboard.filter(account => window.TopBlastIndex.sameSnapshot(account, protocol));
    elements["zone-wallet-count"].textContent = noPrice ? "—" : formatInteger(protocol.wallets_in_zone);
    elements["top-blast-count"].textContent = formatInteger(protocol.top_blasts_indexed);
    const rewardTotal = protocol.total_airdropped_ember_raw === null
      ? "—"
      : `${formatDecimal(protocol.total_airdropped_ember_raw, protocol.ember_decimals, 3)} $EMBER`;
    elements["global-reward-total"].textContent = rewardTotal;
    elements["market-reward-total"].textContent = rewardTotal;
    const epochTotal = completedEpochCount === null ? "—" : formatInteger(completedEpochCount);
    elements["total-epoch-count"].textContent = epochTotal;
    elements["market-epoch-total"].textContent = epochTotal;
    renderEpochClock();

    elements["leaderboard-list"].replaceChildren();
    if (noPrice || !leaderboard.length) {
      const row = document.createElement("li");
      row.className = "empty-row";
      row.innerHTML = "<span>—</span><p>No current Burn Zone positions.</p><strong>—</strong>";
      if (noPrice) row.querySelector("p").textContent = "Waiting for current canonical price coverage.";
      elements["leaderboard-list"].append(row);
      elements["leaderboard-status"].textContent = noPrice ? "PRICE UNAVAILABLE" : "NO POSITIONS";
    } else {
      elements["leaderboard-status"].textContent = "INDEXED POSITIONS";
      for (const account of leaderboard) {
        const row = document.createElement("li");
        const rank = document.createElement("span");
        const wallet = document.createElement("p");
        wallet.textContent = shortWallet(account.wallet);
        const detail = document.createElement("small");
        detail.textContent = `LOSS ${formatDecimal(account.current_loss_ember_raw, protocol.ember_decimals, 3)} $EMBER · ENTRY ${formatPrice(account.entry_price_raw)} $EMBER`;
        wallet.append(detail);
        const depth = document.createElement("strong");
        depth.textContent = `-${formatBasisPoints(account.burn_depth_bps)} · BURNED`;
        row.append(rank, wallet, depth);
        elements["leaderboard-list"].append(row);
      }
    }

  }

  async function readWalletMapRows(projectId) {
    const rows = [];
    for (let offset = 0; offset < 10000; offset += 1000) {
      const page = await readRows("burned_wallet_accounts", {
        select: "wallet,tracked_burned_raw,entry_price_raw,current_loss_ember_raw,burn_depth_bps,position_status,updated_at",
        tracked_burned_raw: "gt.0", project_id: `eq.${projectId}`,
        order: "current_loss_ember_raw.desc,wallet.asc", limit: "1000", offset: String(offset)
      });
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
    throw new Error("Wallet map snapshot exceeded its display budget");
  }

  async function loadProtocol() {
    if (!isPublicIndexConfigured() || protocolLoading) return;
    protocolLoading = true;
    try {
      const projectId = /^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.projectId || "") ? config.projectId : "burned-ember";
      const [statusRows, accountRows, epochCount] = await Promise.all([
        readRows("burned_worker_status", {
          select: "project_id,burned_mint,ember_mint,current_epoch,current_price_raw,current_price_time,burned_decimals,ember_decimals,indexed_through_slot,indexed_through_time,wallets_in_zone,top_blasts_indexed,total_airdropped_ember_raw,updated_at,mode",
          project_id: `eq.${projectId}`,
          limit: "1"
        }),
        readWalletMapRows(projectId),
        readCount("burned_epochs", { project_id: `eq.${projectId}` })
      ]);
      if (!statusRows[0]) {
        elements["data-status"].textContent = "AWAITING INDEX";
        return;
      }
      if (!window.TopBlastIndex.matchesMarket(statusRows[0], config)) {
        protocol = null;
        activityBuys = []; activityDistributions = []; recentBuys = []; crossingActivity = [];
        policyPriceSamples = []; selectedEntryRaw = null; selectedAccount = null;
        renderActivityFeed();
        throw new Error("Public index mint identity does not match the configured BURNED / EMBER market");
      }
      if (accountRows.some(row => !window.TopBlastIndex.sameSnapshot(row, statusRows[0]))) throw new Error("Wallet snapshot is still publishing");
      protocol = statusRows[0];
      walletMapRows = accountRows;
      completedEpochCount = epochCount;
      loadRewardCycle();
      protocol.current_epoch = protocol.current_epoch === null ? null : Number(protocol.current_epoch);
      protocol.burned_decimals = protocol.burned_decimals === null ? null : Number(protocol.burned_decimals);
      protocol.ember_decimals = protocol.ember_decimals === null ? null : Number(protocol.ember_decimals);
      const delayed = !window.TopBlastIndex.fresh(protocol);
      const statusbar = document.querySelector(".account-statusbar");
      statusbar.dataset.connected = "true";
      elements["data-status"].textContent = "FINALIZED INDEX";
      elements["indexed-time"].textContent = formatTimestamp(protocol.indexed_through_time || protocol.updated_at);
      recordPositionCrossings(accountRows, delayed);
      const leaderboardRows = accountRows.filter(account => account.position_status === "blasted").slice(0, 5);
      renderWatch(leaderboardRows, delayed);
      renderActivityFeed(delayed);
      if (!renderIndexedChart(selectedEntryRaw) && !renderMarketChart()) showPendingMarket();
      if (selectedWallet) await refreshSelectedWallet(true);
      else setMessage("Enter a wallet to load its verified BURNED position.");
    } catch {
      // Hold the last finalized snapshot through a temporary read failure. The
      // timestamp stays visible, and no unverified value is introduced.
      if (!protocol) {
        completedEpochCount = null;
        clearPosition();
        if (!renderMarketChart()) showPendingMarket();
        elements["zone-wallet-count"].textContent = "—";
        for (const id of ["global-reward-total", "market-reward-total", "total-epoch-count", "market-epoch-total", "next-epoch-time", "market-next-epoch", "wallet-next-epoch"]) elements[id].textContent = "—";
        elements["data-status"].textContent = "CONNECTING";
        elements["leaderboard-status"].textContent = "AWAITING INDEX";
        renderActivityBanner();
      }
    } finally {
      protocolLoading = false;
    }
  }

  for (const link of document.querySelectorAll('a[href="#account"]')) {
    link.addEventListener("click", () => {
      window.setTimeout(() => elements["wallet-address"].focus({ preventScroll: true }), 0);
    });
  }

  elements["wallet-form"].addEventListener("submit", async event => {
    event.preventDefault();
    const wallet = elements["wallet-address"].value.trim();
    walletRequestVersion++;
    selectedWallet = null;
    selectedEntryRaw = null;
    clearPosition();
    if (!renderMarketChart()) showPendingMarket();
    if (!validSolanaAddress(wallet)) {
      setMessage("Enter a valid Solana wallet address.", "error");
      elements["wallet-address"].focus();
      return;
    }
    selectedWallet = wallet;
    if (!isPublicIndexConfigured()) {
      setMessage("Wallet address accepted. BURNED position tracking will be available when the new market is connected.");
      return;
    }
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

  if (/^https:\/\/(?:www\.)?x\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(config.xUrl || "")) {
    for (const link of document.querySelectorAll("[data-x-link]")) {
      link.href = config.xUrl;
      link.hidden = false;
    }
  }
  if (/^https:\/\/dexscreener\.com\/solana\/[1-9A-HJ-NP-Za-km-z]{32,44}\/?$/.test(config.dexscreenerUrl || "")) {
    for (const link of document.querySelectorAll("[data-dexscreener-link]")) {
      link.href = config.dexscreenerUrl;
      link.hidden = false;
    }
  }
  if (validSolanaAddress(config.topblastMint || "")) {
    elements["copy-ca"].hidden = false;
    elements["copy-ca"].textContent = `CA ${shortWallet(config.topblastMint)}`;
    elements["copy-ca"].setAttribute("aria-label", "Copy BURNED contract address");
    elements["copy-ca"].addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(config.topblastMint);
        elements["copy-ca"].textContent = "CA COPIED";
        window.setTimeout(() => { elements["copy-ca"].textContent = `CA ${shortWallet(config.topblastMint)}`; }, 1600);
      } catch {
        elements["copy-ca"].textContent = "COPY FAILED";
      }
    });
    for (const link of document.querySelectorAll("[data-ember-link]")) link.href = `https://embercurve.fun/t/${encodeURIComponent(config.topblastMint)}`;
    for (const link of document.querySelectorAll("[data-buy-link]")) {
      link.href = `https://embercurve.fun/t/${encodeURIComponent(config.topblastMint)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "BUY $BURNED";
    }
  }

  elements["top-activity"].addEventListener("pointerenter", () => { activityBannerPaused = true; });
  elements["top-activity"].addEventListener("pointerleave", () => { activityBannerPaused = false; });
  elements["top-activity"].addEventListener("focusin", () => { activityBannerPaused = true; });
  elements["top-activity"].addEventListener("focusout", event => {
    if (!elements["top-activity"].contains(event.relatedTarget)) activityBannerPaused = false;
  });

  walletMap = new window.BurnedWalletMap.View({svg:document.getElementById('wallet-entry-map'),detail:document.getElementById('wallet-map-detail'),summary:document.getElementById('wallet-map-summary'),formatPrice,formatAmount:formatDecimal,onSelect:wallet=>{elements['wallet-address'].value=wallet;elements['wallet-form'].requestSubmit();document.getElementById('account').scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'start'});}});
  for(const button of document.querySelectorAll('[data-chart-view]'))button.addEventListener('click',()=>{chartView=button.dataset.chartView;elements['chart-shell'].dataset.view=chartView;for(const b of document.querySelectorAll('[data-chart-view]'))b.setAttribute('aria-pressed',String(b===button));document.querySelector('.wallet-map-help').hidden=chartView!=='wallets';document.getElementById('wallet-map-detail').hidden=chartView!=='wallets'||!walletMap.selected;renderIndexedChart(selectedEntryRaw);});
  for(const button of document.querySelectorAll('[data-map-zoom]'))button.addEventListener('click',()=>walletMap.setZoom(button.dataset.mapZoom==='reset'?1:walletMap.zoom+(button.dataset.mapZoom==='in'?.5:-.5)));
  showPendingMarket();
  renderActivityBanner();
  loadMarketData();
  loadProtocol().then(loadActivity);
  window.setInterval(() => { if (!document.hidden) loadProtocol(); }, 15000);
  window.setInterval(() => { if (!document.hidden) loadActivity(); }, 60000);
  window.setInterval(() => { if (!document.hidden) loadMarketData(); }, 30000);
  window.setInterval(renderEpochClock, 1000);
  window.setInterval(() => {
    if (document.hidden || activityBannerPaused || activityBuys.length < 2) return;
    activityBannerIndex = (activityBannerIndex + 1) % activityBuys.length;
    renderActivityBanner({ animate: true });
  }, 6500);
})();
