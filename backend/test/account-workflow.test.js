import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { apiRequest, createTestServer, registerStudent } from "../test-support/workflow-helpers.js";

let server;

beforeEach(async () => {
  server = await createTestServer();
});

afterEach(async () => {
  await server.close();
});

test("register, verify session, reject bad credentials, logout, and sign in again", async () => {
  const email = `account-${crypto.randomUUID()}@example.test`;
  const registration = await registerStudent(server, email);
  assert.equal(registration.response.status, 201);

  const firstSession = await apiRequest(server, "/api/auth/me", { cookie: registration.cookie });
  assert.equal(firstSession.status, 200);
  assert.equal((await firstSession.json()).student.email, email);

  const invalidLogin = await apiRequest(server, "/api/auth/login", {
    method: "POST",
    body: { email, password: "wrong-password" },
  });
  assert.equal(invalidLogin.status, 401);

  const logout = await apiRequest(server, "/api/auth/logout", { method: "POST", cookie: registration.cookie });
  assert.equal(logout.status, 204);
  assert.equal((await apiRequest(server, "/api/auth/me", { cookie: registration.cookie })).status, 401);

  const login = await apiRequest(server, "/api/auth/login", {
    method: "POST",
    body: { email, password: "Asecure-pass-123" },
  });
  assert.equal(login.status, 200);
  const loginCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const restoredSession = await apiRequest(server, "/api/auth/me", { cookie: loginCookie });
  assert.equal(restoredSession.status, 200);
  assert.equal((await restoredSession.json()).student.id, registration.student.id);
});
