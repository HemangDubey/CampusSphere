# Screenshot checklist

**No screenshots have been captured or stored in this repository.** This is the list to capture manually for the
presentation and coursework evidence. Run the app (`npm run dev`) and use a normal browser window (1280 px wide
unless noted). Save files as `screenshots/NN-name.png`. Do not crop out the address bar, so the URL is visible.

Before you start: register two students (A and B) and promote one administrator with
`npm run admin:promote -- admin@example.edu`; run `npm run db:seed`.

| # | Page / state | URL | How to capture |
| --- | --- | --- | --- |
| 01 | Landing page (top and scrolled) | `/` | Fresh load, signed out |
| 02 | Landing page on a phone width | `/` | DevTools device toolbar, 375 px |
| 03 | Register page with validation errors | `/register` | Submit empty, then with mismatched passwords |
| 04 | Login page and password toggle | `/login` | Click "Show" on the password |
| 05 | Forgot / reset password | `/forgot-password` | Submit an email; note the on-page "no email delivery" notice |
| 06 | Student dashboard | `/dashboard` | Signed in as student A |
| 07 | Student profile saved | `/dashboard#profile` | Edit and save; capture the "Profile saved" message |
| 08 | Events list with filters | `/events` | Filter category = Workshop |
| 09 | Event details dialog | `/events` | Click Details on any event |
| 10 | Symposium registration form | `/events` | Filter Symposium, click Register |
| 11 | Event registration confirmation and My registrations | `/events` | After registering, open the tab |
| 12 | Full event (capacity 2) | `/events` | Register A and B on "Research Paper Writing Workshop", then view as a third student |
| 13 | Travel explorer + details + Saved tab | `/travel` | Save a destination, open Saved |
| 14 | Campus resources and library | `/resources` | Library tab with a search |
| 15 | Healthcare page with disclaimers | `/healthcare` | Top of page |
| 16 | Appointment form errors, then success and status | `/healthcare` | Submit empty; then valid; show "Requested (demo)" |
| 17 | Employee page as a student (blocked) | `/employees` | Student A |
| 18 | Employee list, add form and duplicate-ID error | `/employees` | Administrator |
| 19 | Course registration and duplicate error | `/courses` | Register the same course twice |
| 20 | Checkout: summary and totals | `/checkout` | Set quantities; show the demo banner |
| 21 | Checkout results (approved / declined / cancelled) | `/checkout` | One capture each; each says "Demonstration only" |
| 22 | Mouse events lab | `/labs/mouse` | Interact with several zones; capture counts |
| 23 | mouseenter vs mouseover comparison | `/labs/mouse` | Move into the inner box; capture the counters |
| 24 | Keyboard events lab with modifier and shortcut | `/labs/keyboard` | Press Shift+A, then Ctrl+Enter |
| 25 | AI Assistant empty state and example prompts | `/assistant` | Signed in |
| 26 | AI Assistant conversation | `/assistant` | **Needs a working key and network access.** Capture a real reply |
| 27 | AI Assistant error with Retry | `/assistant` | Works without a key or offline: shows the honest error |
| 28 | Voice dictation (if supported) | `/assistant` | Chrome/Edge over HTTPS or localhost; allow the microphone |
| 29 | Read aloud and Stop | `/assistant` | After a reply, click Read aloud |
| 30 | Bootstrap demo (local files) | `/pages/bootstrap-demo.html` | Also capture DevTools Network showing files loaded from `/vendor/bootstrap-5.3.3/` |
| 31 | Standalone coursework pages (Q01–Q41) | not built | Capture after the questions are supplied and pages are built |
| 32 | API health check | `/api/health` | JSON response in the browser |
| 33 | Automated test results | terminal | Run `npm test`; capture the full output |
| 34 | Database migrations | terminal | `cd backend && npx prisma migrate status` |
| 35 | Deployment configuration | host dashboard | Only after you deploy; nothing is deployed yet |
| 36 | Not-found page | `/does-not-exist` | |

Tips: for the AI screenshots do not show your API key (hide the terminal and environment settings). If a
screenshot shows an email address, use a test account.
