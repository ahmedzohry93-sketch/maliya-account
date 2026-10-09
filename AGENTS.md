<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Documents, journal editors and partner workspaces use DocToolbar and DocSheet; reports reuse DocumentHeader and DocumentFooter — shared presentation keeps printed identities consistent.
- Content routes use route-local head metadata, with pageMeta for standard entries — every page has its own descriptive sharing title.
- Warehouse reports derive location balances from stock movements without changing posting logic — transfers remain location-specific and historical accounting stays intact.
- Returns live in `invoice_returns`/`invoice_return_lines` (not new invoice types) so existing sales/purchase totals stay unaffected; posting logic is in `src/lib/inventory-docs.ts`.
