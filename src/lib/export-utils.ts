import * as XLSX from "xlsx";
import { fetchCompanyBrand } from "@/lib/company";

export type Row = (string | number)[];
export type Section = { title?: string; headers: string[]; rows: Row[]; totals?: Row };

/** Always English (Latin) digits, fixed 2 decimals. */
function fmtNum(v: string | number): string {
  if (v === "" || v === null || v === undefined) return "";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Escape HTML to prevent stored XSS in PDF/print popup. */
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Export one or more sections to a single Excel sheet. */
export function exportToExcel(
  filename: string,
  reportTitle: string,
  sections: Section[],
  meta?: { subtitle?: string; date?: string },
) {
  const aoa: (string | number)[][] = [];
  aoa.push([reportTitle]);
  if (meta?.subtitle) aoa.push([meta.subtitle]);
  aoa.push([`Report date: ${meta?.date ?? new Date().toLocaleDateString("en-US")}`]);
  aoa.push([]);

  sections.forEach((sec, idx) => {
    if (sec.title) aoa.push([sec.title]);
    aoa.push(sec.headers);
    sec.rows.forEach((r) => aoa.push(r));
    if (sec.totals) aoa.push(sec.totals);
    if (idx < sections.length - 1) aoa.push([]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const maxCols = Math.max(...sections.map((s) => s.headers.length));
  ws["!cols"] = Array.from({ length: maxCols }, (_, i) => ({ wch: i === 0 ? 14 : 24 }));
  ws["!sheetView"] = [{ RTL: true } as any];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportTitle.slice(0, 28) || "Report");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export type Brand = {
  name?: string | null;
  name_en?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  tax_number?: string | null;
  logo_data_url?: string | null;
  footer_note?: string | null;
};

/** Modern, branded HTML report → print → save as PDF. Auto-loads brand if not supplied. */
export async function exportToPDF(
  _filename: string,
  reportTitle: string,
  sections: Section[],
  meta?: { subtitle?: string; date?: string; brand?: Brand },
) {
  const win = window.open("", "_blank", "width=1000,height=800");
  if (!win) return;

  // Auto-fetch brand if caller didn't supply one — so logo appears on every report.
  let brand = meta?.brand;
  if (!brand) {
    try { brand = (await fetchCompanyBrand()) ?? undefined; } catch { /* ignore */ }
  }

  const dateStr = meta?.date ? esc(meta.date) : new Date().toLocaleDateString("en-US");
  const brandName = brand?.name || "Maliyah";
  const brandSub = brand?.name_en || brand?.address || "Financial Suite";
  const brandInitial = (brandName.trim()[0] || "M").toUpperCase();

  const renderRow = (r: Row, isTotal = false) =>
    `<tr class="${isTotal ? "total" : ""}">${r
      .map((c, i) => {
        const isNum = typeof c === "number" || (i > 0 && /^-?\d/.test(String(c)));
        if (isNum && c !== "" && c !== null && c !== undefined) {
          const n = typeof c === "number" ? c : Number(c);
          if (!Number.isNaN(n)) {
            return `<td class="num ${n < 0 ? "neg" : ""}">${esc(fmtNum(n))}</td>`;
          }
        }
        return `<td>${c === 0 || c === "" || c == null ? "" : esc(c)}</td>`;
      })
      .join("")}</tr>`;

  const renderSection = (s: Section) => `
    ${s.title ? `<h2>${esc(s.title)}</h2>` : ""}
    <table>
      <thead><tr>${s.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>
        ${s.rows.map((r) => renderRow(r)).join("")}
        ${s.totals ? renderRow(s.totals, true) : ""}
      </tbody>
    </table>`;

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
  <title>${esc(reportTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; }
    body {
      font-family: "IBM Plex Sans Arabic", "Inter", system-ui, sans-serif;
      color:#0b1220; background:#fff;
      font-size: 12.5px; line-height:1.55;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .num { font-family:"Inter", system-ui, sans-serif; font-variant-numeric: tabular-nums lining-nums; unicode-bidi: plaintext; }
    .neg { color:#dc2626; }

    .sheet { padding: 4px 2px 20px; }

    /* Modern minimal header — thin gold accent + clean typography */
    .head {
      display:grid; grid-template-columns: 1fr auto; gap: 24px;
      align-items:center; padding: 4px 4px 18px;
      border-bottom: 1px solid #e5e7eb;
      margin-bottom: 20px; position:relative;
    }
    .head::before {
      content:""; position:absolute; inset-inline-start:0; inset-inline-end:0; top:0; height:3px;
      background: linear-gradient(90deg, #c9a84c 0%, #e8c879 40%, #0f1b3d 100%);
      border-radius: 3px;
    }
    .brand { display:flex; align-items:center; gap:14px; }
    .brand .mark {
      width:54px; height:54px; border-radius:14px;
      background: linear-gradient(135deg,#0f1b3d 0%, #1e3a5f 100%);
      display:flex; align-items:center; justify-content:center;
      font-family:"Plus Jakarta Sans", sans-serif; font-weight:800; color:#e8c879; font-size:24px;
      box-shadow: 0 6px 18px -8px rgba(15,27,61,.35);
      overflow:hidden;
    }
    .brand .mark.has-logo { background:#fff; border:1px solid #e5e7eb; padding:4px; }
    .brand .mark img { width:100%; height:100%; object-fit:contain; }
    .brand .title { font-family:"Plus Jakarta Sans", "IBM Plex Sans Arabic", sans-serif; font-weight:700; font-size:20px; letter-spacing:-0.01em; color:#0b1220;}
    .brand .sub { font-size:11.5px; color:#64748b; margin-top:3px; font-weight:500; }
    .brand .tag { display:inline-block; margin-top:6px; padding:2px 8px; font-size:10px; border-radius:20px; background:#f1f5fb; color:#0f1b3d; font-weight:600; letter-spacing:.03em; }

    .doc-meta { text-align:end; font-size:11px; color:#475569; }
    .doc-meta .kv { margin-top:4px; }
    .doc-meta .label { font-size:9.5px; text-transform:uppercase; letter-spacing:.1em; color:#94a3b8; }
    .doc-meta .value { font-family:"Inter", sans-serif; font-variant-numeric: tabular-nums; color:#0b1220; font-weight:600; font-size:12px; }
    .doc-title {
      font-family:"Plus Jakarta Sans","IBM Plex Sans Arabic",sans-serif; font-weight:700;
      font-size:15px; color:#0f1b3d; padding: 4px 10px;
      background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; display:inline-block;
    }

    h2 {
      font-family:"Plus Jakarta Sans", "IBM Plex Sans Arabic", sans-serif;
      font-size:13px; color:#0f1b3d; margin: 22px 0 10px;
      padding: 4px 0; letter-spacing:.01em;
      display:flex; align-items:center; gap:10px;
    }
    h2::before { content:""; width:3px; height:14px; background:#c9a84c; border-radius:2px; }
    h2::after { content:""; flex:1; height:1px; background: linear-gradient(90deg,#e5e7eb,transparent); }

    table { width:100%; border-collapse:separate; border-spacing:0; margin-bottom:4px; }
    th {
      background:#f8fafc; color:#334155; padding:10px 12px; text-align:start;
      font-weight:600; font-size:10.5px; letter-spacing:.06em; text-transform:uppercase;
      border-bottom:1px solid #e5e7eb;
    }
    td { padding:9px 12px; border-bottom:1px solid #f1f5f9; text-align:start; }
    tr:last-child td { border-bottom:none; }
    tr.total td {
      background: linear-gradient(90deg, #f8fafc, #fff);
      font-weight:700; color:#0f1b3d;
      border-top:1.5px solid #0f1b3d; border-bottom:1.5px solid #0f1b3d;
      font-size: 12.5px;
    }

    .footer {
      margin-top:28px; padding-top:12px; border-top:1px solid #e5e7eb;
      font-size:10px; color:#94a3b8; display:flex; justify-content:space-between; align-items:center;
    }
    .footer .brand-mini { display:flex; align-items:center; gap:6px; color:#475569; font-weight:500; }
    .footer .brand-mini .dot { width:6px; height:6px; border-radius:50%; background:#c9a84c; }
    .footer .ts { font-family:"Inter", sans-serif; font-variant-numeric: tabular-nums; }

    .toolbar { position:fixed; top:12px; inset-inline-start:12px; z-index:99; display:flex; gap:8px; }
    .toolbar button {
      background:#0f1b3d; color:#fff; border:0; padding:9px 18px; border-radius:8px;
      cursor:pointer; font-family:inherit; font-weight:600; font-size:13px;
      box-shadow: 0 4px 12px -2px rgba(15,27,61,.3);
    }
    .toolbar button:hover { background:#1e3a5f; }
    .toolbar .ghost { background:#fff; color:#0f1b3d; border:1px solid #cbd5e1; box-shadow:none; }
    @media print { .noprint{display:none !important} body{background:#fff} }
  </style></head><body>
  <div class="toolbar noprint">
    <button onclick="window.print()">طباعة / Save as PDF</button>
    <button class="ghost" onclick="window.close()">إغلاق</button>
  </div>
  <div class="sheet">
    <div class="head">
      <div class="brand">
        ${brand?.logo_data_url
          ? `<div class="mark has-logo"><img src="${esc(brand.logo_data_url)}" alt="logo"/></div>`
          : `<div class="mark">${esc(brandInitial)}</div>`}
        <div>
          <div class="title">${esc(brandName)}</div>
          <div class="sub">${esc(brandSub)}${brand?.tax_number ? ` · Tax #: ${esc(brand.tax_number)}` : ""}</div>
          <span class="tag">${esc(reportTitle)}</span>
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-title">${esc(reportTitle)}</div>
        <div class="kv"><div class="label">Report Date</div><div class="value">${dateStr}</div></div>
        ${meta?.subtitle ? `<div class="kv"><div class="label">Details</div><div class="value">${esc(meta.subtitle)}</div></div>` : ""}
        ${brand?.phone ? `<div class="kv"><div class="label">Phone</div><div class="value">${esc(brand.phone)}</div></div>` : ""}
      </div>
    </div>
    ${sections.map(renderSection).join("")}
    <div class="footer">
      <span class="brand-mini"><span class="dot"></span>${esc(brand?.footer_note || `${brandName} · شكراً لتعاملكم معنا`)}</span>
      <span class="ts">${new Date().toLocaleString("en-US")}</span>
    </div>
  </div>
  <script>setTimeout(()=>window.print(),600);</script>
  </body></html>`;

  win.document.write(html);
  win.document.close();
}

/* ============================================================
 * Thermal receipt (80mm) — for small POS invoice printers.
 * ============================================================ */
export type ReceiptLine = { name: string; qty: number; price: number; total: number };
export type ReceiptData = {
  invoiceNo: string | number;
  date: string;
  partnerName?: string | null;
  reference?: string | null;
  lines: ReceiptLine[];
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paid?: number;
  notes?: string | null;
};

export async function exportReceiptPDF(title: string, data: ReceiptData, brand?: Brand) {
  const win = window.open("", "_blank", "width=420,height=800");
  if (!win) return;
  let b = brand;
  if (!b) { try { b = (await fetchCompanyBrand()) ?? undefined; } catch { /* ignore */ } }

  const brandName = b?.name || "Maliyah";
  const brandInitial = (brandName.trim()[0] || "M").toUpperCase();

  const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const linesHtml = data.lines.map((l) => `
    <div class="li">
      <div class="li-name">${esc(l.name)}</div>
      <div class="li-row">
        <span class="qty">${money(l.qty)} × ${money(l.price)}</span>
        <span class="tot">${money(l.total)}</span>
      </div>
    </div>`).join("");

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; background:#f4f4f5; }
    body { font-family:"IBM Plex Sans Arabic","Inter",system-ui,sans-serif; color:#0b1220; font-size:12px; line-height:1.45; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .receipt { width:74mm; margin:8px auto; padding:8px 6px; background:#fff; }
    .num { font-family:"Inter",sans-serif; font-variant-numeric: tabular-nums lining-nums; unicode-bidi: plaintext; }
    .center { text-align:center; }
    .brand { text-align:center; margin-bottom:6px; }
    .brand .mark { width:44px; height:44px; margin:0 auto 6px; border-radius:10px; background:#0f1b3d; color:#e8c879; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:20px; overflow:hidden; }
    .brand .mark.has-logo { background:#fff; border:1px solid #e5e7eb; padding:3px; }
    .brand .mark img { width:100%; height:100%; object-fit:contain; }
    .brand h1 { font-size:15px; margin:0; font-weight:700; letter-spacing:-.01em; }
    .brand .sub { font-size:10.5px; color:#64748b; margin-top:2px; }
    .divider { border:0; border-top:1px dashed #94a3b8; margin:8px 0; }
    .doc-title { text-align:center; font-weight:700; font-size:12.5px; letter-spacing:.05em; padding:3px 0; background:#0f1b3d; color:#fff; border-radius:6px; margin:6px 0; }
    .meta { display:flex; justify-content:space-between; font-size:11px; color:#334155; margin:3px 0; }
    .meta .k { color:#64748b; }
    .li { padding:5px 0; border-bottom:1px dotted #e2e8f0; }
    .li:last-child { border-bottom:0; }
    .li-name { font-weight:600; font-size:12px; }
    .li-row { display:flex; justify-content:space-between; margin-top:2px; font-size:11px; color:#334155; }
    .li-row .tot { font-weight:700; color:#0b1220; }
    .totals { margin-top:6px; }
    .totals .row { display:flex; justify-content:space-between; padding:3px 0; font-size:12px; }
    .totals .row.grand { border-top:2px solid #0f1b3d; margin-top:4px; padding-top:6px; font-size:14px; font-weight:800; color:#0f1b3d; }
    .footer { text-align:center; font-size:10.5px; color:#475569; margin-top:10px; }
    .footer .thanks { font-weight:700; color:#0f1b3d; font-size:11.5px; margin-bottom:2px; }
    .barcode { text-align:center; margin-top:8px; font-family:"Libre Barcode 39",monospace; font-size:28px; letter-spacing:2px; }
    .toolbar { text-align:center; padding:8px; }
    .toolbar button { background:#0f1b3d; color:#fff; border:0; padding:8px 16px; border-radius:8px; font-weight:600; cursor:pointer; font-family:inherit; margin:0 4px; }
    .toolbar .ghost { background:#fff; color:#0f1b3d; border:1px solid #cbd5e1; }
    @media print { .noprint{display:none!important} body{background:#fff} .receipt{margin:0;width:auto;padding:0;} }
  </style></head><body>
  <div class="toolbar noprint">
    <button onclick="window.print()">🖨 طباعة</button>
    <button class="ghost" onclick="window.close()">إغلاق</button>
  </div>
  <div class="receipt">
    <div class="brand">
      ${b?.logo_data_url
        ? `<div class="mark has-logo"><img src="${esc(b.logo_data_url)}" alt="logo"/></div>`
        : `<div class="mark">${esc(brandInitial)}</div>`}
      <h1>${esc(brandName)}</h1>
      ${b?.name_en ? `<div class="sub">${esc(b.name_en)}</div>` : ""}
      ${b?.address ? `<div class="sub">${esc(b.address)}</div>` : ""}
      ${b?.phone ? `<div class="sub num">☏ ${esc(b.phone)}</div>` : ""}
      ${b?.tax_number ? `<div class="sub">Tax #: ${esc(b.tax_number)}</div>` : ""}
    </div>

    <div class="doc-title">${esc(title)}</div>

    <div class="meta"><span class="k">رقم الفاتورة</span><span class="num">#${esc(String(data.invoiceNo))}</span></div>
    <div class="meta"><span class="k">التاريخ</span><span class="num">${esc(data.date)}</span></div>
    ${data.partnerName ? `<div class="meta"><span class="k">العميل</span><span>${esc(data.partnerName)}</span></div>` : ""}
    ${data.reference ? `<div class="meta"><span class="k">المرجع</span><span>${esc(data.reference)}</span></div>` : ""}

    <hr class="divider"/>
    ${linesHtml}
    <hr class="divider"/>

    <div class="totals">
      <div class="row"><span>الإجمالي</span><span class="num">${money(data.subtotal)}</span></div>
      ${data.discount ? `<div class="row"><span>الخصم</span><span class="num">-${money(data.discount)}</span></div>` : ""}
      ${data.tax ? `<div class="row"><span>الضريبة</span><span class="num">${money(data.tax)}</span></div>` : ""}
      <div class="row grand"><span>الإجمالي النهائي</span><span class="num">${money(data.total)}</span></div>
      ${data.paid !== undefined ? `<div class="row"><span>المدفوع</span><span class="num">${money(data.paid)}</span></div>` : ""}
    </div>

    ${data.notes ? `<hr class="divider"/><div style="font-size:11px;color:#475569;">${esc(data.notes)}</div>` : ""}

    <div class="footer">
      <div class="thanks">شكراً لزيارتكم</div>
      <div>${esc(b?.footer_note || "نتمنى لكم يوماً سعيداً")}</div>
      <div class="num" style="margin-top:6px;font-size:9.5px;color:#94a3b8;">${new Date().toLocaleString("en-US")}</div>
    </div>
  </div>
  <script>setTimeout(()=>window.print(),500);</script>
  </body></html>`;

  win.document.write(html);
  win.document.close();
}
