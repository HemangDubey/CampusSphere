# Campus Resources guide

Pages: `/resources`, `/resources/:id`, `/requests`, `/requests/:id`, `/admin/resources`, `/admin/requests`.
Code: `backend/src/controllers/{resources,serviceRequests,admin}.js`, `frontend/js/{discover,request-form}.js`, `frontend/js/pages/{resources,resource-detail,requests,request-detail,admin-resources,admin-requests}.js`.
Tests: `resources.test.js`, `library.test.js`, `admin.test.js`.

## What works

- **Directory:** sections (departments, facilities, support, services, clubs, organisations, links), category and availability filters, "accepts requests" filter, server-side search, sort (title, recently added, most saved), pagination, Saved tab.
- **Discovery:** Featured (administrator-chosen), Recently viewed (your history), Most saved (real bookmark counts), Recently added.
- **Detail page:** summary, details, eligibility, instructions, required documents, contact (only when an administrator has entered it, otherwise a short "no verified contact yet" note), tags and publication info, official link, related resources, save, report an issue, make a request. Empty sections are omitted, never invented.
- **Service requests (configurable form per resource):** choose the service, complete the form (fields defined by administrators), review, submit; the server issues a reference. Status engine: submitted, under review, information required, approved, rejected, cancelled. Requesters track status and history, answer information requests and cancel open requests. Reviewers (faculty see only requests assigned to them, administrators see all) assign, move statuses with notes, and see overdue requests. Invalid transitions and self-review are refused by the server. Each step notifies the other party.
- **Administration (`resource:manage` / `request:review`):** create, edit, publish/unpublish, feature, archive by unpublishing, configure request-form fields as JSON, view the queue.

## Not implemented

- **Bookings and reservations (study rooms, equipment loans, venues):** no availability model exists, so none is offered. Use the request workflow until real scheduling data is available.
- **"Completed" request status:** the engine ends at approved or rejected.
- **Visual form builder** (fields are edited as JSON), **engagement metrics screen** for administrators (counts exist in the data but no report page), **image upload** (administrators paste an https image URL), **personalised "for you" section**.
- **Content:** nothing in the seed data is official campus information. Administrators must publish real entries, contacts and hours. Run `npm run db:seed -- --reset-demo` to remove development entries.
