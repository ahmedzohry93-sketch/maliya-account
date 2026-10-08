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
   <style>
     @page { size:A4; margin:8mm; }
     :root { --paper: #fff; --ink: #1a1a1a; --grid: #c9c9c9; --border: #8a8a8a; --muted: #555; --stripe: #f6f6f6; --total:#eee; --band:#e2e2e2; }
     * {box-sizing:border-box; letter-spacing:0;}
     body {margin:0; background:var(--paper); color:var(--ink); font:11px Tahoma,Arial,sans-serif; print-color-adjust:exact; -webkit-print-color-adjust:exact;}
     .num {font-variant-numeric:tabular-nums; unicode-bidi:plaintext;}
     .sheet {max-width:1000px; margin:12px auto; border:1px solid var(--border); padding:22px 20px 14px;}
     .head {display:flex; justify-content:space-between; gap:12px; border-bottom:2px solid var(--ink); padding-bottom:6px; margin-bottom:6px;}
     .company-name {font-size:14px; font-weight:700; margin-bottom:2px;}
     .company {font-size:11px; line-height:1.5;}
     .doc-meta {text-align:left; font-size:11px; line-height:1.6;}
     .doc-title {font-size:15px; font-weight:700; margin-bottom:4px;}
     .meta {display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 16px; border-bottom:1px solid var(--border); padding-bottom:6px; margin-bottom:8px;}
     h2 {font-size:11.5px; background:var(--band); border:1px solid var(--border); padding:3px 6px; margin:8px 0 0;}
     table {width:100%; border-collapse:collapse; margin-bottom:8px;}
     th,td {border:1px solid var(--grid); padding:3px 5px; text-align:start;}
     th {background:var(--stripe); border-bottom:1.5px solid var(--border); font-size:11.5px;}
     tbody tr:nth-child(even){background:var(--stripe);}
     .total td {background:var(--total); font-weight:700; border-top:2px solid var(--ink); border-bottom:2px double var(--ink); font-size:12px;}
     .footer {display:flex; justify-content:space-between; margin-top:10px; padding-top:6px; border-top:1px solid var(--grid); font-size:10px; color:var(--muted);}
     .toolbar {display:flex; gap:8px; padding:8px;}
     .toolbar button {font:12px Tahoma,Arial,sans-serif; padding:8px 12px; border:1px solid var(--border); background:var(--paper); color:var(--ink); cursor:pointer;}
     thead {display:table-header-group;} tr,.head,.footer {break-inside:avoid;}
     @media print {.noprint{display:none!important} .sheet{margin:0;max-width:none;padding:14px;} }
   </style></head><body>
   <div class="toolbar noprint"><button onclick="window.print()">طباعة / حفظ PDF</button><button onclick="window.close()">إغلاق</button></div>
   <div class="sheet">
     <div class="head"><div><div class="company-name">${esc(brandName)}</div><div class="company">${brand?.address ? esc(brand.address) : ""}<br/>${[brand?.phone, brand?.tax_number && `ر.ض ${brand.tax_number}`].filter(Boolean).map(esc).join(" · ")}</div></div><div class="doc-meta"><div class="doc-title">${esc(reportTitle)}</div><div>تاريخ الطباعة: ${new Date().toLocaleDateString("en-GB")}</div></div></div>
     <div class="meta"><span>${meta?.subtitle ? esc(meta.subtitle) : ""}</span><span class="num">التاريخ: ${dateStr}</span></div>
    ${sections.map(renderSection).join("")}
     <div class="footer"><span>${esc(brand?.footer_note ?? "")}</span><span class="num">${new Date().toLocaleDateString("en-GB")}</span></div>
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
  return exportToPDF(`Receipt-${data.invoiceNo}`, `${title} #${data.invoiceNo}`, [
    { title: data.partnerName ?? undefined, headers: ["الصنف", "الكمية", "سعر الوحدة", "الإجمالي"], rows: data.lines.map(l => [l.name, l.qty, l.price, l.total]) },
    { headers: ["البيان", "القيمة"], rows: [["الإجمالي قبل الخصم", data.subtotal], ["الخصم", data.discount ?? 0], ["الضريبة", data.tax ?? 0]], totals: ["الإجمالي النهائي", data.total] },
  ], {subtitle: [data.reference, data.notes].filter(Boolean).join(" · "), date: data.date, brand});
}
