# EduSphere competition guide

**Slogan:** “Learning should not stop just because the internet stops.”

## Abstract

EduSphere is a student-focused, offline-first learning platform prototype designed for learners whose internet access is intermittent. Its React web application connects to an Express API backed by SQLite. Students can browse attributed resource links and six original courses containing 18 written lessons, practise skills, complete rule-adjusted assessments, save learning activity locally, and synchronize supported changes when the server is reachable. Previously opened course lessons are cached in IndexedDB for offline access. A service worker caches the production application shell and route assets, while IndexedDB stores device-specific learning data and permitted files. The AI Doubt Solver can use a server-hosted local Ollama model or a configured online chat-completions provider; no AI provider is enabled by default. EduSphere demonstrates an architecture for continued learning during connectivity interruptions while clearly distinguishing original demo content, source links, offline copies, and server-confirmed synchronization.

## Problem and proposed solution

Students with unreliable or expensive internet connections can lose access to learning materials and interrupt their study progress. EduSphere combines a responsive learning interface, local browser storage, permission-aware resource downloads, and a central account/sync API. It allows previously cached app code and saved learning items to remain available offline, then sends supported queued activity only after connectivity returns and the server acknowledges it.

### Objectives

- Make offline access a core design constraint rather than an afterthought.
- Keep original educational materials linked to their providers unless redistribution permission is confirmed.
- Preserve learning progress, bookmarks, and supported queued activity on the student’s device.
- Keep authentication, authorization, grading, and administrative validation on the backend.
- Identify AI provider mode and connectivity honestly instead of fabricating an answer.

## Existing-system limitations and advantages

EduSphere is a local/demo prototype, not a deployed education service. It has six original starter courses with 18 English-language lessons across five subjects, plus demo assessment/skill content. Authorized admins can edit course text, questions, publication status, and attribution, but the admin editor does not handle course video or file attachments. The trusted-source directory contains provider/course/book links, not a verified catalog of individual downloadable textbooks. Admins may upload permission-approved resource PDFs; third-party items are not scraped or mirrored. AI is unavailable until an operator configures Ollama plus a model or an online endpoint/model/key. Device-local files do not synchronize to other devices. Offline access requires one successful online load and previously saved lesson data; cold offline service-worker navigation still needs a production-build check.

Within those boundaries, the prototype provides one place to explore, practise, track locally saved activity, and synchronize supported progress through an authenticated API. It avoids treating internet availability as proof that the API is healthy and avoids removing queued operations before server acknowledgement.

## Architecture and technology

```text
Student browser
  React 18 + TypeScript + Vite + React Router
  Service worker (production shell and built-route asset cache)
  IndexedDB (offline resources, course bundles, bookmarks, learning progress, sync outbox)
             │ same-origin /api requests through development proxy or deployment reverse proxy
             ▼
  Express 4 API on Node.js 22.5+
  Authentication/session cookies, authorization, validation, rate limits
  AI adapters (optional server-hosted Ollama or online chat-completions API)
             │
             ▼
  SQLite (accounts, sessions, resources/files, courses/lessons, bookmarks/progress,
          assessment attempts, skill activity, sync and doubt-request records)
```

The browser is the student-facing client. The Express service owns central account and learning records. SQLite is the configured central database for the current single-instance prototype. The browser stores permitted files and supported offline activity in IndexedDB. Synchronization submits queued operations and removes them from the local queue after acknowledgement. Assessment results are graded and stored by the server.

### Technology stack actually present

- Frontend: React 18, TypeScript, Vite, React Router, Lucide icons, CSS, IndexedDB, Service Worker API.
- Backend: Node.js, Express, SQLite via Node’s `node:sqlite`, bcryptjs, express-rate-limit, Nodemailer, Sharp.
- Testing: Node built-in test runner and isolated in-memory SQLite API tests; manual Playwright browser checks.
- AI: server-side adapters for Ollama and an online chat-completions endpoint; neither is configured by default.

## Module summary

- **Resource Library:** search and filters, source/licence information, bookmarks, recent activity, offline list, sample previews, original-source links, and admin metadata/PDF management.
- **Internal courses:** six original courses and 18 English written lessons with objectives, explanations, examples, summaries, and practice questions. Course progress/bookmarks are scoped to students and synchronized idempotently; previously opened lessons can be read offline.
- **Offline learning:** production PWA shell/asset caching plus IndexedDB learning data and permitted file copies. First installation and new downloads need connectivity.
- **AI Doubt Solver:** actual configured providers only; mode and provider errors are reported. This project has no default live provider.
- **Skill Development:** demo learning activities and exercises with local progress and supported synchronization.
- **Adaptive Assessments:** demo quizzes grade submitted answers; rule-based difficulty recommendations use recorded performance, not AI.
- **Accounts and profile:** server-side password hashing, cookie sessions, protected pages/API, profile editing, and admin allowlist/bootstrap controls.
- **Central synchronization:** authenticated API operations, retry-safe identifiers, conflict handling, and local queue preservation until acknowledgement.
- **Admin:** server-enforced allowlist authorization, resource management, original course/lesson text authoring, soft-unpublish that preserves progress, and database-derived activity overview. Course media attachments are not available.

## Testing results and method

The latest backend run passed **25/25 tests** with exit code 0. Frontend production build and typecheck both completed successfully. Browser checks exercised course search/subject filtering, an original lesson and its practice questions, completion persistence after refresh, cached lesson navigation while network-offline was simulated, and no horizontal overflow at the tested course-reader mobile viewport.

The full test table and boundaries are in [the verification report](./testing-report.md). A cold production offline reload, PDF upload/download/open, live AI, multi-device synchronization, and production deployment still require fresh end-to-end verification. Do not present them as successfully demonstrated until checked in the configured environment.

## Deployment and configuration

The application has not been deployed. A deployment needs a persistent Node.js 22.5+ API host, durable SQLite storage, HTTPS, a static frontend host, and a same-origin reverse proxy forwarding `/api` to Express. Set `NODE_ENV=production`, `PORT`, `FRONTEND_ORIGIN`, and `AUTH_DB_PATH` in the hosting environment. Admin bootstrap, SMTP, and AI settings are optional server-side configuration. Back up the SQLite database and monitor space used by uploaded PDF blobs.

Follow the setup and environment-variable reference in the project [README](../README.md). Never include real credentials in slides, source files, screenshots, or frontend build variables.

## 10-slide presentation outline

1. **Title:** EduSphere — Bridging the Digital Learning Gap; project slogan and team.
2. **Problem:** intermittent connectivity interrupts access to learning materials and progress.
3. **Objectives:** offline-first access, trusted links, student progress, safe synchronization.
4. **Proposed solution:** overview of the five learning modules and the central service.
5. **Architecture:** browser, service worker/IndexedDB, Express API, SQLite, optional AI providers.
6. **Resource Library:** filters, provider attribution, permission-gated PDF uploads and offline list.
7. **Offline learning:** cached application assets, saved resources, local progress and sync outbox.
8. **AI and assessments:** optional server-side AI providers; real grading and rule-based recommendations.
9. **Testing and security:** 25 backend tests, original course lesson flow, offline cached lesson check, build/typecheck, and explicit limits.
10. **Impact and future scope:** intended access benefit; deployment, curated content, live providers, and expanded testing still needed.

## Three-minute explanation script

“Hello, our project is EduSphere — Bridging the Digital Learning Gap. Our slogan is, ‘Learning should not stop just because the internet stops.’

Many students rely on internet connections that are limited, slow, or unavailable at times. EduSphere is a learning-platform prototype designed around that constraint. It brings a resource library, skill activities, assessments, and an AI Doubt Solver into a single student experience.

The frontend is built with React and TypeScript. It uses a service worker to cache the production app shell and built page assets, and IndexedDB to keep supported learning data and permitted resource files on the student’s device. The backend is an Express API running on Node.js, and SQLite stores central accounts and learning records.

The resource library links to educational providers such as NCERT, DIKSHA, SWAYAM, NPTEL, NDLI, and OpenStax. We do not assume that free access gives redistribution rights. Only PDFs that an administrator is authorized to store can be uploaded and downloaded into offline storage; other materials link back to their original source.

Students can record supported learning activity offline. When the connection returns, EduSphere sends queued changes to the central server and keeps them locally until the server confirms the operation. The AI service is optional: the backend can call a configured local Ollama model or an online provider, but no provider is configured by default, so we never present a fabricated response as real AI.

We have automated backend tests for authentication, resources, assessments, and synchronization, and have built and typechecked the frontend. The remaining work is to test full offline navigation and PDF access in a fresh production browser, configure a live AI provider if needed, and validate the application on its intended deployment. EduSphere is a working prototype with clear limitations, not yet a production education service. Thank you.”

## Live demonstration flow

Use a disposable local database and synthetic student accounts. Before the event, verify the server, network, PWA cache, resource file, and any optional AI provider. Never use a real student account.

1. Open the landing page and introduce the connectivity problem and slogan.
2. Register a competition test account or sign in using credentials kept private.
3. Show the student dashboard, its demo-data labels, progress, and device connection indicator.
4. Open Resource Library; search and filter a subject. Show the source and licence fields.
5. Open a provider link to demonstrate attribution, or use a permitted PDF prepared by an authorized admin. Do not use a third-party PDF unless redistribution permission is confirmed.
6. Open Skills and complete a demo activity. In Assessments, answer a demo quiz and show its score/explanation.
7. In Doubt Solver, show the configured AI status. Ask one question only if an actual provider is configured; otherwise demonstrate and describe the explicit unavailable-provider state.
8. If step 5 created an authorized offline file, visit My Offline Resources and open it before disconnecting.
9. With the production PWA already installed and the app opened online, disconnect the network. Reload/navigate only to cached routes, open the saved file, and record progress if the offline route and account are available.
10. Reconnect and use Sync Now. Show success only after the server acknowledgement, then refresh server-backed activity.

If offline route chunks or the file were not verified before the event, skip steps 8–10 and explain the limitation rather than staging a false success.

## Judges' viva: 30 questions and concise answers

1. **Why did you build EduSphere?** To explore how students can continue using saved learning materials and recording supported activity when connectivity is unreliable.
2. **What problem does it address?** Internet interruptions can make online-only learning materials and progress unavailable.
3. **Who is it for?** Students who need access to previously cached content during intermittent connections.
4. **What is the proposed solution?** A responsive web learning prototype with offline browser storage and a central API for account and sync operations.
5. **What are its main modules?** Resource Library, Offline Learning, AI Doubt Solver, Skill Development, and Adaptive Assessments.
6. **What is the frontend built with?** React 18, TypeScript, Vite, React Router, CSS, and Lucide icons.
7. **What is the backend built with?** Node.js and Express.
8. **Which database does it use?** SQLite through Node’s `node:sqlite` module.
9. **What is an API?** A defined interface through which the browser sends requests to backend services.
10. **How does authentication work?** The backend verifies credentials, hashes passwords with bcryptjs, and issues an HTTP-only session cookie.
11. **How are admin operations protected?** The backend checks persisted admin role plus a server-side allowlist; setup needs a private bootstrap token.
12. **Where are secrets stored?** Optional AI, SMTP, and admin secrets are server-side environment variables, not frontend code.
13. **What does the service worker do?** In production, it caches the app shell and generated asset list so previously loaded app pages can be served offline.
14. **What is IndexedDB used for?** It stores device-local learning state and permitted offline files; it is not the central account database.
15. **Can every provider resource be downloaded?** No. External provider entries link to the original source; offline files are limited to permitted content or sample material.
16. **How does synchronization avoid losing pending changes?** The client retains queued work until the server responds with acknowledgement.
17. **How are duplicate sync actions handled?** Stable operation identifiers and server-side idempotency protect supported retry paths.
18. **How are conflicts handled?** Resource progress follows a latest-update policy; profile conflicts remain pending for review rather than silently overwriting newer information.
19. **Does EduSphere AI work by default?** No. Operators must configure an Ollama model reachable from the API host or an online provider.
20. **Is the local model installed on every student device?** No. The current local AI adapter calls a model on the API host; it is not device-local inference.
21. **What happens when AI is unavailable?** The API reports provider errors; the application does not fabricate an answer.
22. **Are assessments generated by AI?** No. The existing question catalog is demo content; grading is server-side and adaptation is rule-based.
23. **How are resources attributed?** Library entries show source/provider, source URL, and license/permission information; item-level terms must still be checked.
24. **What protects student records?** Authenticated routes scope private records to the signed-in student, with validation and admin checks on the server.
25. **How did you test it?** Node’s built-in test runner against an in-memory SQLite database, TypeScript/build checks, and manual browser checks.
26. **What were the automated test results?** The latest run passed 25 backend tests with exit code 0; the report lists the exact coverage limits.
27. **How many internal courses are ready?** Six original English starter courses with 18 written lessons across Mathematics, Physics, Chemistry, Biology, and Computer Science; they are demonstration material, not complete syllabi.
28. **Can lessons be studied offline?** A course bundle is saved to IndexedDB after it is opened while connected; the browser smoke test opened a saved lesson while network-offline was simulated. A cold offline reload from a fresh production install remains unverified.
29. **Has offline behavior been fully proven?** Not yet. The production shell/cache requires a fresh offline reload test, and PDF offline access needs a permitted file and test account.
30. **Has this been deployed?** No. Deployment steps are prepared, but no hosting, public API, or production database is configured.
29. **What is the biggest current limitation?** The application remains a prototype with demo lesson content, optional unconfigured AI, and incomplete full offline/deployment verification.
30. **What would you do next?** Verify offline navigation and permitted PDFs in a fresh browser, configure and test providers, curate licensed content, then deploy with persistent storage, HTTPS, backups, and monitoring.

## Conclusion

EduSphere demonstrates a practical offline-first architecture and an honest way to handle resource permissions, optional AI, and retryable synchronization. It is suitable for a prototype demonstration after the exact demo flow is tested in the event environment. It should not be described as fully deployed or production-ready until the remaining offline, provider, data durability, and deployment checks are complete.
