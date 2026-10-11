import QRCode from "qrcode";
import { jsPDF } from "jspdf";

const W = 430;
const H = 832.61;      // real card height from your CSS layout
const SCALE = 6;       // 6x => 2580px wide. Raise for even more detail
const SANS = "Arial,Helvetica,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// text measuring (same font engine the SVG will use)
const measure = (() => {
  const ctx = document.createElement("canvas").getContext("2d");
  return (text, font, spacing = 0) => {
    ctx.font = font;
    return ctx.measureText(text).width + [...text].length * spacing;
  };
})();

// CSS linear-gradient(angle) -> SVG userSpace gradient
const cssGradient = (id, angle, x, y, w, h, stops) => {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = x + w / 2, cy = y + h / 2;
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"
    x1="${cx - (dx * len) / 2}" y1="${cy - (dy * len) / 2}"
    x2="${cx + (dx * len) / 2}" y2="${cy + (dy * len) / 2}">
    ${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`;
};

// decorative concentric rings (your :before / :after with box-shadows)
const ring = (id, cx, cy) => `
  <mask id="hole-${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="113" fill="#000"/>
  </mask>
  <g opacity=".55" mask="url(#hole-${id})">
    <circle cx="${cx}" cy="${cy}" r="146" fill="#c3d8f2"/>
    <circle cx="${cx}" cy="${cy}" r="144" fill="#edf4fd"/>
    <circle cx="${cx}" cy="${cy}" r="130" fill="#c3d8f2"/>
    <circle cx="${cx}" cy="${cy}" r="128" fill="#e4eefb"/>
    <circle cx="${cx}" cy="${cy}" r="115" fill="#c3d8f2"/>
  </g>`;

// side notch with the inset shadow
const notch = (id, cx, cy) => `
  <clipPath id="nc-${id}"><circle cx="${cx}" cy="${cy}" r="21"/></clipPath>
  <circle cx="${cx}" cy="${cy}" r="21" fill="#e8eef8"/>
  <g clip-path="url(#nc-${id})">
    <path filter="url(#blur2)" fill="#6f8fb5" fill-opacity=".169" fill-rule="evenodd"
      d="M${cx - 80} ${cy - 80}h160v160h-160z M${cx - 21} ${cy + 2}a21 21 0 1 0 42 0a21 21 0 1 0 -42 0z"/>
  </g>`;

// QR as pure vector path (row runs merged -> no seams)
const qrPath = (text, x, y, size) => {
  const qr = QRCode.create(text || "N/A", { errorCorrectionLevel: "H" });
  const n = qr.modules.size, data = qr.modules.data, m = size / n;
  let d = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!data[r * n + c]) { c++; continue; }
      let start = c;
      while (c < n && data[r * n + c]) c++;
      d += `M${(x + start * m).toFixed(3)} ${(y + r * m).toFixed(3)}h${((c - start) * m).toFixed(3)}v${m.toFixed(3)}h${(-(c - start) * m).toFixed(3)}z`;
    }
  }
  return `<path d="${d}" fill="#000"/>`;
};

const buildSvg = (member) => {
  const name = String(member.member_name || "");
  const mandal = member.mandal_name || "";
  const kshetra = member.kshetra_name || "";
  const code = member.internal_code || "";

  // person name: 43px / 800 / -1.4px, shrink to fit one line (372px)
  let fs = 43, ls = -1.4;
  const nameW = measure(name, `700 43px ${SANS}`, -1.4);
  if (nameW > 372) { const k = 372 / nameW; fs = 43 * k; ls = -1.4 * k; }
  const nameBase = 321.29 - (43 - fs) * 0.3;

  // subtitle with side lines
  const subText = "BAPS NAVARATRI";
  const subW = measure(subText, `700 14px ${SANS}`, 5);
  const subStart = W / 2 - (80 + 24 + subW) / 2;

  // QR
  const qrX = 105, qrY = 439.61;

  // id pill row
  const pillW = Math.max(142, measure(code, `700 25px ${SANS}`, 1) + 52);
  const rowW = 138 + pillW;
  const rx0 = W / 2 - rowW / 2;
  const rowCY = 714.11;
  const pillX = rx0 + 35 + 12 + 10 + 12;
  const diamond = (cx) =>
    `<rect x="${cx - 4}" y="${rowCY - 4}" width="8" height="8" fill="none" stroke="#527fb8" stroke-width="2" transform="rotate(45 ${cx} ${rowCY})"/>`;

  // footer flowers (space-around)
  const glyphs = ["❋", "✿", "❋", "✿", "❋", "✿", "❋"];
  const gw = glyphs.map((g) => measure(g, `30px ${SANS}`, 2));
  const gap = (372 - gw.reduce((a, b) => a + b, 0)) / 7;
  let gx = 29 + gap / 2;
  const flowers = glyphs.map((g, i) => {
    const out = `<text x="${gx.toFixed(2)}" y="803" font-size="30" letter-spacing="2" fill="#6492c7" font-family="${SANS}">${g}</text>`;
    gx += gw[i] + gap;
    return out;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}" text-rendering="geometricPrecision">
<defs>
  ${cssGradient("bg", 145, 1, 1, 428, H - 2, [[0, "#ffffff"], [0.52, "#f7f9fd"], [1, "#edf4ff"]])}
  ${cssGradient("pill", 110, pillX, 691.61, pillW, 45, [[0, "#e3edfb"], [1, "#d5e4f8"]])}
  <clipPath id="inner"><rect x="1" y="1" width="428" height="${H - 2}" rx="33"/></clipPath>
  <filter id="blur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
  <filter id="qrShadow" x="-30%" y="-30%" width="160%" height="170%">
    <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#315b8c" flood-opacity=".125"/>
  </filter>
</defs>

<rect width="${W}" height="${H}" fill="#e8eef8"/>
<rect width="${W}" height="${H}" rx="34" fill="url(#bg)"/>

<g clip-path="url(#inner)">
  <!-- corner circles -->
  <circle cx="1" cy="1" r="121.5" fill="#d5e5fa"/>
  <circle cx="429" cy="1" r="121.5" fill="#d5e5fa"/>
  <circle cx="1" cy="482.75" r="77.3" fill="#e0ebfa"/>
  <circle cx="429" cy="482.75" r="77.3" fill="#e0ebfa"/>

  ${ring("a", 21, -14)}
  ${ring("b", 469, 646.61)}
  ${notch("l", 0, 304.4)}
  ${notch("r", 430, 304.4)}

  <!-- emblem -->
  <svg x="174" y="35" width="82" height="68" viewBox="0 0 100 80">
    <g fill="none" stroke="#527fb8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M50 8 C40 24 43 31 50 38 C57 31 60 24 50 8Z"/>
      <path d="M48 38 C34 25 24 31 23 40 C34 43 42 42 48 38Z"/>
      <path d="M52 38 C66 25 76 31 77 40 C66 43 58 42 52 38Z"/>
      <path d="M25 48 Q50 61 75 48 Q66 66 50 66 Q34 66 25 48Z"/>
      <path d="M16 18 L40 43 M84 18 L60 43" stroke-width="5"/>
      <path d="M13 15 l-4 -4 M18 20 l-4 -4 M82 20 l4 -4 M87 15 l4 -4"/>
    </g>
  </svg>

  <!-- brand -->
  <g font-family="${SERIF}" font-size="58" letter-spacing="-2" fill="#102b4d" text-anchor="middle">
    <text x="215" y="156.76">BHAKTI</text>
    <text x="215" y="207.8">PARVA</text>
  </g>

  <!-- subtitle -->
  <rect x="${subStart}" y="238.38" width="40" height="1.5" fill="#527fb8"/>
  <text x="${subStart + 52}" y="244" font-family="${SANS}" font-weight="700" font-size="14" letter-spacing="5" fill="#527fb8">${subText}</text>
  <rect x="${subStart + 52 + subW + 12}" y="238.38" width="40" height="1.5" fill="#527fb8"/>

  <!-- person + location -->
  <text x="215" y="${nameBase.toFixed(2)}" text-anchor="middle" font-family="${SANS}" font-weight="700"
        font-size="${fs.toFixed(2)}" letter-spacing="${ls.toFixed(3)}" fill="#102b4d">${esc(name)}</text>
  <text x="215" y="364.11" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="21" fill="#4b76ac">${esc(mandal)}</text>
  <text x="215" y="392.42" text-anchor="middle" font-family="${SANS}" font-size="19" fill="#4b76ac">${esc(kshetra)}</text>

  <!-- QR -->
  <rect x="91" y="425.61" width="248" height="248" rx="26" fill="#fff" filter="url(#qrShadow)"/>
  ${qrPath(code, qrX, qrY, 220)}

  <!-- id row -->
  <rect x="${rx0}" y="${rowCY - 0.75}" width="35" height="1.5" fill="#6e9bd0"/>
  ${diamond(rx0 + 47 + 0)}
  <rect x="${pillX}" y="691.61" width="${pillW}" height="45" rx="22.5" fill="url(#pill)"/>
  <text x="${pillX + pillW / 2 + 0.5}" y="722.77" text-anchor="middle" font-family="${SANS}" font-weight="700"
        font-size="25" letter-spacing="1" fill="#173b66">${esc(code)}</text>
  ${diamond(pillX + pillW + 17)}
  <rect x="${pillX + pillW + 12 + 10 + 12}" y="${rowCY - 0.75}" width="35" height="1.5" fill="#6e9bd0"/>

  <!-- footer -->
  <line x1="30" y1="761.61" x2="400" y2="761.61" stroke="#8db2df" stroke-width="2"
        stroke-linecap="round" stroke-dasharray="0 ${(370 / 92).toFixed(4)}"/>
  ${flowers}
</g>

<!-- border + inset 1px line -->
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="33.5" fill="none" stroke="#fff"/>
<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="32.5" fill="none" stroke="#d8e5f7"/>
</svg>`;
};

const svgToCanvas = async (svg) => {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * SCALE);
    canvas.height = Math.round(H * SCALE);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const generateProjectQRPass = async (member) => {
  const canvas = await svgToCanvas(buildSvg(member));

  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [W, H] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, W, H, undefined, "FAST");
  pdf.save(`${String(member.member_name).replace(/\s+/g, "_")}_ID_Pass.pdf`);
};