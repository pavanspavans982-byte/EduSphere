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

test("search, filter, bookmark, and persist resource progress for the signed-in student", async () => {
  assert.equal((await apiRequest(server, "/api/resources")).status, 401);
  const registration = await registerStudent(server, `resources-${crypto.randomUUID()}@example.test`);
  assert.equal(registration.response.status, 201);

  const filtered = await apiRequest(server, "/api/resources?q=percent&subject=Mathematics&type=practice", { cookie: registration.cookie });
  assert.equal(filtered.status, 200);
  const { resources } = await filtered.json();
  assert.deepEqual(resources.map((resource) => resource.title), ["Understanding percentages"]);
  const resourceId = resources[0].id;

  const bookmark = await apiRequest(server, `/api/resources/${resourceId}/bookmark`, {
    method: "POST",
    cookie: registration.cookie,
  });
  assert.equal(bookmark.status, 200);
  assert.equal((await bookmark.json()).bookmarked, true);

  const progress = await apiRequest(server, `/api/resources/${resourceId}/progress`, {
    method: "POST",
    cookie: registration.cookie,
    body: { lastPositionSeconds: 75, completed: false },
  });
  assert.equal(progress.status, 200);

  const savedResource = await apiRequest(server, `/api/resources/${resourceId}`, { cookie: registration.cookie });
  assert.equal(savedResource.status, 200);
  const saved = (await savedResource.json()).resource;
  assert.equal(saved.bookmarked, true);
  assert.equal(saved.lastPositionSeconds, 75);

  const activity = await apiRequest(server, "/api/resources/activity", { cookie: registration.cookie });
  assert.equal(activity.status, 200);
  assert.ok((await activity.json()).saved.some((resource) => resource.id === resourceId));
});
