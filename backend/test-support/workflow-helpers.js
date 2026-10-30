import { once } from "node:events";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/database.js";

export async function createTestServer({ environment = {} } = {}) {
  const database = createDatabase(":memory:");
  const server = createApp({
    database,
    environment: {
      NODE_ENV: "test",
      FRONTEND_ORIGIN: "http://localhost:5180",
      ...environment,
    },
    sendPasswordReset: null,
    secureCookies: false,
  }).listen(0, "127.0.0.1");
  await once(server, "listening");

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    database,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      database.close();
    },
  };
}

export async function apiRequest(server, path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  return fetch(`${server.baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function registerStudent(server, email) {
  const response = await apiRequest(server, "/api/auth/register", {
    method: "POST",
    body: { name: "Test Student", email, password: "Asecure-pass-123" },
  });
  const result = await response.json();
  return {
    response,
    student: result.student,
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}
