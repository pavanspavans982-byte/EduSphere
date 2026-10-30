# EduSphere — Bridging the Digital Learning Gap

EduSphere is a student-focused, offline-first learning platform prototype. The React application and Express API support student accounts, demo learning resources, device-local learning activity, assessments, configured AI providers, and authenticated synchronization with a central SQLite database.

> **Content and rights notice:** EduSphere links students to official NCERT/ePathshala, DIKSHA, SWAYAM, NPTEL, National Digital Library of India, and OpenStax source portals. These are source-directory links, not copied or API-synchronized content. Rights vary by individual item; free access does not imply redistribution permission. The library's existing EduSphere lesson previews remain clearly labelled sample text. Create your own account for a demo; no shared demo password is included.

## Features

- **Accounts and profiles:** Registration, login, logout, profile details, password reset, and protected student/admin routes.
- **Educational resource library:** Search plus subject, class/course level, language, difficulty, and type filters; source/license metadata; original provider links; bookmarks; recently opened items; and My Offline Resources.
- **Internal learning courses:** Six original English-language courses contain 18 written lessons across Mathematics, Physics, Chemistry, Biology, and Computer Science. Lessons include objectives, explanations, examples, summaries, and practice questions. Course progress and bookmarks are stored locally and synchronized to the authenticated student account.
- **Course management:** Allowlisted administrators can create/edit courses and written lessons, publish/unpublish them, and preserve lesson records and student progress when content is unpublished. The editor accepts structured lesson JSON; course video and file attachments are not implemented.
- **Trusted resource directories:** Official entry points for NCERT/ePathshala, DIKSHA, SWAYAM, NPTEL, NDLI, and OpenStax. EduSphere does not copy their books, videos, or courses.
- **Permitted offline downloads:** Administrators can upload permission-approved PDFs (10 MB maximum) after confirming storage/distribution rights. The PDF is stored centrally and downloaded into IndexedDB for offline access. External links themselves are not mirrored. Sample resource previews save as text files; EduSphere no longer fabricates PDF or media files from preview text.
- **Offline learning:** Service-worker application shell caching in production and IndexedDB persistence for permitted PDF downloads, sample text previews, previously opened course lessons, course progress/bookmarks, skill activity, assessment packages/attempts, profile edits, chat history, and sync queue.
- **Responsive resource workspace:** The resource library, saved-resource view, resource details, and admin resource form have page-specific responsive styling for small screens.
- **Deferred page code:** Account pages, resources, AI, skills, assessments, and sync/admin pages are split into route chunks rather than included in the initial application bundle.
- **AI Doubt Solver:** Calls the configured server-host Ollama model or configured online chat-completions provider. Provider and error states are shown; the app does not invent answers if both are unavailable. Pending questions remain local unless the student explicitly consents to queue them.
- **Skill Development:** Demo skill activities record lesson and exercise actions locally and queue them for the central API.
- **Adaptive Assessments:** Demo assessments grade actual answers. Offline attempts are persisted and submitted to the server when available. Difficulty adjustment is a deterministic rule based on recorded answers, not AI.
- **Central synchronization:** Authenticated resource, bookmark, skill, course-lesson, profile, and consented doubt-request operations are validated by the Express API. Stable IDs and payload hashes support retries. The browser removes queued operations only after an acknowledgement. Assessment results use the existing server grading endpoint.
- **Admin tools:** Allowlisted admins can manage resources and original course/lesson content and view server-side activity totals and recent sync outcomes.
- **Course APIs:** Student access uses `GET /api/courses`, `GET /api/courses/:courseId`; administrator content uses `GET/POST /api/admin/courses`, `PUT/DELETE /api/admin/courses/:courseId`, and `PUT/DELETE /api/admin/courses/:courseId/lessons/:lessonId`.
- **Resource admin APIs:** `GET/POST /api/admin/resources`, `PUT/DELETE /api/admin/resources/:id`, `PUT/DELETE /api/admin/resources/:id/file`; student PDF access uses authenticated `GET /api/resources/:id/file`.

## Technologies

- Frontend: React 18, TypeScript, Vite, React Router, Lucide icons, CSS, IndexedDB, Service Worker API
- Backend: Node.js 22.5+, Express, SQLite (`node:sqlite`), bcryptjs, Nodemailer, Sharp
- Tests: Node's built-in test runner and API/database integration tests; manual browser checks are documented in the test report

## Project layout

```text
.
├── backend/
│   ├── data/                 # Runtime SQLite database (created on startup)
│   ├── src/
│   │   ├── ai.js             # Ollama and online AI provider adapters
│   │   ├── app.js            # Express API, authentication, resources, sync, admin
│   │   ├── assessment-data.js
│   │   ├── database.js       # SQLite schema and migrations, including resource files
│   │   ├── resource-data.js
│   │   └── validation.js
│   ├── test/                 # Backend/API integration tests
│   └── test-support/         # Isolated in-memory test server helpers
├── frontend/
│   ├── public/                # PWA manifest, service worker, icons
│   └── src/
│       ├── ai/                # Doubt Solver and IndexedDB chat history
│       ├── assessments/       # Assessment UI and local attempt storage
│       ├── auth/              # Account pages, auth context, API client
│       ├── courses/           # Course catalogue, lesson reader, admin editor
│       ├── offline/           # Offline resource and progress storage
│       ├── resources/         # Resource library and offline resources
│       ├── skills/            # Skill catalog, UI, local activity storage
│       ├── sync/              # Sync queue, runner, student/admin pages
│       ├── App.tsx
│       └── styles.css
├── shared/
│   └── course-catalog.json    # Original seeded course and lesson content
├── package.json               # npm workspaces and root commands
└── README.md
```

## Requirements and setup

- Node.js 22.5 or newer (required for `node:sqlite`)
- npm 10 or newer

In PowerShell, from the project root:

```powershell
npm install
npm run dev
```

The frontend is at [http://localhost:5180](http://localhost:5180); the API is at [http://localhost:3001](http://localhost:3001). The root dev command starts both processes. For separate terminals:

```powershell
npm run dev:api
npm run dev:web
```

Backend-only tests and frontend production build:

```powershell
npm test
npm run build
```

`npm run build` runs the TypeScript project build and Vite production bundler. To serve the built frontend for a PWA check, use a static server/proxy that forwards `/api` to port 3001; `npm run dev` alone does not register the production service worker.

The production build emits `frontend/dist/precache-manifest.json`; the service worker uses it to cache built route chunks as well as the app shell. First installation requires a working connection and enough device storage. Offline route navigation is supported only after the service worker installs successfully and the app assets are cached.

## Database and environment

The API uses one SQLite database. By default it is created at `backend/data/edusphere.sqlite`; the directory and tables are created/migrated on API startup. Override its location with `AUTH_DB_PATH`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | API listening port |
| `FRONTEND_ORIGIN` | `http://localhost:5180` | Allowed web origin and reset-link fallback |
| `AUTH_DB_PATH` | `backend/data/edusphere.sqlite` | Central SQLite file location |
| `ADMIN_EMAILS` | empty | Comma-separated email allowlist for administrator setup and admin APIs |
| `ADMIN_BOOTSTRAP_TOKEN` | unset | Server-only secret of at least 32 characters, required to explicitly grant administrator access to an authenticated allowlisted account |
| `LOCAL_AI_BASE_URL` | `http://127.0.0.1:11434` | Loopback Ollama URL reachable from the API host |
| `LOCAL_AI_MODEL` | `qwen2.5:3b` | Ollama model name; install it in Ollama on the API host |
| `ONLINE_AI_CHAT_COMPLETIONS_URL` | unset | HTTPS chat-completions endpoint (HTTP permitted only for loopback development) |
| `ONLINE_AI_MODEL` | unset | Online provider model identifier |
| `ONLINE_AI_API_KEY` | unset | Online provider secret; backend only, never put in frontend variables |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | unset/default port | Optional password-reset email transport |
| `SMTP_SECURE` | `false` | Whether SMTP transport uses TLS mode |
| `PASSWORD_RESET_BASE_URL` | `FRONTEND_ORIGIN` | Optional password-reset link base |

Example PowerShell environment for local development:

```powershell
$env:ADMIN_EMAILS = "admin@example.com"
$env:AUTH_DB_PATH = "backend/data/edusphere.sqlite"
npm run dev
```

To set up an administrator, configure `ADMIN_EMAILS` with the intended account email and set a private `ADMIN_BOOTSTRAP_TOKEN` of at least 32 characters on the API process. Register/sign in to that account, open `/admin`, and submit the token. Registration alone never grants administrator privileges. The token must not be added to frontend configuration or source control. Existing role assignments are not rewritten when the server starts; admin APIs continue to require both the persisted admin role and an email on the server allowlist. Never use a real password, provider key, SMTP secret, or other credential in source control or frontend configuration. The optional online AI provider is configured exclusively on the API process. The local model is also called by the API host; it is not downloaded to each student's device.

## Production deployment preparation

Deployment has not been performed. For deployment, use a supported Node.js 22.5+ host and serve the frontend over HTTPS. Build the client with `npm run build`, then serve `frontend/dist` behind a reverse proxy that:

1. Sends `/api/*` to the Express process (default port 3001) without changing the path.
2. Serves static assets from `frontend/dist`, with long-lived caching for hashed `/assets/*` files.
3. Serves `index.html` for SPA routes such as `/resources` and `/assessments`.
4. Serves `sw.js`, `manifest.webmanifest`, icons, and `precache-manifest.json` from the same origin as the app.

Run the API with `npm start -w backend`. Set `NODE_ENV=production`, `PORT`, `FRONTEND_ORIGIN` to the public frontend origin, and `AUTH_DB_PATH` to a persistent writable SQLite volume. Configure allowlisted admin setup and any SMTP/AI integrations only through server-side environment variables. Production cookie security is enabled when `NODE_ENV=production`. Keep the frontend and API on the same origin (or a compatible same-site deployment); the current strict cookie policy is not intended for unrelated cross-site frontend/API domains.

SQLite is a single-instance database in this configuration. Back it up, monitor available storage (including uploaded PDF rows), and do not scale multiple API instances against a local ephemeral filesystem. Configure HTTPS termination and persistent database backups at the hosting layer. Verify `/api/health`, registration/login, static deep-link refresh, admin authorization, file limits, and sync confirmation on the intended host before inviting students. Never put AI keys, SMTP secrets, or admin bootstrap tokens in `VITE_*` variables.

For local production-preview checks, use one terminal for `npm run dev:api` and another for `npm run build` followed by `npm run preview -w frontend`; Vite preview uses port 5181 and proxies `/api` to localhost:3001. This is a local verification setup, not a production hosting configuration.

## Verification and competition materials

- Actual test evidence and unverified areas: [docs/testing-report.md](./docs/testing-report.md).
- Competition abstract, slide outline, demo flow, and viva answers: [docs/competition-guide.md](./docs/competition-guide.md).
- Do not present demo lessons, server-host AI, offline use, or server synchronization as live functionality unless required services have been configured and the demonstration has confirmed them.

## Offline demonstration

1. Run the app while connected and sign in. Browser service workers require localhost or HTTPS.
2. Browse the resource library, test search and the subject/language/difficulty/type filters, and open an **Original source** link. Source portal links require connectivity and have item-specific terms.
3. Open **Learning courses**, select an original EduSphere course, and open a lesson while connected. The complete fetched course bundle is stored in IndexedDB for that student. Complete/bookmark a lesson and answer its practice questions.
4. Use **My Offline Resources** for permission-approved PDFs uploaded by an authorized admin or clearly labelled EduSphere sample text previews. The library does not download third-party source files or create fake PDFs/audio/video.
5. Open **My Offline Resources** and confirm the saved item opens. Complete skill activities or a cached assessment to create local progress.
6. With production build serving the site, disconnect the network and navigate to the previously opened course lesson. The course reader can display its IndexedDB copy and keep lesson updates in the local outbox. The service worker caches the app shell only after its successful initial install.
7. Authentication against the central API, original external sources, remote AI, and new downloads require connectivity. A network indicator does not imply the server is reachable.

## Resource administration

1. Set `ADMIN_EMAILS` on the API before registering the administrator account. Admin role assignment and resource APIs are enforced by the server.
2. In **Manage resources**, add resource details, select a subject, enter language, source/provider, license information, and optionally an approved source URL.
3. URLs are accepted only over HTTPS from the supported educational-source domains (NCERT/ePathshala, DIKSHA, SWAYAM, NPTEL, NDLI, OpenStax). Add class/course level alongside language, category, difficulty, source and license information. Source entries link out; EduSphere does not scrape or redistribute portal content.
4. To upload an actual PDF, select a PDF no larger than 10 MB and confirm that you have permission to store and distribute it. The API checks the PDF content signature and only marks a PDF downloadable after a successful upload. The browser stores a copy locally only after the download succeeds.
5. Admin-added links and resource records can be edited/deleted; the seeded sample lessons and official source-directory cards are protected. Remove an uploaded PDF from the resource edit form without deleting its metadata.

The SQLite database stores uploaded resource PDFs in its `resource_files` table. Plan for database backups and available disk capacity: each uploaded file consumes up to 10 MB plus database overhead.

## Synchronization demonstration

1. Register/login with an online API connection.
2. Record a bookmark, resource progress, course lesson completion/bookmark, skill activity, assessment result, or profile edit.
3. For an offline test, disconnect first and make changes only in modules whose local data has been loaded/saved on this browser. Check the Sync center status.
4. Reconnect and use **Sync Now** or wait for automatic retry. A success state is displayed only after server responses confirm the operations. Refresh and verify the corresponding server-backed history/activity.
5. For a pending Doubt Solver question, opt in explicitly in Sync center; the central service queues the request for follow-up, it does not produce an answer.

Sync batch route: `POST /api/sync/batch` (maximum 100 operations/request). Related routes: `GET /api/sync/status`, `GET /api/sync/snapshot`, `GET /api/doubt-requests`, and admin-only `GET /api/admin/overview`. Assessment attempts continue through `POST /api/assessment-attempts`. Resource management and activity use the existing `/api/resources` routes.

## Security notes

- Student passwords are hashed on the server; session credentials are HTTP-only cookies.
- APIs enforce authentication, admin allowlists, request validation, and rate limits on account/AI routes.
- Sync records are scoped to the authenticated student. Admin summaries omit student credentials and doubt-question text.
- The client stores learning state and offline content in browser IndexedDB, not passwords.
- The browser Online/Offline state only measures network connectivity. API confirmation is required for server sync success.

## Known limitations

- This is a local/demo prototype, not a deployed central service. Registration creates accounts in the configured SQLite database; there are no seeded demo credentials.
- Six original EduSphere starter courses are available (18 lessons across five subjects, English only). They are demonstration curriculum, not official NCERT/DIKSHA/SWAYAM/NPTEL/NDLI/OpenStax materials or a complete syllabus. Course lessons can be authored/edited as text and structured questions, but course video/file attachments, translations, enrollment, and broad catalog coverage are not implemented. Trusted library entries remain external provider links, not individually curated/ingested textbook files; verify provider reachability and item-specific terms before presenting or reusing an item. EduSphere supports permitted PDF upload and offline PDF storage; Word, original audio/video hosting, and automated provider catalog APIs are not implemented.
- PWA shell caching is enabled only in production builds. Validate on a served production build and the same origin after the first successful load; development Vite HMR is not the offline demonstration environment.
- AI works only when Ollama plus the configured model is reachable from the API host, or the online provider endpoint/model/key are set. No provider is configured by default. Local model responses are from the server-host model, not an installed student-device model.
- The device Online/Offline indicator can be online while the API is down. In that case sync reports failure and keeps its local queue.
- Profile picture upload requires server connectivity. Downloads stay on their originating device and are not synchronized.
- Profile edits that conflict with a newer server profile remain queued with an error for student review; resource progress/bookmarks keep newer server state and report the conflict.
- The optional doubt-request queue is not an AI answer service or staff workflow UI. No automatic answer is generated.
- High-stakes/proctored assessment, server-hosted media, course enrollment, and production deployment/monitoring are not implemented.
