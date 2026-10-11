import QRCode from "qrcode";
import { jsPDF } from "jspdf";

// ───────────────────────── config ─────────────────────────
const W = 430;
const CUT = 68;              // height removed with the logo
const H = 832.61 - CUT;      // 764.61
const SCALE = 4; // 1720px wide ≈ 386dpi at print size
const JPEG_QUALITY = 0.95;
const MAX_CONCURRENCY = Math.min(
  4,
  (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2,
);
const JOB_TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;

const SANS = "Arial,Helvetica,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const QR_X = 105,
  QR_Y = 439.61 - CUT,       // vector QR in the PDF moves up too
  QR_SIZE = 220;

// ───────────────────────── helpers ─────────────────────────
const esc = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const abortError = () => new DOMException("Aborted", "AbortError");

const withTimeout = (p, ms) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("Render timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        res(v);
      },
      (e) => {
        clearTimeout(t);
        rej(e);
      },
    );
  });

const withRetry = async (fn, tries, signal) => {
  for (let i = 0; ; i++) {
    if (signal?.aborted) throw abortError();
    try {
      return await fn();
    } catch (e) {
      if (e?.name === "AbortError" || i >= tries - 1) throw e;
      await sleep(150 * 2 ** i);
    }
  }
};

// one shared limiter => at most MAX_CONCURRENCY rasterisations, however many callers
const createLimiter = (max) => {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, res, rej } = queue.shift();
    fn()
      .then(res, rej)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((res, rej) => {
      queue.push({ fn, res, rej });
      next();
    });
};
const limit = createLimiter(MAX_CONCURRENCY);

// lazy text measuring (reuses one canvas)
let measureCtx;
const measure = (text, font, spacing = 0) => {
  measureCtx ||= document.createElement("canvas").getContext("2d");
  measureCtx.font = font;
  return measureCtx.measureText(text).width + [...text].length * spacing;
};

const cssGradient = (id, angle, x, y, w, h, stops) => {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a),
    dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = x + w / 2,
    cy = y + h / 2;
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"
    x1="${cx - (dx * len) / 2}" y1="${cy - (dy * len) / 2}"
    x2="${cx + (dx * len) / 2}" y2="${cy + (dy * len) / 2}">
    ${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`;
};

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

const notch = (id, cx, cy) => `
  <clipPath id="nc-${id}"><circle cx="${cx}" cy="${cy}" r="21"/></clipPath>
  <circle cx="${cx}" cy="${cy}" r="21" fill="#e8eef8"/>
  <g clip-path="url(#nc-${id})">
    <path filter="url(#blur2)" fill="#6f8fb5" fill-opacity=".169" fill-rule="evenodd"
      d="M${cx - 80} ${cy - 80}h160v160h-160z M${cx - 21} ${cy + 2}a21 21 0 1 0 42 0a21 21 0 1 0 -42 0z"/>
  </g>`;

// ─────────── static SVG (identical for every member, built once) ───────────
let staticParts;
const getStatic = () => {
  if (staticParts) return staticParts;

  const subText = "BAPS NAVARATRI";
  const subW = measure(subText, `700 14px ${SANS}`, 5);
  const subStart = W / 2 - (80 + 24 + subW) / 2;

  const glyphs = ["❋", "✿", "❋", "✿", "❋", "✿", "❋"];
  const gw = glyphs.map((g) => measure(g, `30px ${SANS}`, 2));
  const gap = (372 - gw.reduce((a, b) => a + b, 0)) / 7;
  let gx = 29 + gap / 2;
  const flowers = glyphs
    .map((g, i) => {
      const out = `<text x="${gx.toFixed(2)}" y="803" font-size="30" letter-spacing="2" fill="#6492c7" font-family="${SANS}">${g}</text>`;
      gx += gw[i] + gap;
      return out;
    })
    .join("");

  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}" text-rendering="geometricPrecision">
<defs>
  ${cssGradient("bg", 145, 1, 1, 428, H - 2, [
    [0, "#ffffff"],
    [0.52, "#f7f9fd"],
    [1, "#edf4ff"],
  ])}
  <clipPath id="inner"><rect x="1" y="1" width="428" height="${H - 2}" rx="33"/></clipPath>
  <filter id="blur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#e8eef8"/>
<rect width="${W}" height="${H}" rx="34" fill="url(#bg)"/>
<g clip-path="url(#inner)">
  <circle cx="1" cy="1" r="121.5" fill="#d5e5fa"/>
  <circle cx="429" cy="1" r="121.5" fill="#d5e5fa"/>
  <circle cx="1" cy="${482.75 - CUT}" r="77.3" fill="#e0ebfa"/>
  <circle cx="429" cy="${482.75 - CUT}" r="77.3" fill="#e0ebfa"/>
  ${ring("a", 21, -14)}
  ${ring("b", 469, 646.61 - CUT)}
  ${notch("l", 0, 304.4 - CUT)}
  ${notch("r", 430, 304.4 - CUT)}

  <g transform="translate(0 ${-CUT})">

  <g font-family="${SERIF}" font-size="58" letter-spacing="-2" fill="#102b4d" text-anchor="middle">
    <text x="215" y="156.76">BHAKTI</text>
    <text x="215" y="207.8">PARVA</text>
  </g>

  <rect x="${subStart}" y="238.38" width="40" height="1.5" fill="#527fb8"/>
  <text x="${subStart + 52}" y="244" font-family="${SANS}" font-weight="700" font-size="14" letter-spacing="5" fill="#527fb8">${subText}</text>
  <rect x="${subStart + 52 + subW + 12}" y="238.38" width="40" height="1.5" fill="#527fb8"/>

  <!-- QR card with flat shadow layers -->
  <rect x="91" y="433.61" width="248" height="248" rx="26" fill="#315b8c" fill-opacity=".04"/>
  <rect x="91" y="429.61" width="248" height="248" rx="26" fill="#315b8c" fill-opacity=".05"/>
  <rect x="91" y="425.61" width="248" height="248" rx="26" fill="#fff"/>
  <line x1="30" y1="761.61" x2="400" y2="761.61" stroke="#8db2df" stroke-width="2"
        stroke-linecap="round" stroke-dasharray="0 ${(370 / 92).toFixed(4)}"/>
  ${flowers}
`;

  const tail = `</g></g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="33.5" fill="none" stroke="#fff"/>
<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="32.5" fill="none" stroke="#d8e5f7"/>
</svg>`;

  return (staticParts = { head, tail });
};

// ─────────── per-member SVG (only the dynamic bits) ───────────
const buildSvg = (member) => {
  console.log(member);
  
  const { head, tail } = getStatic();
  const name = String(member.member_name || "");
  const mandal = member.mandal_name || "";
  const kshetra = member.kshetra_name || "";
  const code = String(member.internal_code || "");

  let fs = 43,
    ls = -1.4;
  const nameW = measure(name, `700 43px ${SANS}`, -1.4);
  if (nameW > 372) {
    const k = 372 / nameW;
    fs = 43 * k;
    ls = -1.4 * k;
  }
  const nameBase = 321.29 - (43 - fs) * 0.3;

  const pillW = Math.max(142, measure(code, `700 25px ${SANS}`, 1) + 52);
  const rx0 = W / 2 - (138 + pillW) / 2;
  const rowCY = 714.11;
  const pillX = rx0 + 69;
  const diamond = (cx) =>
    `<rect x="${cx - 4}" y="${rowCY - 4}" width="8" height="8" fill="none" stroke="#527fb8" stroke-width="2" transform="rotate(45 ${cx} ${rowCY})"/>`;

  const dynamic = `
  <text x="215" y="${nameBase.toFixed(2)}" text-anchor="middle" font-family="${SANS}" font-weight="700"
        font-size="${fs.toFixed(2)}" letter-spacing="${ls.toFixed(3)}" fill="#102b4d">${esc(name)}</text>
  <text x="215" y="364.11" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="21" fill="#4b76ac">${esc(mandal)}</text>
  <text x="215" y="392.42" text-anchor="middle" font-family="${SANS}" font-size="19" fill="#4b76ac">${esc(kshetra)}</text>

  <defs>${cssGradient("pill", 110, pillX, 691.61, pillW, 45, [
    [0, "#e3edfb"],
    [1, "#d5e4f8"],
  ])}</defs>
  <rect x="${rx0}" y="${rowCY - 0.75}" width="35" height="1.5" fill="#6e9bd0"/>
  ${diamond(rx0 + 52)}
  <rect x="${pillX}" y="691.61" width="${pillW}" height="45" rx="22.5" fill="url(#pill)"/>
  <text x="${pillX + pillW / 2 + 0.5}" y="722.77" text-anchor="middle" font-family="${SANS}" font-weight="700"
        font-size="25" letter-spacing="1" fill="#173b66">${esc(code)}</text>
  ${diamond(pillX + pillW + 17)}
  <rect x="${pillX + pillW + 34}" y="${rowCY - 0.75}" width="35" height="1.5" fill="#6e9bd0"/>
`;
  return head + dynamic + tail;
};

// ─────────── rasterise one card -> JPEG bytes + QR matrix ───────────
const loadImage = (url) =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("SVG failed to load"));
    img.src = url;
  });

const canvasToJpeg = async (canvas) => {
  const blob = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY })
    : await new Promise((res, rej) =>
        canvas.toBlob(
          (b) => (b ? res(b) : rej(new Error("toBlob failed"))),
          "image/jpeg",
          JPEG_QUALITY,
        ),
      );
  return new Uint8Array(await blob.arrayBuffer());
};

const rasterize = async (member, signal) => {
  if (signal?.aborted) throw abortError();

  const code = String(member.internal_code || "") || "N/A";
  const qr = QRCode.create(code, { errorCorrectionLevel: "H" });
  const svg = buildSvg(member);

  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  let canvas;
  try {
    const img = await loadImage(url);
    const cw = Math.round(W * SCALE),
      ch = Math.round(H * SCALE);
    canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(cw, ch)
        : Object.assign(document.createElement("canvas"), {
            width: cw,
            height: ch,
          });
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e8eef8"; // JPEG has no alpha
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, cw, ch);
    const jpeg = await canvasToJpeg(canvas);
    return { jpeg, qrSize: qr.modules.size, qrData: qr.modules.data, member };
  } finally {
    URL.revokeObjectURL(url);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    } // free memory immediately
  }
};

// ─────────── queued render with retry, timeout and in-flight dedupe ───────────
const inflight = new Map();
const renderCard = (member, signal) => {
  const key = [
    member.member_name,
    member.mandal_name,
    member.kshetra_name,
    member.internal_code,
  ].join("|");
  if (inflight.has(key)) return inflight.get(key);
  const p = limit(() =>
    withRetry(
      () => withTimeout(rasterize(member, signal), JOB_TIMEOUT_MS),
      MAX_RETRIES,
      signal,
    ),
  ).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

// ─────────── PDF assembly (fast: JPEG passthrough + vector QR) ───────────
const drawCard = (pdf, { jpeg, qrSize, qrData }) => {
  pdf.addImage(jpeg, "JPEG", 0, 0, W, H);
  const m = QR_SIZE / qrSize,
    o = 0.04; // tiny overlap prevents hairline seams
  pdf.setFillColor(0, 0, 0);
  for (let r = 0; r < qrSize; r++) {
    let c = 0;
    while (c < qrSize) {
      if (!qrData[r * qrSize + c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < qrSize && qrData[r * qrSize + c]) c++;
      pdf.rect(QR_X + start * m, QR_Y + r * m, (c - start) * m + o, m + o, "F");
    }
  }
};

const newPdf = () =>
  new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [W, H],
    compress: true,
  });

const safeName = (s) =>
  String(s || "pass")
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "_");

// ───────────────────────── public API ─────────────────────────

/** Single pass. Safe to call 200× at once, jobs are queued internally. */
export const generateProjectQRPass = async (member, { signal } = {}) => {
  const card = await renderCard(member, signal);
  const pdf = newPdf();
  drawCard(pdf, card);
  pdf.save(`${safeName(member.member_name)}_ID_Pass.pdf`);
};

/** Many passes -> ONE multi-page PDF. Failed members are reported, not fatal. */
export const generateBatchPdf = async (
  members,
  { onProgress, signal, filename = "ID_Passes.pdf" } = {},
) => {
  let done = 0;
  const settled = await Promise.allSettled(
    members.map(async (m) => {
      const card = await renderCard(m, signal);
      onProgress?.(++done, members.length);
      return card;
    }),
  );

  const pdf = newPdf();
  const failed = [];
  let pages = 0;
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      if (pages++ > 0) pdf.addPage([W, H], "portrait");
      drawCard(pdf, s.value);
    } else {
      failed.push({ member: members[i], error: s.reason });
    }
  });

  if (!pages) throw new Error("All passes failed to render");
  pdf.save(filename);
  return { total: members.length, succeeded: pages, failed };
};

/** Same as generateProjectQRPass but returns the PDF so the UI controls the download. */
export const generateProjectQRPassBlob = async (member, { signal } = {}) => {
  const card = await renderCard(member, signal);
  const pdf = newPdf();
  drawCard(pdf, card);
  return {
    blob: pdf.output("blob"),
    filename: `${safeName(member.member_name)}_ID_Pass.pdf`,
  };
};
