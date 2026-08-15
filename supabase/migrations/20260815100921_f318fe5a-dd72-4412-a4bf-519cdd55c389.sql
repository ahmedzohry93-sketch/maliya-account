INSERT INTO public.accounts (code, name, type, parent_id, is_active)
SELECT v.code, v.name, v.type::account_type, p.id, true
FROM (VALUES
  ('1133','مخزون أول المدة','asset','113'),
  ('1134','مخزون آخر المدة','asset','113'),
  ('421','مردودات المبيعات','revenue','42'),
  ('422','مسموحات وخصم مسموح به','revenue','42'),
  ('514','مسموحات المشتريات','expense','51'),
  ('515','خصم مكتسب','expense','51')
) AS v(code, name, type, parent_code)
JOIN public.accounts p ON p.code = v.parent_code
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.code = v.code);