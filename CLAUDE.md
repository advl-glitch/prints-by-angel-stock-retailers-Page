# Prints by Angel — Retail Partner Ordering Page

## Owner
Angel Verde — "Prints by Angel" letterpress card business

## Tech Stack
- Vanilla HTML/CSS/JS (single file: `index.html`)
- Google Apps Script backend (shared with admin app)
- GitHub Pages hosting (planned move to Netlify)

## Key File
- `index.html` — entire retail frontend
- `Retail Partner Page - Letterpress App.code.gs` — GAS backend reference

## Related Repo
- Admin app: `letterpress-inventory-app-Sandbox`

## Architecture
- Partner verification flow (enter details → verify → browse stock)
- Uses `getPublicStock` GAS endpoint
- `fixPhotoUrl()` converts old Google Drive URLs to `lh3.googleusercontent.com/d/` format
- Multi-tag filtering with AND logic (`activeTagFilters` Set)
- Search respects active tag filters
- No +/- buttons on quantity — just input + Add button
- Order review → submit with button hiding during submit
- Thank you screen with dog mascot targets `#retailer-main`

## Important Notes
- Separate GAS deployment URL from admin app (check SCRIPT_URL in the file)
- Card and list view toggle
- All item photos run through `fixPhotoUrl()` (card view, list view, lightbox)
