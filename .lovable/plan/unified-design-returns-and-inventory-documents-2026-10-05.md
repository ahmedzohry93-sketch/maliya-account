# Unified design, returns, and inventory documents

The work is split into 4 phases. Each phase ships separately so you can review it before the next one starts. Existing journal entries and the accounting engine stay unchanged. Every new document posts through the same rules already used for invoices.

## Phase 1: One design for every page and printout
- One shared "document page" layout for creating and editing documents. It has the same top bar as the reports (Back, number with Previous/Next, Save, Post, Print, More), a white classic sheet, a header block of fields, a dense lines table, and a totals box.
- Moved onto this layout: the income statement (aligned with the other reports), the create/edit journal entry page, and sales and purchase invoices (taken out of the customer/supplier workspace and given their own pages).
- One shared look for buttons, fields, tables, titles, filters, and the action bar, built from the existing color and font settings.
- One print layout with the company header, document title and number, a meta row, the table, totals, and a signatures footer. Every document and report uses it.
- Fewer extra arrows and dropdowns: common actions are shown as buttons, and rare actions sit under one "More" menu.

## Phase 2: Return invoices
- Two new invoice types: **Purchase return** (pick a supplier) and **Sales return** (pick a customer).
- Pick the original posted invoice. Its lines load automatically. Enter the quantity to return for each line; it cannot be more than the quantity left to return. Price, discount, and tax carry over from the original.
- The return is linked to the original invoice, and the original shows the returns made against it.
- Posting does three things:
  - Creates the reverse journal entry automatically, using the same accounts as the original.
  - For sales returns, also reverses the cost of goods sold.
  - Updates stock: sales returns add stock back, purchase returns remove it.
- Printed with the same invoice print layout.

## Phase 3: Warehouses and stock documents
- New **Warehouses** list and **Branches** list. Stock is tracked per product per warehouse, and the current stock is moved into a default "Main Warehouse".
- **Stock-in voucher**: number, date, warehouse, source (supplier or other), reason, lines (product, quantity, unit, cost), notes, and attachments.
- **Stock-out voucher**: number, date, source warehouse, recipient, reason, lines, notes, and attachments. The recipient can be:
  - another warehouse
  - another branch
  - an internal department
  - an outside party
- If the recipient is a warehouse or branch, the voucher becomes a **Stock transfer** instead of a plain stock-out.

## Phase 4: Stock transfers
- A transfer records: from warehouse, to warehouse/branch, lines, date, status (Draft, Sent, Received), and the user who created it.
- Stock leaves the source warehouse when the transfer is sent and arrives at the destination when it is received. Both moves are linked so the transfer can be traced.
- Printed with the same layout.

## Technical details
- Database: add `sales_return` / `purchase_return` to the invoice type, plus `original_invoice_id` and `original_line_id` links. New tables for warehouses, branches, stock vouchers and their lines (in, out, transfer), and stock moves that include a warehouse. Permissions follow the existing pattern, with matching new permissions.
- New pages: invoices (list, new, details), returns, warehouses, stock vouchers, and transfers. All are added to the top navigation and sidebar.
- Shared building blocks: a document page layout and a print sheet that extend the existing classic report styles.
- Return posting: new functions next to the existing invoice posting that mirror the original invoice's lines in reverse.
