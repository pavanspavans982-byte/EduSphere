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

test("submit an assessment, reject unauthenticated access, and read back the saved result", async () => {
  assert.equal((await apiRequest(server, "/api/assessments")).status, 401);
  const registration = await registerStudent(server, `assessment-${crypto.randomUUID()}@example.test`);
  assert.equal(registration.response.status, 201);

  const catalogResponse = await apiRequest(server, "/api/assessments", { cookie: registration.cookie });
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  const selected = catalog.assessments[0];
  assert.ok(selected);

  const detailResponse = await apiRequest(server, `/api/assessments/${selected.id}`, { cookie: registration.cookie });
  assert.equal(detailResponse.status, 200);
  const { assessment } = await detailResponse.json();
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const submittedAt = new Date().toISOString();
  const attemptId = crypto.randomUUID();
  const answers = assessment.questions.map((question) => ({ questionId: question.id, answer: "__incorrect__" }));

  const attemptResponse = await apiRequest(server, "/api/assessment-attempts", {
    method: "POST",
    cookie: registration.cookie,
    body: { attemptId, assessmentId: selected.id, startedAt, submittedAt, answers },
  });
  assert.equal(attemptResponse.status, 201);
  const attempt = (await attemptResponse.json()).attempt;
  assert.equal(attempt.attemptId, attemptId);

  const historyResponse = await apiRequest(server, "/api/assessments", { cookie: registration.cookie });
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.ok(history.history.some((entry) => entry.attemptId === attemptId));

  const resultResponse = await apiRequest(server, `/api/assessment-attempts/${attemptId}`, { cookie: registration.cookie });
  assert.equal(resultResponse.status, 200);
  assert.equal((await resultResponse.json()).attempt.assessmentId, selected.id);
});
