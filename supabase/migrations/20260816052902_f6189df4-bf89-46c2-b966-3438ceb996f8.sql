-- Renumber/reclassify only; ids unchanged so all journal lines & balances stay intact.
UPDATE public.accounts SET code = '414' WHERE code = '1603';
UPDATE public.accounts SET code = '216' WHERE code = '14130';
UPDATE public.accounts SET code = '584' WHERE code = '1203';
UPDATE public.accounts SET code = '1125', parent_id = (SELECT id FROM public.accounts WHERE code = '112') WHERE code = '13230';
UPDATE public.accounts SET code = '1114', parent_id = (SELECT id FROM public.accounts WHERE code = '111') WHERE code = '13130';
UPDATE public.accounts SET code = '516' WHERE code = '52';
UPDATE public.accounts SET code = '517' WHERE code = '54';

-- Accumulated depreciation is a contra-asset: move under fixed assets (12)
UPDATE public.accounts
SET code = '128', type = 'asset', parent_id = (SELECT id FROM public.accounts WHERE code = '12')
WHERE code = '129';

-- Duplicated, movement-free accounts: deactivate (not deleted, one is still referenced by an invoice)
UPDATE public.accounts SET is_active = false WHERE code IN ('1303','1403','1503');