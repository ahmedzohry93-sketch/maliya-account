import * as XLSX from "xlsx";

export type ParsedLine = {
  txn_date: string; // YYYY-MM-DD
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number | null;
};

function toISODate(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // yyyy-mm-dd or yyyy/mm/dd
  const m2 = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Normalize header names for auto-detection. */
function findKey(headers: string[], candidates: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, "");
  const cn = candidates.map(norm);
  return headers.find((h) => cn.includes(norm(h))) ?? null;
}

function fromRows(rows: Record<string, unknown>[]): ParsedLine[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const kDate = findKey(headers, ["date", "txn_date", "transaction date", "value date", "التاريخ"]);
  const kDesc = findKey(headers, ["description", "narration", "details", "memo", "particulars", "البيان", "الوصف"]);
  const kRef = findKey(headers, ["reference", "ref", "reference no", "check no", "cheque", "المرجع"]);
  const kDebit = findKey(headers, ["debit", "withdrawal", "dr", "مدين", "سحب"]);
  const kCredit = findKey(headers, ["credit", "deposit", "cr", "دائن", "إيداع"]);
  const kAmount = findKey(headers, ["amount", "value", "المبلغ"]);
  const kBalance = findKey(headers, ["balance", "running balance", "الرصيد"]);

  return rows
    .map((r) => {
      let debit = kDebit ? num(r[kDebit]) : 0;
      let credit = kCredit ? num(r[kCredit]) : 0;
      if (!kDebit && !kCredit && kAmount) {
        const a = num(r[kAmount]);
        if (a < 0) debit = Math.abs(a);
        else credit = a;
      }
      return {
        txn_date: kDate ? toISODate(r[kDate]) : "",
        description: kDesc ? String(r[kDesc] ?? "").trim() : "",
        reference: kRef ? String(r[kRef] ?? "").trim() : "",
        debit,
        credit,
        balance: kBalance ? num(r[kBalance]) : null,
      };
    })
    .filter((l) => l.txn_date && (l.debit > 0 || l.credit > 0));
}

export function parseCSV(text: string): ParsedLine[] {
  const wb = XLSX.read(text, { type: "string" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return fromRows(rows);
}

export function parseXLSX(buf: ArrayBuffer): ParsedLine[] {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return fromRows(rows);
}

/** Minimal OFX/QFX parser (SGML-ish). Extracts <STMTTRN> blocks. */
export function parseOFX(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const tag = (b: string, t: string) => {
    const m = b.match(new RegExp(`<${t}>([^<\\r\\n]+)`, "i"));
    return m ? m[1].trim() : "";
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const b = m[1];
    const d = tag(b, "DTPOSTED").slice(0, 8);
    const iso = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
    const amt = Number(tag(b, "TRNAMT")) || 0;
    lines.push({
      txn_date: iso,
      description: tag(b, "NAME") || tag(b, "MEMO"),
      reference: tag(b, "FITID") || tag(b, "CHECKNUM"),
      debit: amt < 0 ? Math.abs(amt) : 0,
      credit: amt > 0 ? amt : 0,
      balance: null,
    });
  }
  return lines.filter((l) => l.txn_date);
}

/** QIF parser — Quicken Interchange Format. */
export function parseQIF(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  const blocks = text.split(/\n\^\s*\n?/);
  for (const b of blocks) {
    if (!b.trim() || b.trim().startsWith("!")) continue;
    const cur: Partial<ParsedLine> = { debit: 0, credit: 0, balance: null };
    for (const raw of b.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const code = line[0];
      const val = line.slice(1).trim();
      if (code === "D") cur.txn_date = toISODate(val);
      else if (code === "T" || code === "U") {
        const a = num(val);
        if (a < 0) cur.debit = Math.abs(a);
        else cur.credit = a;
      } else if (code === "P" || code === "M") cur.description = ((cur.description ?? "") + " " + val).trim();
      else if (code === "N") cur.reference = val;
    }
    if (cur.txn_date) {
      out.push({
        txn_date: cur.txn_date,
        description: cur.description ?? "",
        reference: cur.reference ?? "",
        debit: cur.debit ?? 0,
        credit: cur.credit ?? 0,
        balance: null,
      });
    }
  }
  return out;
}

export async function parseFile(file: File): Promise<ParsedLine[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXLSX(await file.arrayBuffer());
  }
  const text = await file.text();
  if (name.endsWith(".ofx") || name.endsWith(".qfx")) return parseOFX(text);
  if (name.endsWith(".qif")) return parseQIF(text);
  return parseCSV(text);
}
