# Library feature guide

Pages: `/library` (catalogue, discovery, My reading list), `/resources/:id` (entry detail), `/admin/resources` (catalogue management).
Code: `backend/src/controllers/resources.js`, `controllers/admin.js`, `frontend/js/{discover,library-list}.js`, `frontend/js/pages/{library,resource-detail,admin-resources}.js`.
Tests: `backend/test/library.test.js` and `resources.test.js`.

## What works

- **Search and filters (server-side, debounced):** title, author, publisher, summary, tags and category; sort by title, recently added or most saved; pagination.
- **Discovery:** Featured (set by administrators), Recently added, Most saved (a real bookmark count; shown only when something has been saved) and Recently viewed (your own history). Sections appear only when they have content.
- **Entry detail:** summary, details, author, publisher, year, tags, eligibility/instructions where set, a verified external access link (administrators only, https only, opens in a new tab and says it is external), related entries, save, reading list, report an issue, request a service where the entry accepts requests.
- **My reading list (private, persisted):** status (want to read, reading, finished), progress 0 to 100 (finishing sets 100), collection label, private notes, search and collection filter, manual ordering (up/down), remove with confirmation, CSV export (spreadsheet formulas are neutralised). Other users can never read or change your list.
- **Administration (`resource:manage`):** create, edit, publish/unpublish, feature, set category, cover image URL, access link, publisher, year and tags. Changes are audited. Unpublished entries are invisible to the public.

## API

`GET /resources` (`kind`, `q`, `categoryId`, `tag`, `featured`, `sort`, `page`), `GET /resources/home`, `GET /resources/:id` (also records your view), `PUT|DELETE /resources/:id/bookmark`,
`GET /reading-list`, `PUT|PATCH|DELETE /reading-list/:id`, `PUT /reading-list-order`, `GET /reading-list/export.csv`, `POST /resources/:id/report`; admin: `/admin/resources*`.

## Database (migration `20261025010000_resources_library`)

`Resource` gained `featured`, `accessUrl`, `tags`, `publisher`, `publishedYear`; `ReadingListItem` gained `notes`, `progress`, `collection`, `position`; new `ResourceView(userId, resourceId, viewedAt)`.

## Not implemented

- **Borrowing, reservations, renewals, due dates, inventory:** there is no inventory model, so none of it is shown as working. The page states that borrowing is not available. Adding it needs a real copies/loans model and library staff roles.
- **Catalogue usage and search statistics for staff, bulk import, ISBN/identifier search, cover images fetched from a book service:** not built. Covers are administrator-entered https URLs or a plain generated tile.
- **Recommended reading from interests:** not built (there is no interest profile); only real signals (featured, most saved, your history) are shown.
- Seeded catalogue entries are development data (`isDemo`). They are plain entries now, with no "Sample" label, so **clear them with `npm run db:seed -- --reset-demo` and add real entries before presenting this as a real library.**
