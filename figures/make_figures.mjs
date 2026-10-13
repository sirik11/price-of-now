// Figures for "The Price of Now", styled as a railway station: split-flap departure boards,
// a printed fare table, a route map, and a ticket receipt.
//
//   node figures/make_figures.mjs          (no dependencies; needs Python 3 and Google Chrome)
//
// Every number comes from realtime_cost.py --json, so the figures can't drift from the calculator.
// Type: Oswald, Inter, Space Mono (all OFL, in ./fonts). PNGs are rendered by headless Chrome at 2x.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const run = (...args) => JSON.parse(execFileSync("python3", [join(DIR, "..", "realtime_cost.py"), "--json", ...args]));
const BASE = run(), BATCHED = run("--batch", "10");
const fare = (route, rows = BASE) => rows.find((r) => r.route.startsWith(route)).monthly;
const usd = (v, d = 0) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

// palette: station night, flap tiles, amber signage, signal colours, timetable paper
const NIGHT = "#111316", PANEL = "#191C20", TILE = "#23272D", SPLIT = "#0A0B0D", AMBER = "#FFB52E";
const WHITE = "#ECEEF1", DIM = "#8B929C", RED = "#FF5B4F", GREEN = "#3ED38A";
const PAPER = "#F2F0E9", INK = "#16181B", GREY = "#6B7079", RULE = "#C9C6BC";
const LINES = { amber: "#E89B0C", blue: "#2464D6", green: "#1F9D61", purple: "#7A43B6", red: "#D93A2E" };
const COND = "Oswald, 'Arial Narrow', sans-serif", SANS = "Inter, Helvetica, sans-serif", MONO = "'Space Mono', Menlo, monospace";

const FONTS = `
@font-face{font-family:Oswald;src:url(fonts/Oswald-Variable.ttf);font-weight:200 700}
@font-face{font-family:Inter;src:url(fonts/Inter-Variable.ttf);font-weight:100 900}
@font-face{font-family:'Space Mono';src:url(fonts/SpaceMono-Regular.ttf);font-weight:400}
@font-face{font-family:'Space Mono';src:url(fonts/SpaceMono-Bold.ttf);font-weight:700}`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function T(x, y, s, { size = 20, fill = INK, font = SANS, weight = 400, anchor = "start", ls = 0, italic = false, opacity } = {}) {
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"` +
    ` letter-spacing="${ls}" font-style="${italic ? "italic" : "normal"}" xml:space="preserve"${opacity != null ? ` opacity="${opacity}"` : ""}>${esc(s)}</text>`;
}

// one split-flap character tile
function flap(x, y, w, h, ch, color = WHITE) {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.12}" fill="url(#tile)"/>`;
  s += `<rect x="${x}" y="${y + h / 2 - 1}" width="${w}" height="2.2" fill="${SPLIT}"/>`;
  s += `<circle cx="${x + 1.6}" cy="${y + h / 2}" r="1.6" fill="#3A3F46"/><circle cx="${x + w - 1.6}" cy="${y + h / 2}" r="1.6" fill="#3A3F46"/>`;
  if (ch !== " ") s += T(x + w / 2, y + h * 0.79, ch, { size: h * 0.78, font: COND, weight: 500, fill: color, anchor: "middle" });
  return s;
}
const flaps = (x, y, text, { w = 30, h = 46, gap = 4, color = WHITE } = {}) =>
  [...text].map((c, i) => flap(x + i * (w + gap), y, w, h, c, color)).join("");

const DEFS = `
<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#2B3037"/><stop offset="0.49" stop-color="${TILE}"/>
  <stop offset="0.51" stop-color="#1D2126"/><stop offset="1" stop-color="#262A30"/>
</linearGradient>
<filter id="paper" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/>
  <feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
</filter>
<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
  <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.35"/>
</filter>
<pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="#000" opacity="0.18"/></pattern>`;

const svg = (w, h, body, { bg = NIGHT, viewBox, grain = true } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox || `0 0 ${w} ${h}`}">` +
  `<style>${FONTS}</style><defs>${DEFS}</defs><rect x="-50" y="-50" width="1700" height="1000" fill="${bg}"/>${body}` +
  (grain ? `<rect x="-50" y="-50" width="1700" height="1000" filter="url(#paper)"/>` : "") + `</svg>`;

// ---------------------------------------------------------------- cover
function coverBody() {
  let b = `<rect x="0" y="0" width="1600" height="900" fill="${NIGHT}"/>`;
  b += T(84, 96, "DEPARTURES", { size: 22, font: COND, weight: 600, fill: AMBER, ls: 8 });
  b += T(1516, 96, "us-east-1 · per month", { size: 20, font: SANS, fill: DIM, anchor: "end" });
  b += `<rect x="84" y="116" width="1432" height="3" fill="${AMBER}"/>`;
  b += flaps(84, 160, "THE PRICE", { w: 74, h: 112, gap: 8, color: AMBER });
  b += flaps(84, 290, "OF NOW", { w: 74, h: 112, gap: 8, color: AMBER });
  const cx = 1330, cy = 330, r = 140;            // station clock, hands at "now"
  b += `<circle cx="${cx}" cy="${cy}" r="${r + 10}" fill="#2A2E34"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${WHITE}"/>`;
  for (let k = 0; k < 60; k++) {
    const t = (k / 60) * 2 * Math.PI, long = k % 5 === 0, r1 = long ? r - 26 : r - 12;
    b += `<line x1="${cx + r1 * Math.sin(t)}" y1="${cy - r1 * Math.cos(t)}" x2="${cx + (r - 6) * Math.sin(t)}" y2="${cy - (r - 6) * Math.cos(t)}" stroke="${NIGHT}" stroke-width="${long ? 7 : 2.5}"/>`;
  }
  const hand = (deg, len, w, c) => `<line x1="${cx}" y1="${cy}" x2="${cx + len * Math.sin(deg * Math.PI / 180)}" y2="${cy - len * Math.cos(deg * Math.PI / 180)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  b += hand(305, 70, 11, NIGHT) + hand(60, 108, 7, NIGHT) + hand(180, 116, 3, RED);
  b += `<circle cx="${cx}" cy="${cy}" r="9" fill="${RED}"/>`;
  b += T(86, 462, "One event stream. Eight ways to run it on AWS.", { size: 32, font: SANS, weight: 500, fill: WHITE });
  b += T(86, 506, "The bill isn’t set by how fresh the data is.", { size: 32, font: SANS, weight: 300, fill: DIM });
  // mini board
  const rows = [["MINUTES", "FIREHOSE > S3", usd(fare("Firehose")), RED], ["~1 SEC", "KINESIS PROVISIONED", usd(fare("Kinesis provisioned + Lambda")), GREEN],
    ["~1 SEC", "KINESIS ON-DEMAND", usd(fare("Kinesis on-demand + Lambda")), WHITE], ["<1 SEC", "MSK SERVERLESS", usd(fare("MSK Serverless")), WHITE]];
  const x0 = 84, y0 = 580;
  b += T(x0, y0 - 16, "FRESHNESS", { size: 15, font: COND, weight: 500, fill: DIM, ls: 3 });
  b += T(x0 + 290, y0 - 16, "ROUTE", { size: 15, font: COND, weight: 500, fill: DIM, ls: 3 });
  b += T(1516, y0 - 16, "FARE", { size: 15, font: COND, weight: 500, fill: DIM, ls: 3, anchor: "end" });
  rows.forEach(([f, r, p, c], i) => {
    const y = y0 + i * 62, o = { w: 26, h: 44, gap: 3 };
    b += flaps(x0, y, f.padEnd(8), { ...o, color: AMBER });
    b += flaps(x0 + 290, y, r.padEnd(20), o);
    b += flaps(1516 - 7 * 29 + 3, y, p.padStart(7), { ...o, color: c });
  });
  b += T(1516, 868, "KINESIS · FIREHOSE · FLINK · MSK", { size: 16, font: COND, weight: 500, fill: DIM, ls: 4, anchor: "end" });
  return b;
}
const cover = () => svg(1600, 900, coverBody(), { grain: false });
const social = () => svg(1200, 630, coverBody(), { grain: false, viewBox: "0 60 1600 840" });

// ---------------------------------------------------------------- figure 1: the full board
function fig1() {
  let b = T(80, 92, "Same stream, eight routes", { size: 48, font: COND, weight: 600, fill: WHITE });
  b += T(80, 132, "2,000 events/s × 500 bytes · one consumer · us-east-1 · monthly fare at the smallest size that carries the load", { size: 19, fill: DIM });
  b += `<rect x="60" y="160" width="1480" height="640" rx="14" fill="${PANEL}" filter="url(#shadow)"/>`;
  const label = { "Firehose to S3": "FIREHOSE > S3", "Kinesis provisioned + Lambda": "KINESIS PROVISIONED",
    "Kinesis on-demand + Lambda": "KINESIS ON-DEMAND", "Kinesis on-demand Advantage + Lambda": "KINESIS OD ADVANTAGE",
    "Kinesis provisioned + Flink": "KINESIS + FLINK", "MSK provisioned (3 brokers)": "MSK PROVISIONED",
    "MSK Express (3 brokers)": "MSK EXPRESS", "MSK Serverless": "MSK SERVERLESS" };
  const fresh = { "minutes": "MINUTES", "~1 second": "~1 SEC", "seconds, stateful": "SECS+STATE", "sub-second": "<1 SEC" };
  const x0 = 90, o = { w: 24, h: 40, gap: 3 }, max = Math.max(...BASE.map((r) => r.monthly));
  b += T(x0, 205, "FRESHNESS", { size: 14, font: COND, weight: 500, fill: DIM, ls: 3 });
  b += T(x0 + 300, 205, "ROUTE", { size: 14, font: COND, weight: 500, fill: DIM, ls: 3 });
  b += T(x0 + 900, 205, "FARE / MONTH", { size: 14, font: COND, weight: 500, fill: DIM, ls: 3 });
  BASE.forEach((r, i) => {
    const y = 226 + i * 68, low = r.route.startsWith("Kinesis provisioned + Lambda"), fh = r.route.startsWith("Firehose");
    b += flaps(x0, y, fresh[r.freshness].padEnd(10), { ...o, color: AMBER });
    b += flaps(x0 + 300, y, label[r.route].padEnd(20), o);
    b += flaps(x0 + 900, y, usd(r.monthly).padStart(6), { ...o, color: fh ? RED : low ? GREEN : WHITE });
    const bw = 300 * r.monthly / max;
    b += `<rect x="${x0 + 1080}" y="${y + 12}" width="${Math.max(bw, 3)}" height="16" rx="3" fill="${fh ? RED : low ? GREEN : AMBER}" opacity="${fh || low ? 1 : 0.75}"/>`;
  });
  b += T(80, 846, `Firehose is the "slow, cheap" option, and it costs ${(fare("Firehose") / fare("Kinesis provisioned + Lambda")).toFixed(1)}× more than one-second Kinesis. Each 500-byte event is billed as 5 KB.`, { size: 21, fill: WHITE, weight: 500 });
  b += T(80, 878, "Source: realtime_cost.py, AWS Price List API offer files published September 11, 2026. Excludes cross-AZ transfer, the query layer, and headroom.", { size: 14, fill: DIM });
  return svg(1600, 900, b, { grain: false });
}

// ---------------------------------------------------------------- figure 2: billed vs sent
function fig2() {
  let b = T(80, 96, "You pay for the box, not the parcel", { size: 52, font: COND, weight: 600 });
  b += T(80, 138, "Box area is what a 500-byte event is billed as. Each parcel is 500 bytes. Rounding happens per record.", { size: 21, fill: GREY });
  const unit = 66, baseY = 600;
  const parcel = (x, y, w, h) => `<rect x="${x + 1.5}" y="${y + 1.5}" width="${w - 3}" height="${h - 3}" rx="3" fill="${LINES.amber}" stroke="#9C6400" stroke-width="1.4"/>` +
    `<line x1="${x + w / 2}" y1="${y + 3}" x2="${x + w / 2}" y2="${y + h - 3}" stroke="#9C6400" stroke-width="1.2"/>`;
  const panels = [
    ["SENT", "one event", "500 B", 500, 1, "1\u00d7", INK],
    ["KINESIS ON-DEMAND", "rounded up to the nearest 1 KB", "billed as 1 KB", 1024, 1, "2\u00d7", INK],
    ["FIREHOSE", "billed in 5 KB increments", "billed as 5 KB", 5120, 1, "10\u00d7", LINES.red],
    ["FIREHOSE, BATCHED", "10 events packed in one record", "5 KB for 10 events", 5120, 10, "~1\u00d7", LINES.green],
  ];
  panels.forEach(([h, sub, line, bytes, n, mult, c], i) => {
    const cx = 230 + i * 380, side = unit * Math.sqrt(bytes / 500), x = cx - side / 2, y = baseY - side;
    b += `<rect x="${x}" y="${y}" width="${side}" height="${side}" fill="#FFFFFF" stroke="${c}" stroke-width="3" ${i ? "" : 'stroke-dasharray="6 5"'}/>`;
    if (n === 1) b += parcel(cx - unit / 2, baseY - unit, unit, unit);
    else {                                       // 10 parcels of equal area filling 5,000 of the 5,120 bytes
      const pw = side / 5, ph = (unit * unit) / pw;
      for (let k = 0; k < n; k++) b += parcel(x + (k % 5) * pw, baseY - ph * (1 + Math.floor(k / 5)), pw, ph);
    }
    b += T(cx, y - 22, mult, { size: 44, font: COND, weight: 600, anchor: "middle", fill: c });
    b += T(cx, baseY + 52, h, { size: 23, font: COND, weight: 600, anchor: "middle", fill: c, ls: 1 });
    b += T(cx, baseY + 82, sub, { size: 17, fill: GREY, anchor: "middle" });
    b += T(cx, baseY + 126, line, { size: 20, font: MONO, anchor: "middle" });
  });
  b += `<line x1="80" y1="${baseY}" x2="1520" y2="${baseY}" stroke="${RULE}" stroke-width="2"/>`;
  b += T(80, 812, "Kinesis provisioned charges per 25 KB PUT payload unit instead, so a 500-byte record pays for a unit it fills about a fiftieth of.", { size: 18, fill: INK });
  b += T(80, 852, "Rules quoted from the Kinesis Data Streams and Data Firehose pricing pages (Direct PUT and Kinesis sources), October 2026.", { size: 14, fill: GREY });
  return svg(1600, 900, b, { bg: PAPER });
}

// ---------------------------------------------------------------- figure 3: minimum fares
function fig3() {
  let b = T(80, 96, "The minimum fare, before a single event", { size: 52, font: COND, weight: 600 });
  b += T(80, 138, "What each option charges per month with no traffic at all, us-east-1", { size: 21, fill: GREY });
  const rows = [["Data Firehose", "", 0], ["Kinesis provisioned", "per shard", 10.8], ["Kinesis on-demand Standard", "per stream", 28.8],
    ["Managed Flink (smallest app)", "per application", 163.4], ["MSK, 3 x kafka.m7g.large", "per cluster", 440.64],
    ["MSK Serverless", "per cluster", 540], ["MSK Express, 3 x m7g.large", "per cluster", 881.28], ["Kinesis on-demand Advantage", "per account", 3037.5]];
  const x0 = 520, span = 880, top = 200, rh = 70;
  rows.forEach(([name, per, v], i) => {
    const y = top + i * rh, w = span * v / 3037.5, hot = v > 2000;
    b += `<line x1="80" y1="${y + rh - 8}" x2="1520" y2="${y + rh - 8}" stroke="${RULE}" stroke-width="1" stroke-dasharray="2 5"/>`;
    b += T(80, y + 36, name, { size: 23, weight: 600 });
    if (per) b += T(80, y + 58, per, { size: 15, fill: GREY });
    b += `<rect x="${x0}" y="${y + 14}" width="${Math.max(w, 2)}" height="30" fill="${hot ? LINES.red : INK}"/>`;
    b += T(x0 + Math.max(w, 2) + 14, y + 38, usd(v, v % 1 ? 2 : 0), { size: 24, font: MONO, weight: 700, fill: hot ? LINES.red : INK });
  });
  b += T(80, 812, "Freshness gets expensive through fixed charges like these, not through per-event prices.", { size: 21, weight: 500 });
  b += T(80, 852, "Flink: 1 KPU + 1 orchestration KPU + 50 GB storage. Advantage: 25 MB/s in and out minimum, account-wide. Source: AWS pricing pages and Price List API.", { size: 14, fill: GREY });
  return svg(1600, 900, b, { bg: PAPER });
}

// ---------------------------------------------------------------- figure 4: route map
function fig4() {
  let b = T(80, 96, "Which line do you need?", { size: 52, font: COND, weight: 600 });
  b += T(80, 138, "Start from who acts on the data, not from the word “real-time.” Fares are for the stream above.", { size: 21, fill: GREY });
  const hub = [200, 470];
  const routes = [
    [LINES.amber, "A person, every few minutes", 250, [["Firehose → S3, batched", usd(fare("Firehose", BATCHED))]]],
    [LINES.blue, "A system, within seconds", 400, [["Kinesis provisioned", usd(fare("Kinesis provisioned + Lambda")) + " · steady"], ["Kinesis on-demand", usd(fare("Kinesis on-demand + Lambda")) + " · spiky"]]],
    [LINES.green, "Needs windows, joins, state", 560, [["+ Managed Flink", "from $163 per app"]]],
    [LINES.purple, "Already on Kafka, many consumers", 710, [["Amazon MSK", "from " + usd(fare("MSK provisioned"))]]],
  ];
  b += `<path d="M${hub[0]} ${hub[1]} L420 ${hub[1]}" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>`;
  routes.forEach(([c, label, y, stations]) => {
    const end = stations.length === 1 ? 1380 : 1480, bend = 420 + Math.abs(y - hub[1]);
    b += `<path d="M420 ${hub[1]} L${bend} ${y} L${end} ${y}" fill="none" stroke="${c}" stroke-width="16" stroke-linejoin="round"/>`;
    b += `<rect x="${end - 4}" y="${y - 22}" width="8" height="44" fill="${c}"/>`;          // terminus bar
    b += T(Math.max(bend, 660) + 30, y - 24, label.toUpperCase(), { size: 19, font: COND, weight: 600, fill: c, ls: 1.5 });
    stations.forEach(([name, price], k) => {
      const sx = stations.length === 1 ? 1200 : 1060 + k * 330;
      b += `<circle cx="${sx}" cy="${y}" r="17" fill="#FFF" stroke="${INK}" stroke-width="5"/>`;
      b += T(sx, y + 50, name, { size: 21, weight: 700, anchor: "middle" });
      b += T(sx, y + 76, price, { size: 18, font: MONO, anchor: "middle", fill: GREY });
    });
  });
  b += `<circle cx="${hub[0]}" cy="${hub[1]}" r="34" fill="#FFF" stroke="${INK}" stroke-width="7"/>`;
  b += T(hub[0], hub[1] + 72, "WHO ACTS", { size: 20, font: COND, weight: 600, anchor: "middle", ls: 1.5 });
  b += T(hub[0], hub[1] + 96, "ON THE DATA?", { size: 20, font: COND, weight: 600, anchor: "middle", ls: 1.5 });
  b += T(80, 852, "Batch the producer on every line. Kinesis fares include a Lambda consumer; MSK excludes cross-AZ client transfer.", { size: 14, fill: GREY });
  return svg(1600, 900, b, { bg: PAPER });
}

// ---------------------------------------------------------------- receipt (README)
function receipt() {
  const rw = 640, rx = 480, ry = 40;
  const items = BASE.map((r) => [r.route.replace(" + Lambda", "").replace(" (3 brokers)", ""), r.monthly]);
  const rh = 250 + items.length * 40 + 250;
  // torn edges: paper with a zigzag top and bottom
  let edge = `M${rx} ${ry}`;
  for (let x = rx; x < rx + rw; x += 16) edge += ` L${x + 8} ${ry - 9} L${x + 16} ${ry}`;
  edge += ` L${rx + rw} ${ry + rh}`;
  for (let x = rx + rw; x > rx; x -= 16) edge += ` L${x - 8} ${ry + rh + 9} L${x - 16} ${ry + rh}`;
  let b = `<g filter="url(#shadow)" transform="rotate(-1.5 800 450)">`;
  b += `<path d="${edge} Z" fill="#FBFBF8"/>`;
  let y = ry + 60;
  const L = (s, o = {}) => { b += T(rx + 40, y, s, { size: 19, font: MONO, ...o }); };
  const R = (s, o = {}) => { b += T(rx + rw - 40, y, s, { size: 19, font: MONO, anchor: "end", ...o }); };
  b += T(rx + rw / 2, y, "THE PRICE OF NOW", { size: 30, font: MONO, weight: 700, anchor: "middle" }); y += 34;
  b += T(rx + rw / 2, y, "FARE CALCULATOR · us-east-1", { size: 17, font: MONO, anchor: "middle", fill: GREY }); y += 44;
  L("2,000 ev/s x 500 B, 1 consumer"); y += 28;
  L("30-day month", { fill: GREY }); y += 22;
  b += `<line x1="${rx + 40}" y1="${y}" x2="${rx + rw - 40}" y2="${y}" stroke="${INK}" stroke-dasharray="4 6"/>`; y += 40;
  for (const [name, v] of items) { L(name.length > 30 ? name.slice(0, 29) + "." : name); R(usd(v, 2)); y += 40; }
  b += `<line x1="${rx + 40}" y1="${y - 14}" x2="${rx + rw - 40}" y2="${y - 14}" stroke="${INK}" stroke-dasharray="4 6"/>`; y += 24;
  L("LOWEST FARE", { weight: 700 }); R(usd(fare("Kinesis provisioned + Lambda"), 2), { weight: 700 }); y += 30;
  L("Kinesis provisioned", { fill: GREY }); y += 44;
  L("* excl. cross-AZ transfer, query", { size: 15, fill: GREY }); y += 22;
  L("  layer, free tier, headroom", { size: 15, fill: GREY }); y += 40;
  for (let k = 0; k < 46; k++) {                          // barcode
    const w = [2, 4, 1, 3][(k * 7) % 4];
    b += `<rect x="${rx + 120 + k * 9}" y="${y}" width="${w}" height="54" fill="${INK}"/>`;
  }
  b += `</g>`;
  return svg(1600, 900, `<rect x="0" y="0" width="1600" height="900" fill="#2A2E34"/>` + b, { grain: true });
}

// ---------------------------------------------------------------- render
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = join(process.env.TMPDIR || "/tmp", "price-of-now-figures-chrome");

function render(name, svgText, w, h) {
  writeFileSync(join(DIR, `${name}.svg`), svgText);
  const html = join(DIR, `.render-${name}.html`), png = join(DIR, `${name}.png`);
  writeFileSync(html, `<!doctype html><html><head><style>html,body{margin:0;background:${NIGHT}}svg{display:block}</style></head><body>${svgText}</body></html>`);
  if (existsSync(png)) unlinkSync(png);
  const p = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    `--user-data-dir=${PROFILE}`, `--window-size=${w},${h}`, "--force-device-scale-factor=2",
    "--virtual-time-budget=4000", `--screenshot=${png}`, `file://${html}`], { stdio: "ignore" });
  return new Promise((resolve, reject) => {
    const t0 = Date.now(); let last = -1;
    const tick = setInterval(() => {
      const size = existsSync(png) ? statSync(png).size : -1;
      if (size > 0 && size === last) { clearInterval(tick); p.kill(); unlinkSync(html); resolve(size); }
      else if (Date.now() - t0 > 30000) { clearInterval(tick); p.kill(); reject(new Error(`timeout: ${name}`)); }
      last = size;
    }, 700);
  });
}

const JOBS = [
  ["cover-the-price-of-now", cover, 1600, 900], ["cover-social-1200x630", social, 1200, 630],
  ["fig1-departure-board", fig1, 1600, 900], ["fig2-billed-vs-sent", fig2, 1600, 900],
  ["fig3-minimum-fares", fig3, 1600, 900], ["fig4-route-map", fig4, 1600, 900], ["receipt", receipt, 1600, 900],
];
const only = process.argv.slice(2);
for (const [name, fn, w, h] of JOBS) {
  if (only.length && !only.some((s) => name.includes(s))) continue;
  const bytes = await render(name, fn(), w, h);
  console.log(`${name}.png  ${(bytes / 1024).toFixed(0)} KB`);
}
