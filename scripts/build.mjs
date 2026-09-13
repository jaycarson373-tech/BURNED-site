import { cp, link, mkdir, rm, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { burnedPublicConfig } from "./burned-config.mjs";

const html = await readFile("public/index.html", "utf8");
const app = await readFile("public/app.js", "utf8");
for (const required of [
  "<title>BURNED", "GET BURNED.", "GET $EMBER.", "$BURNED / $EMBER", "Burn Zone", "weighted average entry", "~15 MIN", "METEORA",
  'id="blast-zone"', 'id="watch"', 'id="account"', 'id="how-it-works"', 'id="rules"', 'id="reward-history"', 'id="preview-controls"'
]) {
  if (!html.includes(required)) throw new Error(`Missing site content: ${required}`);
}
for (const match of html.matchAll(/href="#([^"]+)"/g)) {
  if (!html.includes(`id="${match[1]}"`)) throw new Error(`Broken anchor: ${match[1]}`);
}
for (const name of ["style.css", "app.js", "runtime-config.js", "burned-logo.png", "favicon-burned.png", "apple-touch-icon-burned.png"]) {
  if (!(await stat(join("public", name))).size) throw new Error(`Empty asset: ${name}`);
}
if (/[←-⇿➔-➿]/u.test(html)) throw new Error("Arrow glyphs are not allowed");
const visibleText = html.replace(/<[^>]+>/g, " ");
if (/TOPLAST|TOPBLAST|TOP BLAST|BLAST ZONE|\$RAY|STONK FUN|QQQx/i.test(visibleText)) throw new Error("Stale public brand or pair");
if (/ecosystem|flywheel|revolutionary|next-generation|community-powered|seamless|innovative|game-changing|redefining|unlock|future of finance/i.test(html)) {
  throw new Error("Banned filler copy found");
}

if (/COPY TEST CA|TEST CONTRACT|TEST TOKEN|TEST DATA|DELIVERY TEST|verified-deliveries|FsiD/i.test(`${html}\n${app}`)) {
  throw new Error("Staging data or test addresses must not ship in the public site");
}
if (/\bMET\b|ASHBACK/.test(html)) throw new Error("Stale token branding or pairing");
for (const name of ["burned-logo.png", "favicon-burned.png", "apple-touch-icon-burned.png"]) {
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
const config = burnedPublicConfig(process.env);
await writeFile(join("dist", "runtime-config.js"), `window.__BURNED_PUBLIC_CONFIG__ = Object.freeze(${JSON.stringify(config)});\n`);
console.log("BURNED build complete. Brand, assets, links, responsive styles and isolated public configuration validated.");
