export type AccountRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
};

export type AccNode = AccountRow & { children: AccNode[]; amount: number; prev: number };

/** Accounting code order: shorter codes first, then numeric value (1, 11, 12, 111, 1111…). */
export function compareCode(a: string, b: string): number {
  const ca = String(a ?? ""), cb = String(b ?? "");
  if (ca.length !== cb.length) return ca.length - cb.length;
  const na = Number(ca), nb = Number(cb);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return ca.localeCompare(cb, "en");
}

/** Sorts any list carrying a `code` field in proper accounting order. */
export function sortByCode<T extends { code?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareCode(a.code ?? "", b.code ?? ""));
}

/** Builds a hierarchical account tree with rolled-up amounts (leaves carry the values). */
export function buildAccountTree(
  accounts: AccountRow[],
  amountOf: (a: AccountRow) => number,
  prevOf?: (a: AccountRow) => number,
): AccNode[] {
  const map = new Map<string, AccNode>();
  accounts.forEach((a) => map.set(a.id, { ...a, children: [], amount: 0, prev: 0 }));

  const roots: AccNode[] = [];
  map.forEach((n) => {
    const parent = n.parent_id ? map.get(n.parent_id) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  });

  const calc = (n: AccNode): number => {
    n.children.sort((a, b) => compareCode(a.code, b.code));
    let kids = 0;
    let kidsPrev = 0;
    n.children.forEach((c) => {
      kids += calc(c);
      kidsPrev += c.prev;
    });
    n.amount = kids + amountOf(n);
    n.prev = kidsPrev + (prevOf ? prevOf(n) : 0);
    return n.amount;
  };
  roots.forEach(calc);
  roots.sort((a, b) => compareCode(a.code, b.code));
  return roots;
}

/** Drops branches with no movement at all. */
export function pruneEmpty(nodes: AccNode[]): AccNode[] {
  return nodes
    .map((n) => ({ ...n, children: pruneEmpty(n.children) }))
    .filter((n) => n.amount !== 0 || n.prev !== 0 || n.children.length > 0);
}

export function totalOf(nodes: AccNode[]): number {
  return nodes.reduce((s, n) => s + n.amount, 0);
}

export function totalPrevOf(nodes: AccNode[]): number {
  return nodes.reduce((s, n) => s + n.prev, 0);
}

/** Percentage change vs. previous period (null when there is no base). */
export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** Flat list (indented codes) for Excel/PDF exports. */
export function flattenTree(nodes: AccNode[], depth = 0): { node: AccNode; depth: number }[] {
  const out: { node: AccNode; depth: number }[] = [];
  nodes.forEach((n) => {
    out.push({ node: n, depth });
    out.push(...flattenTree(n.children, depth + 1));
  });
  return out;
}

/** Codes of an account plus all of its ancestors — used to detect customer/supplier accounts. */
export function ancestorCodes(accounts: AccountRow[], accountId: string): string[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const codes: string[] = [];
  let cur = byId.get(accountId);
  let guard = 0;
  while (cur && guard++ < 20) {
    codes.push(cur.code);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return codes;
}

/** Account codes that represent receivables (customers) and payables (suppliers). */
export const CUSTOMER_ROOT_CODES = ["112", "1121", "13230"];
export const SUPPLIER_ROOT_CODES = ["211", "14130"];
