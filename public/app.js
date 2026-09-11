(() => {
  "use strict";

  const SCALE = 10n ** 18n;
  const ENTRY_Y = 190;
  const CHART_WIDTH = 720;
  const CHART_HEIGHT = 420;
  const config = window.__TOPLAST_PUBLIC_CONFIG__ || {};
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const elements = Object.fromEntries([
    "burn-chart", "buy-markers", "chart-shell", "chart-mode", "price-line", "price-area", "price-point", "price-point-halo",
    "entry-line", "current-label", "zone-status", "zone-copy", "chart-caption", "chart-price", "blast-alert", "blast-alert-wallet", "wallet-form",
    "wallet-address", "wallet-message", "data-status", "indexed-time", "position-grid",
    "tracked-balance", "tracked-entry", "current-price", "position-change", "position-status",
    "total-airdropped", "account-note", "copy-mint", "zone-wallet-count", "top-blast-count",
    "global-airdrop-total", "leaderboard-status", "leaderboard-list", "feed-status", "airdrop-feed"
  ].map(id => [id, document.getElementById(id)]));

  let protocol = null;
  let epochPrices = [];
  let recentBuys = [];
  let recentDistributions = [];
  let selectedEntryRaw = null;
  let selectedWallet = null;
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

  function setChartState(burned, currentY) {
    elements["chart-shell"].dataset.state = burned ? "burned" : "safe";
    elements["zone-status"].textContent = burned ? "BLASTED" : "SAFE";
    elements["zone-copy"].textContent = burned
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
    showingFinalizedData = false;
    elements["entry-line"].setAttribute("y1", String(ENTRY_Y));
    elements["entry-line"].setAttribute("y2", String(ENTRY_Y));
    document.querySelector(".burn-field").setAttribute("y", String(ENTRY_Y));
    document.querySelector(".burn-field").setAttribute("height", String(CHART_HEIGHT - ENTRY_Y));
    document.querySelector(".entry-label").style.top = "calc(45.24% - 1.5rem)";
    document.querySelector(".entry-label").hidden = false;
    document.querySelector(".zone-label").hidden = false;
    elements["entry-line"].hidden = false;
    document.querySelector(".burn-field").hidden = false;
    elements["buy-markers"].replaceChildren();
    elements["burn-chart"].setAttribute("aria-label", "Illustration of price moving above and below a tracked entry line");
    elements["chart-mode"].textContent = "MECHANIC PREVIEW";
    elements["chart-caption"].textContent = "Illustrative movement. No live price is shown.";
    elements["chart-price"].textContent = "—";
    paintPreview(reducedMotion ? 4600 : performance.now());
    if (!reducedMotion) {
      window.cancelAnimationFrame(previewFrame);
      previewFrame = window.requestAnimationFrame(previewLoop);
    }
  }

  function executionPrice(buy) {
    const amount = asRaw(buy.amount_toplast_raw, true), paid = asRaw(buy.amount_ember_raw, true);
    if (!amount || !paid) return null;
    return amount && paid ? paid * SCALE / amount : null;
  }

  function renderBuyMarkers(yFor, xFor) {
    elements["buy-markers"].replaceChildren();
    const buys = [...recentBuys].reverse();
    for (const buy of buys) {
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
    if (currentPrice && Number.isFinite(currentTime)) series.push({value: currentPrice, time: currentTime});
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
    const xFor = time => {
      if (!Number.isFinite(time) || lastTime <= firstTime) return CHART_WIDTH / 2;
      return Math.min(CHART_WIDTH - 12, Math.max(12, (time - firstTime) / (lastTime - firstTime) * CHART_WIDTH));
    };
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
    elements["chart-mode"].textContent = "FINALIZED DATA";
    elements["chart-price"].textContent = currentPrice ? `${formatPrice(currentPrice)} $EMBER` : "—";

    if (!entry) {
      elements["chart-shell"].dataset.state = "market";
      elements["entry-line"].hidden = true;
      document.querySelector(".burn-field").hidden = true;
      document.querySelector(".entry-label").hidden = true;
      document.querySelector(".zone-label").hidden = true;
      elements["zone-status"].textContent = "MARKET INDEXED";
      elements["zone-copy"].textContent = "Search a wallet to place its Blast Zone.";
      elements["chart-caption"].textContent = "Finalized pool prices. TOP BLAST markers are verified buys.";
      elements["burn-chart"].setAttribute("aria-label", "Finalized TOPLAST price history with verified TOP BLAST buy markers");
      return true;
    }

    const entryY = yFor(entry);
    elements["entry-line"].hidden = false;
    document.querySelector(".burn-field").hidden = false;
    document.querySelector(".entry-label").hidden = false;
    document.querySelector(".zone-label").hidden = false;
    elements["entry-line"].setAttribute("y1", entryY.toFixed(1));
    elements["entry-line"].setAttribute("y2", entryY.toFixed(1));
    document.querySelector(".burn-field").setAttribute("y", entryY.toFixed(1));
    document.querySelector(".burn-field").setAttribute("height", Math.max(0, CHART_HEIGHT - entryY).toFixed(1));
    document.querySelector(".entry-label").style.top = `calc(${Math.min(91, Math.max(5, entryY / CHART_HEIGHT * 100)).toFixed(2)}% - 1.5rem)`;
    setChartState(values.at(-1) < entry, current[1]);
    elements["chart-caption"].textContent = "Finalized prices and verified buys compared with this wallet's tracked entry.";
    elements["burn-chart"].setAttribute("aria-label", "Finalized indexed TOPLAST price history and buys compared with the searched wallet's tracked entry");
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
    let fraction = decimals ? digits.slice(-decimals, -decimals + maxFraction).replace(/0+$/, "") : "";
    if (decimals && !fraction && value !== 0n && BigInt(integer) === 0n) return `${negative ? "-" : ""}<0.${"0".repeat(Math.max(0, maxFraction - 1))}1`;
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
  }

  function formatPrice(rawValue) {
    if (!rawValue || !Number.isInteger(protocol?.burned_decimals) || !Number.isInteger(protocol?.ember_decimals)) return "—";
    const burnedDecimals = protocol.burned_decimals;
    const emberDecimals = protocol.ember_decimals;
    if (burnedDecimals >= emberDecimals) return formatDecimal(BigInt(rawValue) * 10n ** BigInt(burnedDecimals - emberDecimals), 18, 6);
    return formatDecimal(rawValue, 18 + emberDecimals - burnedDecimals, 6);
  }

  function formatPercent(currentRaw, entryRaw) {
    const current = asRaw(currentRaw), entry = asRaw(entryRaw, true);
    if (current === null || entry === null) return "—";
    if (!entry) return "—";
    const basisPoints = (current - entry) * 10000n / entry;
    const sign = basisPoints > 0n ? "+" : "";
    return `${sign}${(Number(basisPoints) / 100).toFixed(2)}%`;
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

  function clearPosition() {
    for (const id of ["tracked-balance", "tracked-entry", "current-price", "position-change", "position-status", "total-airdropped"]) {
      elements[id].textContent = "—";
      delete elements[id].dataset.state;
    }
  }

  function renderPosition(account) {
    const entryRaw = account.entry_price_raw;
    selectedEntryRaw = entryRaw || null;
    const currentRaw = protocol?.current_price_raw;
    const blocked = Number.isInteger(protocol?.current_epoch) && Number(account.blocked_epoch) >= protocol.current_epoch;
    elements["tracked-balance"].textContent = `${formatDecimal(account.tracked_burned_raw, protocol.burned_decimals, 4)} $TOPLAST`;
    elements["tracked-entry"].textContent = entryRaw ? `${formatPrice(entryRaw)} $EMBER` : "—";
    elements["current-price"].textContent = currentRaw ? `${formatPrice(currentRaw)} $EMBER` : "—";
    elements["total-airdropped"].textContent = `${formatDecimal(account.total_airdropped_ember_raw, protocol.ember_decimals, 4)} $EMBER`;

    if (!entryRaw || !currentRaw) {
      elements["position-status"].textContent = entryRaw ? "PRICE UNAVAILABLE" : "NO ENTRY";
      setMessage(entryRaw ? "Tracked entry found. Current indexed price is unavailable." : "No retained verified buy entry is indexed for this wallet.");
      return;
    }

    const change = formatPercent(currentRaw, entryRaw);
    const current = asRaw(currentRaw, true), entry = asRaw(entryRaw, true);
    if (!current || !entry) return;
    const burned = current < entry;
    elements["position-change"].textContent = change;
    elements["position-change"].dataset.state = burned ? "negative" : "positive";
    elements["position-status"].textContent = blocked ? "EXCLUDED THIS EPOCH" : burned ? "BLASTED" : "SAFE";
    elements["position-status"].dataset.state = blocked || burned ? "burned" : "safe";
    setMessage(blocked
      ? "A sell, send or burn blocks this wallet for the current epoch."
      : burned
        ? "Below tracked entry. Final eligibility is fixed at the epoch cutoff."
        : "Above tracked entry. This position is outside the Blast Zone.");
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
      const rows = await readRows("burned_wallet_accounts", {
        select: "wallet,tracked_burned_raw,tracked_cost_ember_raw,entry_price_raw,blocked_epoch,current_loss_ember_raw,burn_depth_bps,position_status,total_airdropped_ember_raw,last_airdrop_epoch,last_airdrop_signature,updated_at",
        project_id: `eq.${protocol.project_id}`,
        wallet: `eq.${selectedWallet}`,
        limit: "1"
      });
      if (!rows[0]) {
        clearPosition();
        selectedEntryRaw = null;
        if (!silent) setMessage("No verified TOPLAST entry or distribution is indexed for this wallet.");
        elements["position-status"].textContent = "NO ENTRY";
        renderIndexedChart();
      } else renderPosition(rows[0]);
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
        detail.textContent = `${formatBasisPoints(account.burn_depth_bps)} BELOW ENTRY`;
        wallet.append(detail);
        const loss = document.createElement("strong");
        loss.textContent = `${formatDecimal(account.current_loss_ember_raw, protocol.ember_decimals, 3)} $EMBER`;
        row.append(rank, wallet, loss);
        elements["leaderboard-list"].append(row);
      }
    }

    elements["airdrop-feed"].replaceChildren();
    const feed = [
      ...buys.slice(0, 4).map(item => ({kind:"TOP BLAST",wallet:item.wallet,amount:item.amount_toplast_raw,decimals:protocol.burned_decimals,unit:"$TOPLAST",detail:"VERIFIED BUY",order:new Date(item.occurred_at).getTime()})),
      ...distributions.slice(0, 4).map(item => ({kind:"AIRDROP",wallet:item.wallet,amount:item.amount_ember_raw,decimals:protocol.ember_decimals,unit:"$EMBER",detail:`EPOCH ${item.epoch_id}`,order:Number(item.epoch_id)*900000}))
    ].sort((a,b)=>b.order-a.order).slice(0,6);
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
        const amount = document.createElement("strong");
        amount.className = "feed-amount";
        amount.textContent = `${formatDecimal(item.amount,item.decimals,3)} ${item.unit}`;
        row.append(kind,wallet,amount);
        elements["airdrop-feed"].append(row);
      }
    }
  }

  async function loadProtocol() {
    if (!isPublicIndexConfigured() || protocolLoading) return;
    protocolLoading = true;
    try {
      const projectId = /^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.projectId || "") ? config.projectId : "toplast";
      const [statusRows, priceRows, leaderboardRows, buyRows, distributionRows] = await Promise.all([
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
          select: "wallet,current_loss_ember_raw,burn_depth_bps,position_status",
          project_id: `eq.${projectId}`,
          position_status: "eq.blasted",
          order: "current_loss_ember_raw.desc",
          limit: "5"
        }),
        readRows("toplast_buys", {
          select: "event_id,wallet,amount_toplast_raw,amount_ember_raw,occurred_at,signature",
          project_id: `eq.${projectId}`,
          order: "occurred_at.desc",
          limit: "12"
        }),
        readRows("toplast_distributions", {
          select: "distribution_id,wallet,amount_ember_raw,epoch_id,signature",
          project_id: `eq.${projectId}`,
          order: "epoch_id.desc",
          limit: "12"
        })
      ]);
      if (!statusRows[0]) {
        elements["data-status"].textContent = "AWAITING INDEX";
        return;
      }
      protocol = statusRows[0];
      protocol.current_epoch = protocol.current_epoch === null ? null : Number(protocol.current_epoch);
      protocol.burned_decimals = protocol.burned_decimals === null ? null : Number(protocol.burned_decimals);
      protocol.ember_decimals = protocol.ember_decimals === null ? null : Number(protocol.ember_decimals);
      epochPrices = priceRows.reverse();
      recentBuys = buyRows;
      recentDistributions = distributionRows;
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
      renderWatch(leaderboardRows,buyRows,distributionRows,delayed);
      if (selectedEntryRaw) renderIndexedChart(selectedEntryRaw);
      else renderIndexedChart();
      if (newBuys.length) showTopBlast(newBuys[0]);
      if (selectedWallet) await refreshSelectedWallet(true);
      else setMessage("Enter a wallet to load its verified TOPLAST position.");
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
    startPreview();
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
    try {
      if (!protocol) await loadProtocol();
      if (!protocol) throw new Error("Index unavailable");
      selectedWallet = wallet;
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
      window.setTimeout(() => { elements["copy-mint"].textContent = "COPY"; }, 1600);
    } catch {
      elements["copy-mint"].textContent = "COPY FAILED";
    }
  });

  startPreview();
  loadProtocol();
  window.setInterval(() => { if (!document.hidden) loadProtocol(); }, 15000);
})();
