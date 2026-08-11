import { supabase } from "@/integrations/supabase/client";
import type { ParsedLine } from "./parsers";

export type MatchingRule = {
  id: string;
  name: string;
  priority: number;
  condition_field: "description" | "reference" | "amount";
  operator: "contains" | "equals" | "starts_with" | "ends_with" | "regex" | "greater_than" | "less_than";
  value: string;
  target_account_id: string | null;
  category: string | null;
  auto_create_entry: boolean;
  is_active: boolean;
};

function testRule(line: ParsedLine, rule: MatchingRule): boolean {
  const field =
    rule.condition_field === "amount"
      ? String(line.debit + line.credit)
      : rule.condition_field === "reference"
      ? line.reference
      : line.description;
  const v = (rule.value ?? "").toLowerCase();
  const f = (field ?? "").toLowerCase();
  switch (rule.operator) {
    case "contains":
      return f.includes(v);
    case "equals":
      return f === v;
    case "starts_with":
      return f.startsWith(v);
    case "ends_with":
      return f.endsWith(v);
    case "regex":
      try {
        return new RegExp(rule.value, "i").test(field);
      } catch {
        return false;
      }
    case "greater_than":
      return Number(field) > Number(rule.value);
    case "less_than":
      return Number(field) < Number(rule.value);
  }
}

export function applyRules(
  line: ParsedLine,
  rules: MatchingRule[],
): { category?: string; target_account_id?: string; auto_create_entry?: boolean } {
  const sorted = [...rules].filter((r) => r.is_active).sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    if (testRule(line, r)) {
      return {
        category: r.category ?? undefined,
        target_account_id: r.target_account_id ?? undefined,
        auto_create_entry: r.auto_create_entry,
      };
    }
  }
  return {};
}

export async function fetchRules(): Promise<MatchingRule[]> {
  const { data } = await supabase.from("bank_matching_rules").select("*").order("priority");
  return (data ?? []) as MatchingRule[];
}
