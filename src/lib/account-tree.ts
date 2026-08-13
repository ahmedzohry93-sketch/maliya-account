export type AccountRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
};

export type AccNode = AccountRow & { children: AccNode[]; amount: number };

/** Builds a hierarchical account tree with rolled-up amounts (leaves carry the values). */
export function buildAccountTree(
  accounts: AccountRow[],
  amountOf: (a: AccountRow) => number,
): AccNode[] {
  const map = new Map<string, AccNode>();
  accounts.forEach((a) => map.set(a.id, { ...a, children: [], amount: 0 }));

  const roots: AccNode[] = [];
  map.forEach((n) => {
    const parent = n.parent_id ? map.get(n.parent_id) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  });

  const calc = (n: AccNode): number => {
    n.children.sort((a, b) => a.code.localeCompare(b.code, "en"));
    const kids = n.children.reduce((s, c) => s + calc(c), 0);
    n.amount = kids + (n.children.length === 0 ? amountOf(n) : amountOf(n));
    return n.amount;
  };
  roots.forEach(calc);
  roots.sort((a, b) => a.code.localeCompare(b.code, "en"));
  return roots;
}

/** Drops branches with no movement at all. */
export function pruneEmpty(nodes: AccNode[]): AccNode[] {
  return nodes
    .map((n) => ({ ...n, children: pruneEmpty(n.children) }))
    .filter((n) => n.amount !== 0 || n.children.length > 0);
}

export function totalOf(nodes: AccNode[]): number {
  return nodes.reduce((s, n) => s + n.amount, 0);
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
