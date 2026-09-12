import { cp, link, mkdir, rm, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validatePublicSupabaseKey } from "./public-key.mjs";

const html = await readFile("public/index.html", "utf8");
const app = await readFile("public/app.js", "utf8");
for (const required of [
  "<title>Topblast",
  "GET PAID TO",
  "Topblast.",
  "$TOPBLAST / $EMBER",
  "Blast Zone",
  "weighted average entry",
  "BASE FEE",
  "3%",
  "approximately every 15 minutes",
  'id="blast-zone"',
  'id="watch"',
  'id="account"',
  'id="how-it-works"',
  'id="rules"',
  'id="airdrop-history"',
  'id="market-topblast-price"',
  'id="market-next-epoch"',
  'id="leaderboard-title">Topblast LEADERBOARD'
]) {
  if (!html.includes(required)) throw new Error(`Missing site content: ${required}`);
}
for (const match of html.matchAll(/href="#([^"]+)"/g)) {
  if (!html.includes(`id="${match[1]}"`)) throw new Error(`Broken anchor: ${match[1]}`);
}
for (const name of ["style.css", "app.js", "runtime-config.js", "topblast-logo.png", "favicon.png", "apple-touch-icon.png"]) {
  if (!(await stat(join("public", name))).size) throw new Error(`Empty asset: ${name}`);
}
if (/[←-⇿➔-➿]/u.test(html)) throw new Error("Arrow glyphs are not allowed");
if (/\b(?:TOPLAST|BURNED|BURN ZONE|\$TOPLAST|\$BURNED)\b/i.test(html)) throw new Error("Stale public branding");
if (/ecosystem|flywheel|revolutionary|next-generation|community-powered|seamless|innovative|game-changing|redefining|unlock|future of finance/i.test(html)) {
  throw new Error("Banned filler copy found");
}
if (html.includes("embercurve.fun")) throw new Error("Outbound Ember links are not allowed");
if (/COPY TEST CA|TEST CONTRACT|TEST TOKEN|TEST DATA|DELIVERY TEST|verified-deliveries|FsiD/i.test(`${html}\n${app}`)) {
  throw new Error("Staging data or test addresses must not ship in the public site");
}
if (/\bMET\b|ASHBACK/.test(html)) throw new Error("Stale token branding or pairing");
for (const name of ["topblast-logo.png", "favicon.png", "apple-touch-icon.png"]) {
  const image = await readFile(join("public", name));
  if (image.length < 26 || image[25] !== 6) throw new Error(`${name} must be an RGBA PNG with transparency`);
}
const css = await readFile("public/style.css", "utf8");
if (!/@media\s*\(max-width:\s*760px\)/.test(css) || !css.includes("prefers-reduced-motion") || !css.includes(":focus-visible")) {
  throw new Error("Missing responsive or accessibility styles");
}
for (const match of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
  if (!(await stat(join("public", match[1].slice(1)))).size) throw new Error(`Missing local asset: ${match[1]}`);
}

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const name of await readdir("public")) {
  const source = join("public", name);
  const destination = join("dist", name);
  if ((await stat(source)).isFile() && name.endsWith(".png")) await link(source, destination);
  else await cp(source, destination, { recursive: true });
}

if (process.env.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY must never be configured in the public site build");
const supabaseUrl = (process.env.PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseKey = (process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) throw new Error("PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY must be configured together");
if (supabaseUrl) {
  const endpoint = new URL(supabaseUrl);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("PUBLIC_SUPABASE_URL must be an HTTPS project URL");
  }
  validatePublicSupabaseKey(supabaseKey);
}
const projectId = (process.env.TOPBLAST_PROJECT_ID ?? "topblast").trim();
if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(projectId)) throw new Error("TOPBLAST_PROJECT_ID must be a short lowercase slug");
const xUrl = (process.env.PUBLIC_X_URL ?? "").trim();
if (xUrl && !/^https:\/\/(?:www\.)?x\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(xUrl)) throw new Error("PUBLIC_X_URL must be the official X profile URL");
const topblastMint = (process.env.PUBLIC_TOPBLAST_MINT ?? "").trim();
if (topblastMint && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(topblastMint)) throw new Error("PUBLIC_TOPBLAST_MINT must be a Solana address");
const dexscreenerUrl = (process.env.PUBLIC_DEXSCREENER_URL ?? "").trim();
if (dexscreenerUrl && !/^https:\/\/dexscreener\.com\/solana\/[1-9A-HJ-NP-Za-km-z]{32,44}\/?$/.test(dexscreenerUrl)) {
  throw new Error("PUBLIC_DEXSCREENER_URL must be a Solana Dexscreener pair URL");
}
await writeFile(join("dist", "runtime-config.js"), `window.__TOPBLAST_PUBLIC_CONFIG__ = Object.freeze(${JSON.stringify({ supabaseUrl, supabaseKey, projectId, xUrl, topblastMint, dexscreenerUrl })});\n`);
console.log("Topblast production build complete. Branding, metadata, assets, links, responsive styles and public configuration validated.");
