// يولّد بيانات تطبيق POV (pov-app/data.json + اللوقوات) من صفحة الدليل index.html
import fs from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";

const [, , src, outDir] = process.argv;
const html = fs.readFileSync(src, "utf8");

function literal(name, open) {
  const m = new RegExp("const " + name + "\\s*=\\s*\\" + open).exec(html);
  if (!m) throw new Error("missing " + name);
  const close = open === "[" ? "]" : "}";
  const start = m.index + m[0].length - 1;
  let i = start, depth = 0, quote = null;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) break;
  }
  return vm.runInNewContext("(" + html.slice(start, i + 1) + ")");
}
const opt = (name) => { try { return literal(name, "{"); } catch { return {}; } };

const updated = /const LAST_UPDATE\s*=\s*"(.*?)"/.exec(html)[1];
const cats = literal("CATEGORIES", "[");
const GEO = opt("GEO"), IG = opt("IG"), MENU = opt("MENU"), TAGS = opt("TAGS"), MAPQ = opt("MAPQ");
const LOGOS = opt("LOGOS"), LOGOS_R = opt("LOGOS_R"), BN = opt("BN_IMG");

fs.mkdirSync(outDir + "/logos", { recursive: true });
const nameOf = (it) => (typeof it === "string" ? it : it.n);
const places = {};
const used = new Set();
for (const c of cats) for (const it of c.items) {
  const n = nameOf(it);
  if (places[n]) continue;
  const p = {};
  if (GEO[n]) p.geo = GEO[n];
  if (IG[n]) p.ig = IG[n];
  if (MENU[n]) p.menu = MENU[n];
  if (TAGS[n]) p.tag = TAGS[n];
  if (MAPQ[n]) p.q = MAPQ[n];
  const uri = LOGOS_R[n] || LOGOS[n];
  if (typeof uri === "string" && uri.startsWith("data:")) {
    const raw = Buffer.from(uri.split(";base64,")[1], "base64");
    const id = "l_" + crypto.createHash("md5").update(raw).digest("hex").slice(0, 10);
    const file = `${outDir}/logos/${id}.jpg`;
    if (!fs.existsSync(file)) fs.writeFileSync(file, raw);
    used.add(id + ".jpg");
    p.logo = id;
    p.round = !!LOGOS_R[n];
  }
  places[n] = p;
}
for (const f of fs.readdirSync(outDir + "/logos")) if (!used.has(f)) fs.unlinkSync(`${outDir}/logos/${f}`);
const banner = (id) => {
  const v = BN[id] || "";
  if (!v) return "";
  if (v.startsWith("banners/")) return "https://pov.rakaztech.com/" + v.split("?")[0];
  return "https://images.unsplash.com/" + v + "?auto=format&fit=crop&w=900&q=70";
};
const data = {
  updated,
  categories: cats.map((c) => ({ id: c.id, ar: c.ar, en: c.en, icon: c.icon || "", banner: banner(c.id), items: c.items.map(nameOf) })),
  places,
};
if (data.categories.length < 3 || Object.keys(places).length < 50) throw new Error("data looks broken, not publishing");
fs.writeFileSync(outDir + "/data.json", JSON.stringify(data));
console.log(updated, data.categories.length, "categories", Object.keys(places).length, "places");
