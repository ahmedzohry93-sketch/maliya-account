/** The fiscal year always starts on 1 January. */
export function fiscalYearStart(d: Date = new Date()) {
  return `${d.getFullYear()}-01-01`;
}

export function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Default reporting period: 1 Jan of the current fiscal year → today. */
export function defaultPeriod() {
  return { from: fiscalYearStart(), to: today() };
}

/** The day right before `from`; used as the cut-off for opening balances. */
export function dayBefore(from: string) {
  if (!from) return "";
  const d = new Date(from + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
}

/** Previous period of the same length, immediately before `from`. */
export function prevRange(from: string, to: string): { from: string; to: string } | null {
  if (!from || !to) return null;
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || t < f) return null;
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const pTo = new Date(f.getTime() - 86400000);
  const pFrom = new Date(pTo.getTime() - (days - 1) * 86400000);
  return { from: pFrom.toISOString().slice(0, 10), to: pTo.toISOString().slice(0, 10) };
}

/** Unified header line used by report subtitles and printed documents. */
export function periodLabel(from: string, to: string) {
  const end = to || new Date().toISOString().slice(0, 10);
  return from ? `الفترة من ${from} إلى ${end}` : `حتى ${end}`;
}

export function printedAt() {
  return new Date().toLocaleString("en-GB", { hour12: false });
}
