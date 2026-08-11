
REVOKE EXECUTE ON FUNCTION public.get_book_balance(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_book_balance(uuid, date, date) TO authenticated, service_role;
