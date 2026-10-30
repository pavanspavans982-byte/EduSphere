# EduSphere verification report

**Verification date:** 2026-10-30  
**Scope:** Current local source and test environment. No public deployment was performed.

## Summary

| Area | Result | Evidence / limits |
|---|---|---|
| Backend integration suite | Pass | `npm test` exited 0: 25 tests passed, 0 failed, 0 skipped after adding account, resource, assessment, and course workflow tests. |
| Frontend production build | Pass | `npm run build` exited 0; TypeScript project build and Vite production build succeeded. |
| Frontend type check | Pass | `npm run check` exited 0. |
| Authentication, resources, assessments | Pass for tested API flows | Tests cover registration/session/logout/login; resource search/filter/bookmark/progress/read-back; and assessment catalog/submit/history. Existing tests also cover password hashing, authorization, validation, reset-token replay, file/profile handling, AI provider failure behavior, assessment idempotence, and sync logic. |
| Mobile layout sweep | Pass for overflow check | Browser viewport sweep visited dashboard, resource library, offline resources, doubt solver, skills, assessments, profile, and sync at 375×812, 768×900, 1024×900, and 1440×900. No horizontal overflow was detected at those widths. This was a layout check, not a full interaction audit of every page. |
| Landing mobile menu | Pass for visible destinations | At 375×812, opening the mobile menu displayed Home, About, Features, Resources, and Log in. |
| Resource library search/filter | Pass | Browser interaction opened the student resource library, selected Mathematics, then searched “percent”; the list narrowed from 23 resources to 2 Mathematics resources and finally to “Understanding percentages”. |
| Internal courses and lessons | Pass for tested flows | API tests covered authentication, catalogue filtering, lesson detail, admin authorization/content CRUD, student-scoped progress sync, duplicate retry, invalid cross-course lesson rejection, and read-back. Browser checks opened an Algebra lesson, answered its practice questions (2/2), marked completion, refreshed to verify persistence, and restored the test lesson to its prior incomplete state. |
| Offline course content | Pass for previously cached lesson display | Browser visited the course online to cache its content, then simulated offline mode, navigated through the SPA, and reopened the lesson from IndexedDB. This did not test a cold browser restart or production service-worker shell offline. |
| Offline shell and route chunks | Pass for shell/route loading; offline files unverified | Production preview activated service worker `edusphere-shell-v4` and cached 15 URLs (shell plus generated CSS/JS assets). With the browser offline, `/resources/offline` loaded and displayed its offline status and empty saved-resource state. This confirms shell and route-chunk loading, not opening a downloaded file. |
| Resource upload/download and offline file opening | Not verified in this run | No authorized admin PDF upload and no permitted PDF download/open flow was executed. |
| Online/local AI response | Not verified against a live provider | Automated tests confirm configured providers are invoked and unconfigured/unavailable providers report errors. No live local model or online provider was configured for this run. |
| Sync with a deployed central server | Not verified | Backend tests exercise sync logic in an in-memory database; this is not a deployed multi-device or production sync test. |
| Production deployment / security headers / HTTPS | Not verified | No deployment or external security assessment was performed. |

## Test evidence

## Module-by-module results

| Test case | Expected result | Actual result | Status | Problem / remaining work |
|---|---|---|---|---|
| Registration, login, logout, session | Valid account creates a session; wrong password fails; logout revokes session | In-memory API workflow passed all assertions; existing suite also checked password hashing and expired sessions | Pass | No browser credential-entry E2E or production identity provider test |
| Student dashboard | Signed-in student can load the dashboard with no layout overflow | Existing local browser rendered the dashboard at the tested viewport sizes | Pass for render/layout only | Dashboard data behavior was not exhaustively exercised |
| Student profile | Authenticated update persists and invalid fields are rejected | Existing API integration test updated profile and checked invalid year rejection; viewport render checked | Pass for tested API and layout | Avatar storage lifecycle on production not tested |
| Resource library search/filter | Search and subject filter return matching resources | API test and browser interaction narrowed list from 23 to Mathematics results to “Understanding percentages” | Pass | Additional language/class/type combinations not all browser-tested |
| Resource bookmarks/progress | Bookmark and progress survive read-back | New in-memory API workflow saved a bookmark and 75 seconds of progress, then read both back | Pass | Cross-device conflict behavior only covered by API suite |
| Admin resource management | Non-admin cannot change resources; authorized management validates CRUD input | Existing backend API integration test exercises protected resource management and CRUD validation | Pass for tested APIs | No admin UI browser flow, and no real uploaded PDF was used in this run |
| Permitted PDF upload/download | Authorized upload is validated, downloaded, and stored locally only after success | No browser upload/download performed | Not verified | Needs authorized synthetic admin plus permission-approved test PDF |
| Offline application and route chunks | Cached shell and routes load without network after first install | Service worker v4 had 15 cached URLs; offline `/resources/offline` route rendered and showed offline status | Pass for cached route | The offline library was empty; opening a saved PDF/text was not verified |
| AI Doubt Solver | Configured provider returns actual answer; unavailable provider reports error | Tests verified provider adapter responses with an injected fetch and honest unavailable/error paths; no live provider was configured | Partial | No real online/local model response tested in this environment |
| Skill Development | Activities persist locally and supported records sync | Skill route rendered in viewport sweep; sync backend test covers supported operation processing | Partial | No new browser activity was recorded and verified end to end |
| Adaptive assessments | Authenticated attempt is graded, persisted, and readable from history | New API workflow submitted an attempt and checked history/detail; existing tests cover grading and idempotence | Pass for API flow | Browser quiz journey and actual adaptive learning outcome not separately measured |
| Central server/database | API reads/writes central records | API integration tests used an isolated in-memory SQLite instance | Pass for test instance | Production database file, backups, and hosting connectivity not tested |
| Synchronization | Queued work is authorized/idempotent and only acknowledged work completes | Existing in-memory API integration test covered sync authorization, retries, conflict handling and admin data scoping | Pass for tested logic | No real network interruption/reconnect sync against a deployed server |
| Mobile/tablet/desktop layout | Main student routes fit and remain readable at target widths | Browser sweep at 375×812, 768×900, 1024×900, 1440×900 found no horizontal overflow on the visited routes | Pass for overflow check | No physical-device, touch-ergonomics, screen-reader, or visual-regression test |
| Admin dashboard authorization | Student cannot access admin-only APIs | Existing backend tests assert admin-only API restrictions and allowlisted bootstrap | Pass for API authorization | Admin dashboard UI was not tested with an authorized production account |
| Course authoring | Authorized admin can create, edit, publish, and unpublish lessons; progress is retained when unpublished | New API integration test created a course and lesson, rejected a student request, and unpublished content while confirming database rows remained | Pass for tested API flow | The admin editor UI was type-checked and built but was not browser-driven with a configured admin account |

### Backend: `npm test`

Final run: **exit code 0 — 25 passed, 0 failed, 0 skipped**.

Four additional in-memory API workflows were added:

- Account workflow: register, read authenticated session, reject an invalid password, logout and revoke the cookie, then sign in and read the account again.
- Resource workflow: reject unauthenticated access, search and filter, bookmark, save progress, and read back the persisted resource and activity.
- Assessment workflow: reject unauthenticated access, read the catalog and assessment, submit an attempt, then read the result from history and its detail endpoint.
- Course workflow: list/filter the six original courses, retrieve lesson content, save progress through sync, verify idempotent retry and per-student isolation, reject invalid cross-course progress, restrict course administration, and retain content/progress when it is unpublished.

The existing suite covers account security, profiles, resource CRUD permissions, AI response/error behavior with injected providers, assessment grading/idempotence, and synchronization authorization/idempotence. These tests run against an isolated in-memory SQLite database. They do not establish production database backup, network, provider, or deployment behavior.

### Frontend

- `npm run build`: exit code 0. TypeScript project build and Vite bundling succeeded.
- `npm run check`: exit code 0.
- Course browser journey: course text search narrowed to one course; Mathematics filter showed two courses; the Algebra course opened with its authored lesson and practice content. Both answers were checked correctly, lesson completion appeared after refresh, then was returned to incomplete so the demo account's starting progress was restored.
- Offline course browser check: after opening the course online, simulated offline mode, navigated through the SPA back to the catalogue and lesson, and confirmed the saved lesson text was displayed from IndexedDB with an offline-copy indicator.
- Course mobile layout check: at a Playwright-set viewport of 390×844, the lesson title remained visible and document width (375 CSS px) did not exceed the viewport width.
- Server startup: a second `npm run dev` attempt exited 1 because ports 5180 and 3001 were already occupied. The pre-existing frontend returned HTTP 200 and `/api/health` returned `available`; those running app processes were reused, not stopped.
- Test environment: Node.js v26.13.0 available; Docker command unavailable. Docker was not required for these isolated in-memory SQLite tests. Browser interaction used the integrated Playwright browser.
- Browser UI checks were performed on already-running local apps. The first resource-library screenshot exposed missing page-specific styles; responsive styles were added after that observation. The search/filter interaction and viewport sweep were executed after the styling changes.
- Production preview check: confirmed service worker v4 active and 15 cache entries present, then disabled network access and loaded the My Offline Resources route. The screen correctly indicated offline mode and no saved resource was present to open. Network was restored afterward.

## Performance observation

Before route splitting, the existing production entry JavaScript was 416,208 bytes (118.64 kB gzip). After route-level lazy loading, the emitted entry is 280,900 bytes (86.46 kB gzip), a reduction of 135,308 bytes raw (about 32.5%) and 32.18 kB gzip (about 27.1%). Resource, assessment, account, AI, skills, and sync/admin code is emitted in separate chunks and loads when its route is visited.

The resource-specific responsive styles increased the built CSS. The external Google Fonts `@import` was removed in favor of a system font stack, which avoids a render-blocking third-party font request and lets the application render without contacting Google Fonts. No Lighthouse/Core Web Vitals run or slow-network performance benchmark was completed.

## Remaining verification

1. In a fresh browser profile, load the production preview online once; verify the service worker v4 and all manifest assets are cached, then test cold offline reload and direct route entry.
2. With an authorized synthetic admin and disposable database, exercise the new course editor UI (create/edit/publish lesson) and verify its published content through the student journey.
3. With an authorized test administrator, upload a permission-approved PDF, download it as a student, take the app offline, and open the saved file.
4. Configure a real AI provider or host a local model and verify its status, response, and failure cases without claiming it is device-local.
5. Run the same auth, resource, and sync journeys against the intended deployment and persistent database before a public demonstration.
