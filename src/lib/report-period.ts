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
