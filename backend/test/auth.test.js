import assert from "node:assert/strict";
import { once } from "node:events";
import { afterEach, beforeEach, test } from "node:test";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/database.js";
import { demoResources, trustedSourceResources } from "../src/resource-data.js";

const sampleStudent = {
  name: "Riya Student",
  email: "riya@example.com",
  password: "Asecure-pass-123",
};

let database;
let server;
let baseUrl;
let sendPasswordReset;
let sentResetToken;

beforeEach(async () => {
  database = createDatabase(":memory:");
  sendPasswordReset = async ({ token }) => {
    sentResetToken = token;
  };
  sentResetToken = "";
  server = createApp({
    database,
    environment: {
      NODE_ENV: "test",
      FRONTEND_ORIGIN: "http://localhost:5180",
      ADMIN_EMAILS: "admin@example.com",
      ADMIN_BOOTSTRAP_TOKEN: "test-bootstrap-token-with-at-least-32-characters",
    },
    sendPasswordReset,
    secureCookies: false,
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  database.close();
});

test("registration validates fields, hashes passwords, and creates a secure session cookie", async () => {
  const invalid = await post("/api/auth/register", { name: "A", email: "bad", password: "short" });
  assert.equal(invalid.status, 400);
  assert.deepEqual(Object.keys((await invalid.json()).fieldErrors).sort(), ["email", "name", "password"]);

  const response = await post("/api/auth/register", sampleStudent);
  assert.equal(response.status, 201);
  const { student } = await response.json();
  assert.equal(student.name, sampleStudent.name);
  assert.equal(student.email, sampleStudent.email);
  assert.equal("password" in student, false);
  assert.equal("password_hash" in student, false);

  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\/api/i);
  const storedPasswordHash = database.prepare("SELECT password_hash FROM students WHERE email = ?").get(sampleStudent.email).password_hash;
  assert.match(storedPasswordHash, /^\$2[aby]\$12\$/);
  assert.notEqual(storedPasswordHash, sampleStudent.password);

  const duplicate = await post("/api/auth/register", { ...sampleStudent, name: "Another Student" });
  assert.equal(duplicate.status, 409);

  const secureApp = createApp({ database, secureCookies: true });
  const secureServer = secureApp.listen(0, "127.0.0.1");
  await once(secureServer, "listening");
  try {
    const secureResponse = await fetch(`http://127.0.0.1:${secureServer.address().port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sampleStudent, email: "secure-cookie@example.com" }),
    });
    assert.equal(secureResponse.status, 201);
    assert.match(secureResponse.headers.get("set-cookie"), /Secure/i);
    assert.match(secureResponse.headers.get("set-cookie"), /HttpOnly/i);
    assert.match(secureResponse.headers.get("set-cookie"), /SameSite=Strict/i);
  } finally {
    secureServer.closeAllConnections();
    await new Promise((resolve, reject) => {
      secureServer.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("admin access requires an allowlisted account and the server bootstrap token", async () => {
  const registration = await post("/api/auth/register", {
    name: "Admin Candidate",
    email: "admin@example.com",
    password: "Asecure-pass-123",
  });
  assert.equal(registration.status, 201);
  const { student } = await registration.json();
  assert.equal(student.role, "student");
  const cookie = sessionCookie(registration);

  const blockedWithoutToken = await fetch(`${baseUrl}/api/admin/bootstrap`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ token: "wrong-token" }),
  });
  assert.equal(blockedWithoutToken.status, 403);
  assert.equal(database.prepare("SELECT role FROM students WHERE email = ?").get("admin@example.com").role, "student");
  assert.equal((await fetch(`${baseUrl}/api/admin/overview`, { headers: { Cookie: cookie } })).status, 403);

  const ordinaryRegistration = await post("/api/auth/register", sampleStudent);
  const ordinaryCookie = sessionCookie(ordinaryRegistration);
  const blockedNonAllowlisted = await fetch(`${baseUrl}/api/admin/bootstrap`, {
    method: "POST",
    headers: { Cookie: ordinaryCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ token: "test-bootstrap-token-with-at-least-32-characters" }),
  });
  assert.equal(blockedNonAllowlisted.status, 403);

  const bootstrap = await fetch(`${baseUrl}/api/admin/bootstrap`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ token: "test-bootstrap-token-with-at-least-32-characters" }),
  });
  assert.equal(bootstrap.status, 200);
  assert.equal((await bootstrap.json()).student.role, "admin");
  assert.equal((await fetch(`${baseUrl}/api/admin/overview`, { headers: { Cookie: cookie } })).status, 200);

  createApp({
    database,
    environment: {
      NODE_ENV: "test",
      FRONTEND_ORIGIN: "http://localhost:5180",
      ADMIN_EMAILS: "admin@example.com",
      ADMIN_BOOTSTRAP_TOKEN: "test-bootstrap-token-with-at-least-32-characters",
    },
    sendPasswordReset,
    secureCookies: false,
  });
  assert.equal(database.prepare("SELECT role FROM students WHERE email = ?").get("admin@example.com").role, "admin");
});

test("login rejects invalid credentials and returns the signed-in student", async () => {
  await post("/api/auth/register", sampleStudent);
  const invalid = await post("/api/auth/login", { email: sampleStudent.email, password: "incorrect password" });
  assert.equal(invalid.status, 401);
  assert.equal((await invalid.json()).error, "Email or password is incorrect.");

  const response = await post("/api/auth/login", { email: "  RIYA@example.com ", password: sampleStudent.password });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).student.name, sampleStudent.name);
});

test("student routes reject requests without a session and logout revokes the session", async () => {
  const unauthenticated = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(unauthenticated.status, 401);
  const privateProfile = await fetch(`${baseUrl}/api/profile`, { method: "PUT", ...json({}) });
  assert.equal(privateProfile.status, 401);

  const registration = await post("/api/auth/register", sampleStudent);
  const cookie = sessionCookie(registration);
  const currentStudent = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(currentStudent.status, 200);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/i);
  const revokedSession = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(revokedSession.status, 401);
});

test("expired sessions are rejected and removed", async () => {
  const registration = await post("/api/auth/register", sampleStudent);
  const { student } = await registration.json();
  const cookie = sessionCookie(registration);
  database.prepare("UPDATE sessions SET expires_at = ? WHERE student_id = ?")
    .run(Date.now() - 1, student.id);

  const response = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 401);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE student_id = ?").get(student.id).count, 0);
});

test("students can update their profile and invalid profile changes are rejected", async () => {
  const registration = await post("/api/auth/register", sampleStudent);
  const cookie = sessionCookie(registration);
  const update = {
    name: "Riya Learner",
    college: "Example College",
    course: "BSc",
    branch: "Computer Science",
    yearOfStudy: "2",
    interests: ["technology", "creative-thinking"],
  };
  const response = await fetch(`${baseUrl}/api/profile`, {
    method: "PUT",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  assert.equal(response.status, 200);
  const { student } = await response.json();
  assert.equal(student.name, update.name);
  assert.equal(student.college, update.college);
  assert.deepEqual(student.interests, update.interests);

  const invalid = await fetch(`${baseUrl}/api/profile`, {
    method: "PUT",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ ...update, yearOfStudy: "invalid" }),
  });
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.json()).fieldErrors.yearOfStudy);
});

test("profile photos are validated, resized, and removable", async () => {
  const registration = await post("/api/auth/register", sampleStudent);
  const cookie = sessionCookie(registration);
  const image = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#7356d9" },
  }).png().toBuffer();

  const uploaded = await fetch(`${baseUrl}/api/profile/avatar`, {
    method: "PUT",
    headers: { Cookie: cookie, "Content-Type": "image/png" },
    body: image,
  });
  assert.equal(uploaded.status, 200);
  const { student } = await uploaded.json();
  assert.match(student.avatarUrl, /^data:image\/webp;base64,/);

  const invalid = await fetch(`${baseUrl}/api/profile/avatar`, {
    method: "PUT",
    headers: { Cookie: cookie, "Content-Type": "image/png" },
    body: Buffer.from("not an image"),
  });
  assert.equal(invalid.status, 400);

  const removed = await fetch(`${baseUrl}/api/profile/avatar`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal((await removed.json()).student.avatarUrl, null);
});

test("password reset is one-time, updates the password, and revokes existing sessions", async () => {
  const registration = await post("/api/auth/register", sampleStudent);
  const oldCookie = sessionCookie(registration);
  const request = await post("/api/auth/forgot-password", { email: sampleStudent.email });
  assert.equal(request.status, 200);
  assert.ok(sentResetToken);

  const newPassword = "Another-secure-456";
  const reset = await post("/api/auth/reset-password", { token: sentResetToken, password: newPassword });
  assert.equal(reset.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: oldCookie } })).status, 401);
  assert.equal((await post("/api/auth/reset-password", { token: sentResetToken, password: newPassword })).status, 400);
  assert.equal((await post("/api/auth/login", { email: sampleStudent.email, password: sampleStudent.password })).status, 401);
  assert.equal((await post("/api/auth/login", { email: sampleStudent.email, password: newPassword })).status, 200);
});

test("concurrent password reset requests can consume a token only once", async () => {
  const registration = await post("/api/auth/register", sampleStudent);
  const request = await post("/api/auth/forgot-password", { email: sampleStudent.email });
  assert.equal(request.status, 200);
  assert.ok(sentResetToken);

  const responses = await Promise.all([
    post("/api/auth/reset-password", { token: sentResetToken, password: "Concurrent-reset-one-123" }),
    post("/api/auth/reset-password", { token: sentResetToken, password: "Concurrent-reset-two-123" }),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);

  const loginResponses = await Promise.all([
    post("/api/auth/login", { email: sampleStudent.email, password: "Concurrent-reset-one-123" }),
    post("/api/auth/login", { email: sampleStudent.email, password: "Concurrent-reset-two-123" }),
  ]);
  assert.deepEqual(loginResponses.map((response) => response.status).sort(), [200, 401]);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: sessionCookie(registration) },
  })).status, 401);
});

test("password reset reports when the email service is not configured", async () => {
  const app = createApp({ database, sendPasswordReset: null, secureCookies: false });
  const additionalServer = app.listen(0, "127.0.0.1");
  await once(additionalServer, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${additionalServer.address().port}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: sampleStudent.email }),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /not configured/);
  } finally {
    await new Promise((resolve, reject) => {
      additionalServer.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("resource library supports subject, type, text search, and sort filters", async () => {
  const registration = await post("/api/auth/register", sampleStudent);
  const cookie = sessionCookie(registration);
  const search = await fetch(`${baseUrl}/api/resources?q=percent&subject=Mathematics&type=practice`, { headers: { Cookie: cookie } });
  assert.equal(search.status, 200);
  const { resources } = await search.json();
  assert.equal(resources.length, 1);
  assert.equal(resources[0].title, "Understanding percentages");
  assert.equal(resources[0].isDemo, true);

  const sorted = await fetch(`${baseUrl}/api/resources?subject=Mathematics&sort=time`, { headers: { Cookie: cookie } });
  const sortedResources = (await sorted.json()).resources;
  assert.deepEqual(sortedResources.map((resource) => resource.estimatedMinutes), [12, 18]);
  assert.equal((await fetch(`${baseUrl}/api/resources?type=unknown`, { headers: { Cookie: cookie } })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/resources?level=Expert`, { headers: { Cookie: cookie } })).status, 400);

  const sourceResults = await fetch(`${baseUrl}/api/resources?type=link`, { headers: { Cookie: cookie } });
  const sourceList = (await sourceResults.json()).resources;
  assert.equal(sourceList.length, trustedSourceResources.length);
  assert.ok(sourceList.every((resource) => resource.sourceUrl.startsWith("https://") && !resource.downloadAllowed));
  assert.ok(sourceList.every((resource) => resource.classLevel));
  assert.ok(sourceList.some((resource) => resource.sourceName === "NCERT · ePathshala"));
  assert.equal(sourceList.find((resource) => resource.id === "source-openstax").sourceName, "OpenStax · Rice University");
  const courseLevel = await fetch(`${baseUrl}/api/resources?classLevel=Higher%20education`, { headers: { Cookie: cookie } });
  assert.ok((await courseLevel.json()).resources.every((resource) => resource.classLevel === "Higher education"));
  const filtered = await fetch(`${baseUrl}/api/resources?language=English&level=Beginner`, { headers: { Cookie: cookie } });
  assert.ok((await filtered.json()).resources.length > 0);
  const options = await fetch(`${baseUrl}/api/resources/options`, { headers: { Cookie: cookie } });
  const resourceOptions = await options.json();
  assert.ok(resourceOptions.subjects.includes("Digital Skills"));
  assert.ok(resourceOptions.classLevels.includes("Grades 1–12"));
});

test("bookmarks and recently opened learning progress remain scoped to the signed-in student", async () => {
  const firstStudent = await post("/api/auth/register", sampleStudent);
  const firstCookie = sessionCookie(firstStudent);
  const resourceId = "demo-001";
  assert.equal((await fetch(`${baseUrl}/api/resources/${resourceId}`, { headers: { Cookie: firstCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/resources/${resourceId}/bookmark`, { method: "POST", headers: { Cookie: firstCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/resources/${resourceId}/progress`, {
    method: "POST",
    headers: { Cookie: firstCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ lastPositionSeconds: 120, completed: false }),
  })).status, 200);

  const firstActivity = await fetch(`${baseUrl}/api/resources/activity`, { headers: { Cookie: firstCookie } });
  const firstSnapshot = await firstActivity.json();
  assert.equal(firstSnapshot.saved[0].id, resourceId);
  assert.equal(firstSnapshot.recent[0].lastPositionSeconds, 120);
  assert.equal(firstSnapshot.continueLearning[0].id, resourceId);

  const secondStudent = await post("/api/auth/register", { name: "Other Student", email: "other@example.com", password: sampleStudent.password });
  const secondCookie = sessionCookie(secondStudent);
  const secondActivity = await fetch(`${baseUrl}/api/resources/activity`, { headers: { Cookie: secondCookie } });
  assert.deepEqual(await secondActivity.json(), { saved: [], recent: [], continueLearning: [] });
});

test("resource management requires an allowlisted admin and validates CRUD input", async () => {
  const student = await post("/api/auth/register", sampleStudent);
  const studentCookie = sessionCookie(student);
  assert.equal((await fetch(`${baseUrl}/api/admin/resources`, { headers: { Cookie: studentCookie } })).status, 403);

  const admin = await post("/api/auth/register", {
    name: "Resource Admin",
    email: "ADMIN@example.com",
    password: sampleStudent.password,
  });
  const adminCookie = sessionCookie(admin);
  assert.equal((await admin.json()).student.role, "student");
  const adminSetup = await fetch(`${baseUrl}/api/admin/bootstrap`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ token: "test-bootstrap-token-with-at-least-32-characters" }),
  });
  assert.equal((await adminSetup.json()).student.role, "admin");
  const created = await fetch(`${baseUrl}/api/admin/resources`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Sample biology resource",
      description: "An original demo resource for testing the admin workspace.",
      subject: "Science",
      level: "Beginner",
      type: "notes",
      estimatedMinutes: 9,
      preview: "Cells are the basic units of living organisms.",
      language: "English",
      sourceName: "EduSphere",
      sourceUrl: "",
      licenseInfo: "Original EduSphere text.",
    }),
  });
  assert.equal(created.status, 201);
  const resource = (await created.json()).resource;
  assert.equal(resource.isDemo, false);
  assert.equal(resource.downloadAllowed, false);

  const uploadPath = `${baseUrl}/api/admin/resources/${resource.id}/file`;
  const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
  assert.equal((await fetch(uploadPath, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf", "X-Resource-Permission-Confirmed": "true" },
    body: pdfBytes,
  })).status, 401);
  assert.equal((await fetch(uploadPath, {
    method: "PUT",
    headers: { Cookie: studentCookie, "Content-Type": "application/pdf", "X-Resource-Permission-Confirmed": "true" },
    body: pdfBytes,
  })).status, 403);
  assert.equal((await fetch(uploadPath, {
    method: "PUT",
    headers: { Cookie: adminCookie, "Content-Type": "application/pdf" },
    body: pdfBytes,
  })).status, 400);
  assert.equal((await fetch(uploadPath, {
    method: "PUT",
    headers: { Cookie: adminCookie, "Content-Type": "application/pdf", "X-Resource-Permission-Confirmed": "true" },
    body: Buffer.from("Not a PDF."),
  })).status, 415);

  const uploaded = await fetch(uploadPath, {
    method: "PUT",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/pdf",
      "X-Resource-Permission-Confirmed": "true",
      "X-Resource-File-Name": encodeURIComponent("sample.pdf"),
    },
    body: pdfBytes,
  });
  assert.equal(uploaded.status, 200);
  assert.equal((await uploaded.json()).resource.downloadAllowed, true);
  const downloaded = await fetch(`${baseUrl}/api/resources/${resource.id}/file`, { headers: { Cookie: studentCookie } });
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get("content-type"), "application/pdf");
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdfBytes);
  assert.equal((await fetch(`${baseUrl}/api/admin/resources/${resource.id}/file`, {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  })).status, 204);
  const afterFileRemoval = await fetch(`${baseUrl}/api/resources/${resource.id}`, { headers: { Cookie: studentCookie } });
  assert.equal((await afterFileRemoval.json()).resource.downloadAllowed, false);

  const untrustedLink = await fetch(`${baseUrl}/api/admin/resources`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Unknown external source",
      description: "An external resource link with an untrusted domain.",
      subject: "Science",
      level: "Beginner",
      type: "link",
      estimatedMinutes: 9,
      preview: "This link should be rejected by the source allowlist.",
      language: "English",
      sourceName: "Unknown",
      sourceUrl: "https://example.com/resource",
      licenseInfo: "Unknown terms.",
    }),
  });
  assert.equal(untrustedLink.status, 400);
  const trustedLink = await fetch(`${baseUrl}/api/admin/resources`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "OpenStax mathematics books",
      description: "An official source link to OpenStax subject collections.",
      subject: "Mathematics",
      level: "Beginner",
      type: "link",
      estimatedMinutes: 9,
      preview: "Open the publisher page and check the license for each textbook.",
      language: "English",
      sourceName: "OpenStax",
      sourceUrl: "https://openstax.org/subjects",
      licenseInfo: "Review the specific book license and attribution terms.",
    }),
  });
  assert.equal(trustedLink.status, 201);
  const linkedResource = (await trustedLink.json()).resource;
  assert.equal(linkedResource.sourceUrl, "https://openstax.org/subjects");
  assert.equal(linkedResource.downloadAllowed, false);

  const rejectedUrl = await fetch(`${baseUrl}/api/admin/resources`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Link resource",
      description: "This link resource should not be accepted.",
      subject: "Science",
      level: "Beginner",
      type: "notes",
      estimatedMinutes: 9,
      preview: "A sample preview paragraph.",
      externalUrl: "https://example.com",
    }),
  });
  assert.equal(rejectedUrl.status, 400);

  const update = await fetch(`${baseUrl}/api/admin/resources/${resource.id}`, {
    method: "PUT",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ ...resource, title: "Updated biology resource" }),
  });
  assert.equal((await update.json()).resource.title, "Updated biology resource");
  assert.equal((await fetch(`${baseUrl}/api/admin/resources/${resource.id}`, { method: "DELETE", headers: { Cookie: adminCookie } })).status, 204);
  assert.equal((await fetch(`${baseUrl}/api/admin/resources/demo-001`, { method: "DELETE", headers: { Cookie: adminCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/resources/source-openstax`, { method: "DELETE", headers: { Cookie: adminCookie } })).status, 403);
});

test("AI routes reject unauthenticated, malformed, and unconfigured-provider requests", async () => {
  const anonymous = await post("/api/ai/local", { question: "Why is the sky blue?" });
  assert.equal(anonymous.status, 401);
  const student = await post("/api/auth/register", sampleStudent);
  const cookie = sessionCookie(student);

  const invalid = await fetch(`${baseUrl}/api/ai/local`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ question: " " }),
  });
  assert.equal(invalid.status, 400);

  const unavailable = await fetch(`${baseUrl}/api/ai/online`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Explain gravity.", subject: "Science" }),
  });
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.json()).error, /not configured/);
});

test("local and online AI return real provider responses and report actual service errors", async () => {
  const aiEnvironment = {
    NODE_ENV: "test",
    FRONTEND_ORIGIN: "http://localhost:5180",
    LOCAL_AI_BASE_URL: "http://127.0.0.1:11434",
    LOCAL_AI_MODEL: "test-model",
    ONLINE_AI_CHAT_COMPLETIONS_URL: "https://ai.example.invalid/v1/chat/completions",
    ONLINE_AI_MODEL: "test-online-model",
    ONLINE_AI_API_KEY: "test-secret-key",
  };
  const aiApp = createApp({
    database,
    environment: aiEnvironment,
    secureCookies: false,
    sendPasswordReset,
    fetchImpl: async (url, options = {}) => {
      if (url.endsWith("/api/tags")) {
        return Response.json({ models: [{ name: "test-model:latest" }] });
      }
      if (url.endsWith("/api/chat")) {
        const requestBody = JSON.parse(options.body);
        assert.equal(requestBody.model, "test-model");
        assert.match(requestBody.messages[0].content, /step-by-step/);
        return Response.json({ message: { content: "1. Add the values.\n2. Check your result." } });
      }
      assert.equal(url, aiEnvironment.ONLINE_AI_CHAT_COMPLETIONS_URL);
      assert.equal(options.headers.Authorization, "Bearer test-secret-key");
      return Response.json({ choices: [{ message: { content: "Gravity pulls objects toward one another." } }] });
    },
  });
  const aiServer = aiApp.listen(0, "127.0.0.1");
  await once(aiServer, "listening");
  try {
    const aiBaseUrl = `http://127.0.0.1:${aiServer.address().port}`;
    const registration = await fetch(`${aiBaseUrl}/api/auth/register`, {
      method: "POST",
      ...json(sampleStudent),
    });
    const cookie = sessionCookie(registration);
    const status = await fetch(`${aiBaseUrl}/api/ai/status`, { headers: { Cookie: cookie } });
    assert.deepEqual(await status.json(), {
      local: { available: true, model: "test-model", runtime: "Ollama", location: "EduSphere server host" },
      online: { configured: true, model: "test-online-model" },
    });

    const local = await fetch(`${aiBaseUrl}/api/ai/local`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What is 2 + 2?",
        subject: "Mathematics",
        mode: "step-by-step",
        context: [{ role: "user", content: "I am learning addition." }],
      }),
    });
    assert.deepEqual(await local.json(), {
      answer: "1. Add the values.\n2. Check your result.",
      provider: "local",
      model: "test-model",
    });

    const online = await fetch(`${aiBaseUrl}/api/ai/online`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ question: "What is gravity?", subject: "Science", mode: "simple" }),
    });
    assert.deepEqual(await online.json(), {
      answer: "Gravity pulls objects toward one another.",
      provider: "online",
      model: "test-online-model",
    });
  } finally {
    aiServer.closeAllConnections();
    await new Promise((resolve, reject) => {
      aiServer.close((closeError) => closeError ? reject(closeError) : resolve());
    });
  }
});

test("local model failures are reported without a fabricated answer", async () => {
  const aiApp = createApp({
    database,
    environment: {
      NODE_ENV: "test",
      FRONTEND_ORIGIN: "http://localhost:5180",
      LOCAL_AI_BASE_URL: "http://127.0.0.1:11434",
    },
    secureCookies: false,
    sendPasswordReset,
    fetchImpl: async () => { throw new Error("Ollama is stopped"); },
  });
  const aiServer = aiApp.listen(0, "127.0.0.1");
  await once(aiServer, "listening");
  try {
    const base = `http://127.0.0.1:${aiServer.address().port}`;
    const registration = await fetch(`${base}/api/auth/register`, { method: "POST", ...json(sampleStudent) });
    const response = await fetch(`${base}/api/ai/local`, {
      method: "POST",
      headers: { Cookie: sessionCookie(registration), "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Explain photosynthesis.", subject: "Science" }),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /not reachable/);
  } finally {
    aiServer.closeAllConnections();
    await new Promise((resolve, reject) => {
      aiServer.close((closeError) => closeError ? reject(closeError) : resolve());
    });
  }
});

test("adaptive assessments grade submitted answers, persist history, and make retries idempotent", async () => {
  const registration = await post("/api/auth/register", sampleStudent);
  const cookie = sessionCookie(registration);
  const headers = { Cookie: cookie };

  const unauthenticated = await fetch(`${baseUrl}/api/assessments`);
  assert.equal(unauthenticated.status, 401);

  const listingResponse = await fetch(`${baseUrl}/api/assessments`, { headers });
  assert.equal(listingResponse.status, 200);
  const listing = await listingResponse.json();
  assert.deepEqual(listing.categories, [
    "Mathematics", "Science", "Computer Science", "Programming",
    "English", "Digital Literacy", "General Knowledge", "Skill Development",
  ]);
  assert.equal(listing.assessments.length, 8);

  const detailsResponse = await fetch(`${baseUrl}/api/assessments/programming-logic-check`, { headers });
  assert.equal(detailsResponse.status, 200);
  const { assessment } = await detailsResponse.json();
  assert.deepEqual(new Set(assessment.questions.map((question) => question.type)), new Set([
    "multiple-choice", "true-false", "fill-blank", "programming",
  ]));
  assert.equal(assessment.isDemo, true);

  const attempt = {
    attemptId: "43cc39b4-e8da-4a56-a657-cb5e5bb6e563",
    assessmentId: assessment.id,
    startedAt: "2026-10-30T08:00:00.000Z",
    submittedAt: "2026-10-30T08:05:00.000Z",
    answers: assessment.questions.map((question, index) => ({
      questionId: question.id,
      answer: index === 1 ? "false" : question.correctAnswer,
    })),
  };
  const submitted = await fetch(`${baseUrl}/api/assessment-attempts`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(attempt),
  });
  assert.equal(submitted.status, 201);
  const { attempt: result } = await submitted.json();
  assert.equal(result.score, assessment.questions.length - 1);
  assert.equal(result.total, assessment.questions.length);
  assert.equal(result.accuracy, 80);
  assert.ok(result.weakTopics.includes("data types"));
  assert.equal(result.questions.find((question) => question.questionId === "prog-2").correct, false);

  const duplicate = await fetch(`${baseUrl}/api/assessment-attempts`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...attempt,
      answers: attempt.answers.map((answer) => ({ ...answer, answer: "incorrect" })),
    }),
  });
  assert.equal(duplicate.status, 201);
  assert.equal((await duplicate.json()).attempt.score, result.score);

  const historyResponse = await fetch(`${baseUrl}/api/assessments`, { headers });
  const history = await historyResponse.json();
  assert.equal(history.history.length, 1);
  assert.equal(history.assessments.find((item) => item.id === assessment.id).previousAttempts, 1);

  const invalidAttempt = await fetch(`${baseUrl}/api/assessment-attempts`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ...attempt, attemptId: "d0b515bc-e7ad-4b89-8622-6afc049654ea", answers: [attempt.answers[0], attempt.answers[0]] }),
  });
  assert.equal(invalidAttempt.status, 400);

  const otherStudent = await post("/api/auth/register", {
    name: "Other Student",
    email: "other@example.com",
    password: sampleStudent.password,
  });
  const otherCookie = sessionCookie(otherStudent);
  const inaccessibleResult = await fetch(`${baseUrl}/api/assessment-attempts/${attempt.attemptId}`, {
    headers: { Cookie: otherCookie },
  });
  assert.equal(inaccessibleResult.status, 404);
});

test("offline sync authenticates, applies idempotent updates, preserves newer progress, and protects admin data", async () => {
  const unauthenticated = await fetch(`${baseUrl}/api/sync/batch`, {
    method: "POST",
    ...json({ operations: [] }),
  });
  assert.equal(unauthenticated.status, 401);

  const registration = await post("/api/auth/register", sampleStudent);
  const cookie = sessionCookie(registration);
  const { student } = await registration.clone().json();
  const occurredAt = new Date(Date.now() - 60_000).toISOString();
  const resourceId = "demo-001";
  await fetch(`${baseUrl}/api/resources/${resourceId}/progress`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ lastPositionSeconds: 120, completed: false }),
  });

  const operations = [
    {
      id: "c05b4f86-a5cf-42b4-9f4f-203c1fc81431",
      type: "resource.progress",
      occurredAt,
      payload: { resourceId, lastPositionSeconds: 60, completed: false },
    },
    {
      id: "0c6c6828-a411-4f23-a7ef-cd8dd859e7bc",
      type: "resource.bookmark",
      occurredAt,
      payload: { resourceId, bookmarked: true },
    },
    {
      id: "9f1e4319-e38e-462d-9032-c8bd3608902f",
      type: "skill.activity",
      occurredAt,
      payload: {
        actionId: "9f1e4319-e38e-462d-9032-c8bd3608902f",
        skillId: "python-programming",
        lessonId: "python-essentials",
        actionType: "lesson-completed",
      },
    },
    {
      id: "6f35d8bb-53d2-48e8-90ee-978dd462e2f2",
      type: "profile.update",
      occurredAt,
      payload: {
        baseUpdatedAt: student.updatedAt,
        profile: {
          name: "Riya Offline Learner",
          college: "Example College",
          course: "BSc",
          branch: "Computer Science",
          yearOfStudy: "2",
          interests: ["technology"],
        },
      },
    },
    {
      id: "8a724aaf-3521-4df9-aac6-dcb44bdaecf2",
      type: "ai.question",
      occurredAt,
      payload: {
        requestId: "8a724aaf-3521-4df9-aac6-dcb44bdaecf2",
        question: "Can you explain variables?",
        subject: "Programming",
        mode: "step-by-step",
      },
    },
  ];

  const withoutConsent = await fetch(`${baseUrl}/api/sync/batch`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  assert.equal(withoutConsent.status, 200);
  const denied = await withoutConsent.json();
  assert.equal(denied.results.filter((item) => item.status === "acknowledged").length, 4);
  assert.equal(denied.results.find((item) => item.operationId === operations[4].id).status, "failed");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM ai_doubt_requests").get().count, 0);

  const retry = await fetch(`${baseUrl}/api/sync/batch`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ operations, includePendingQuestions: true }),
  });
  assert.equal(retry.status, 200);
  const retried = await retry.json();
  assert.equal(retried.results.filter((item) => item.status === "acknowledged").length, 5);
  assert.equal(retried.results.find((item) => item.operationId === operations[0].id).duplicate, true);
  assert.equal(database.prepare("SELECT status FROM sync_operations WHERE operation_id = ?").get(operations[4].id).status, "acknowledged");

  const unsupportedOperation = await fetch(`${baseUrl}/api/sync/batch`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      operations: [{
        id: "706f61f3-e6ae-447e-b245-a9b2b735aa07",
        type: "unsupported.activity",
        occurredAt,
        payload: {},
      }],
    }),
  });
  assert.equal((await unsupportedOperation.json()).results[0].status, "failed");

  const unbookmark = {
    id: "5b2fb0fa-87b6-437a-8d61-13e374510a70",
    type: "resource.bookmark",
    occurredAt: new Date().toISOString(),
    payload: { resourceId, bookmarked: false },
  };
  const unbookmarkResponse = await fetch(`${baseUrl}/api/sync/batch`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ operations: [unbookmark] }),
  });
  assert.equal((await unbookmarkResponse.json()).results[0].status, "acknowledged");
  const staleBookmarkResponse = await fetch(`${baseUrl}/api/sync/batch`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      operations: [{
        id: "ac114523-35f3-4753-8db6-a84c9087dab0",
        type: "resource.bookmark",
        occurredAt,
        payload: { resourceId, bookmarked: true },
      }],
    }),
  });
  const staleBookmarkResult = (await staleBookmarkResponse.json()).results[0];
  assert.equal(staleBookmarkResult.status, "acknowledged");
  assert.equal(staleBookmarkResult.conflict, "server-newer");

  const changedPayloadRetry = await fetch(`${baseUrl}/api/sync/batch`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      operations: [{ ...operations[1], payload: { resourceId, bookmarked: false } }],
    }),
  });
  assert.equal((await changedPayloadRetry.json()).results[0].status, "failed");

  const activity = await fetch(`${baseUrl}/api/resources/activity`, { headers: { Cookie: cookie } });
  const savedActivity = await activity.json();
  assert.equal(savedActivity.saved.some((resource) => resource.id === resourceId), false);
  assert.equal(savedActivity.recent.find((resource) => resource.id === resourceId).bookmarked, false);
  assert.equal(savedActivity.recent.find((resource) => resource.id === resourceId).lastPositionSeconds, 120);

  const profile = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal((await profile.json()).student.name, "Riya Offline Learner");
  const skillSnapshot = await fetch(`${baseUrl}/api/sync/snapshot`, { headers: { Cookie: cookie } });
  assert.equal((await skillSnapshot.json()).skillActions.length, 1);
  const privateDoubtQueue = await fetch(`${baseUrl}/api/doubt-requests`, { headers: { Cookie: cookie } });
  const doubts = await privateDoubtQueue.json();
  assert.equal(doubts.requests.length, 1);
  assert.equal("question" in doubts.requests[0], false);

  const syncStatus = await fetch(`${baseUrl}/api/sync/status`, { headers: { Cookie: cookie } });
  const status = await syncStatus.json();
  assert.equal(status.lastSuccessfulSyncAt !== null, true);
  assert.equal(status.pendingDoubtRequests, 1);

  const regularStudentAdminView = await fetch(`${baseUrl}/api/admin/overview`, { headers: { Cookie: cookie } });
  assert.equal(regularStudentAdminView.status, 403);
  const adminRegistration = await post("/api/auth/register", {
    name: "EduSphere Admin",
    email: "admin@example.com",
    password: "Asecure-pass-123",
  });
  const adminCookie = sessionCookie(adminRegistration);
  const adminSetup = await fetch(`${baseUrl}/api/admin/bootstrap`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ token: "test-bootstrap-token-with-at-least-32-characters" }),
  });
  assert.equal(adminSetup.status, 200);
  const adminDashboard = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminDashboard.status, 200);
  const overview = await adminDashboard.json();
  assert.equal(overview.summary.students, 2);
  assert.equal(overview.summary.resources, demoResources.length + trustedSourceResources.length);
  assert.equal(overview.summary.skillActions, 1);
  assert.equal(overview.summary.queuedDoubtRequests, 1);
  assert.equal(overview.recentSync.some((entry) => entry.status === "failed"), true);
});

function json(body) {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function post(path, body) {
  return fetch(`${baseUrl}${path}`, { method: "POST", ...json(body) });
}

function sessionCookie(response) {
  const value = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(value);
  return value;
}
