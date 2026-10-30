import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { apiRequest, createTestServer, registerStudent } from "../test-support/workflow-helpers.js";

test("course catalogue and lesson detail require a student session and return authored lessons", async (t) => {
  const server = await createTestServer();
  t.after(() => server.close());

  const unauthorized = await apiRequest(server, "/api/courses");
  assert.equal(unauthorized.status, 401);

  const { cookie } = await registerStudent(server, `courses-${randomUUID()}@example.test`);
  const catalogueResponse = await apiRequest(server, "/api/courses?subject=Mathematics", { cookie });
  assert.equal(catalogueResponse.status, 200);
  const { courses } = await catalogueResponse.json();
  assert.ok(courses.length > 0);
  assert.ok(courses.every((course) => course.subject === "Mathematics"));
  assert.ok(courses.every((course) => course.lessonCount > 0));

  const detailResponse = await apiRequest(server, `/api/courses/${courses[0].id}`, { cookie });
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.equal(detail.course.id, courses[0].id);
  assert.equal(detail.lessons.length, detail.course.lessonCount);
  assert.ok(detail.lessons[0].sections.length > 0);
  assert.ok(detail.lessons[0].questions.length > 0);
  assert.equal(detail.lessons[0].completed, false);

  const notFound = await apiRequest(server, "/api/courses/not-a-course", { cookie });
  assert.equal(notFound.status, 404);
});

test("course lesson progress is idempotently synchronized and scoped to the student", async (t) => {
  const server = await createTestServer();
  t.after(() => server.close());
  const first = await registerStudent(server, `course-progress-${randomUUID()}@example.test`);
  const second = await registerStudent(server, `course-reader-${randomUUID()}@example.test`);
  const courseId = "algebra-foundations";
  const lessonId = "algebra-variables";
  const operation = {
    id: randomUUID(),
    type: "course.lesson",
    occurredAt: new Date().toISOString(),
    payload: { courseId, lessonId, completed: true, bookmarked: true },
  };

  const syncResponse = await apiRequest(server, "/api/sync/batch", {
    method: "POST",
    cookie: first.cookie,
    body: { operations: [operation] },
  });
  assert.equal(syncResponse.status, 200);
  assert.equal((await syncResponse.json()).results[0].status, "acknowledged");

  const duplicateResponse = await apiRequest(server, "/api/sync/batch", {
    method: "POST",
    cookie: first.cookie,
    body: { operations: [operation] },
  });
  const duplicate = (await duplicateResponse.json()).results[0];
  assert.equal(duplicate.status, "acknowledged");
  assert.equal(duplicate.duplicate, true);

  const firstDetail = await apiRequest(server, `/api/courses/${courseId}`, { cookie: first.cookie });
  const firstLesson = (await firstDetail.json()).lessons.find((lesson) => lesson.id === lessonId);
  assert.equal(firstLesson.completed, true);
  assert.equal(firstLesson.bookmarked, true);

  const secondDetail = await apiRequest(server, `/api/courses/${courseId}`, { cookie: second.cookie });
  const secondLesson = (await secondDetail.json()).lessons.find((lesson) => lesson.id === lessonId);
  assert.equal(secondLesson.completed, false);
  assert.equal(secondLesson.bookmarked, false);
});

test("invalid course progress is rejected without persisting progress", async (t) => {
  const server = await createTestServer();
  t.after(() => server.close());
  const { cookie } = await registerStudent(server, `course-invalid-${randomUUID()}@example.test`);
  const response = await apiRequest(server, "/api/sync/batch", {
    method: "POST",
    cookie,
    body: {
      operations: [{
        id: randomUUID(),
        type: "course.lesson",
        occurredAt: new Date().toISOString(),
        payload: { courseId: "algebra-foundations", lessonId: "geometry-angles", completed: true, bookmarked: false },
      }],
    },
  });
  const result = (await response.json()).results[0];
  assert.equal(result.status, "failed");
  assert.match(result.error, /invalid|available/i);

  const detailResponse = await apiRequest(server, "/api/courses/algebra-foundations", { cookie });
  const lesson = (await detailResponse.json()).lessons.find((item) => item.id === "algebra-variables");
  assert.equal(lesson.completed, false);
});

test("course administration is restricted and safely manages original content", async (t) => {
  const server = await createTestServer({
    environment: {
      ADMIN_EMAILS: "course-admin@example.test",
      ADMIN_BOOTSTRAP_TOKEN: "test-bootstrap-token-with-at-least-32-characters",
    },
  });
  t.after(() => server.close());
  const regular = await registerStudent(server, `course-student-${randomUUID()}@example.test`);
  assert.equal((await apiRequest(server, "/api/admin/courses", { cookie: regular.cookie })).status, 403);

  const admin = await registerStudent(server, "course-admin@example.test");
  const bootstrap = await apiRequest(server, "/api/admin/bootstrap", {
    method: "POST",
    cookie: admin.cookie,
    body: { token: "test-bootstrap-token-with-at-least-32-characters" },
  });
  assert.equal(bootstrap.status, 200);

  const courseId = `admin-course-${randomUUID()}`;
  const createCourse = await apiRequest(server, "/api/admin/courses", {
    method: "POST",
    cookie: admin.cookie,
    body: {
      id: courseId,
      title: "Original data literacy",
      description: "An original lesson about organizing simple observations.",
      subject: "Digital Skills",
      level: "Beginner",
      language: "English",
      estimatedMinutes: 20,
      sourceName: "Original EduSphere lesson",
      licenseInfo: "Original demonstration content written for EduSphere.",
      isPublished: true,
    },
  });
  assert.equal(createCourse.status, 201);

  const content = {
    objectives: ["Describe a data table."],
    sections: [{ heading: "Arrange observations", paragraphs: ["Use one row for each observation."] }],
    summary: ["Tables organize observations."],
    questions: [{
      id: "data-table-q1",
      prompt: "What does each row represent?",
      type: "multiple-choice",
      options: ["One observation", "A paragraph", "A color"],
      answer: "One observation",
      explanation: "Rows keep individual observations together.",
    }],
  };
  const saveLesson = await apiRequest(server, `/api/admin/courses/${courseId}/lessons/data-tables`, {
    method: "PUT",
    cookie: admin.cookie,
    body: { title: "Read a simple table", estimatedMinutes: 10, sortOrder: 0, content },
  });
  assert.equal(saveLesson.status, 200);
  assert.equal((await saveLesson.json()).lesson.title, "Read a simple table");

  const publicCourse = await apiRequest(server, `/api/courses/${courseId}`, { cookie: regular.cookie });
  assert.equal((await publicCourse.json()).lessons[0].questions[0].answer, "One observation");
  assert.equal((await apiRequest(server, "/api/admin/courses", { cookie: regular.cookie })).status, 403);

  const unpublishLesson = await apiRequest(server, `/api/admin/courses/${courseId}/lessons/data-tables`, {
    method: "DELETE",
    cookie: admin.cookie,
  });
  assert.equal(unpublishLesson.status, 204);
  assert.equal(server.database.prepare("SELECT is_published FROM course_lessons WHERE id = ?").get("data-tables").is_published, 0);

  const unpublishCourse = await apiRequest(server, `/api/admin/courses/${courseId}`, {
    method: "DELETE",
    cookie: admin.cookie,
  });
  assert.equal(unpublishCourse.status, 204);
  assert.equal(server.database.prepare("SELECT is_published FROM courses WHERE id = ?").get(courseId).is_published, 0);
});
