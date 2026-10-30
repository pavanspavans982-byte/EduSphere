import { randomBytes, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import sharp from "sharp";
import { createPasswordResetMailer } from "./mailer.js";
import { normalizeEmail, validateProfile, validateRegistration } from "./validation.js";
import { resourceCategories, resourceLevels, resourceTypes } from "./resource-data.js";
import { validateResource } from "./resource-validation.js";
import { createAiService, validateAiQuestion } from "./ai.js";
import {
  assessmentCatalog,
  assessmentCategories,
  getAssessment,
  gradeAssessment,
  sanitizeAssessment,
} from "./assessment-data.js";

const SESSION_COOKIE = "edusphere_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_DURATION_MS = 30 * 60 * 1000;
const BCRYPT_COST = 12;

export function createApp({
  database,
  environment = process.env,
  sendPasswordReset = createPasswordResetMailer(environment),
  secureCookies = environment.NODE_ENV === "production",
  fetchImpl = fetch,
}) {
  if (!database) {
    throw new Error("createApp requires an initialized database.");
  }

  const app = express();
  const allowedOrigins = [
    environment.FRONTEND_ORIGIN ?? "http://localhost:5180",
    "http://localhost:5180",
    "http://127.0.0.1:5180",
  ];

  app.disable("x-powered-by");
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "128kb" }));

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many account requests. Please try again in a few minutes." },
  });
  const adminBootstrapRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many administrator setup attempts. Please try again later." },
  });
  const aiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 12,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "That is a lot of questions at once. Please pause for a minute and try again." },
  });
  const requireAuth = requireStudent(database, secureCookies);
  const aiService = createAiService({ environment, fetchImpl });
  const adminEmails = parseAdminEmails(environment.ADMIN_EMAILS);
  const requireAdmin = (request, response, next) => {
    if (request.student.role !== "admin" || !adminEmails.has(request.student.email)) {
      return response.status(403).json({ error: "Resource management is restricted to configured EduSphere administrators." });
    }
    return next();
  };
  app.get("/api/health", (_request, response) => {
    response.json({
      service: "edusphere-api",
      status: "available",
      phase: "central-sync",
      note: "Authenticated central storage and offline change synchronization are available.",
    });
  });

  app.get("/api/courses", requireAuth, (request, response) => {
    const filters = {
      q: readQueryValue(request.query.q, 120).toLowerCase(),
      subject: readQueryValue(request.query.subject, 80),
      language: readQueryValue(request.query.language, 40),
      level: readQueryValue(request.query.level, 80),
    };
    const courses = database.prepare(`
      SELECT courses.*,
        COUNT(DISTINCT course_lessons.id) AS lesson_count,
        COUNT(DISTINCT CASE WHEN course_lesson_progress.completed = 1 THEN course_lessons.id END) AS completed_lessons
      FROM courses
      LEFT JOIN course_lessons
        ON course_lessons.course_id = courses.id AND course_lessons.is_published = 1
      LEFT JOIN course_lesson_progress
        ON course_lesson_progress.course_id = courses.id
        AND course_lesson_progress.lesson_id = course_lessons.id
        AND course_lesson_progress.student_id = ?
      WHERE courses.is_published = 1
        AND (? = '' OR lower(courses.title || ' ' || courses.description || ' ' || courses.subject) LIKE '%' || ? || '%')
        AND (? = '' OR courses.subject = ?)
        AND (? = '' OR courses.language = ?)
        AND (? = '' OR courses.level = ?)
      GROUP BY courses.id
      ORDER BY courses.subject, courses.title
    `).all(
      request.student.id,
      filters.q, filters.q,
      filters.subject, filters.subject,
      filters.language, filters.language,
      filters.level, filters.level,
    ).map(toPublicCourse);
    return response.json({ courses });
  });

  app.get("/api/courses/:courseId", requireAuth, (request, response) => {
    const course = database.prepare(`
      SELECT courses.*,
        COUNT(DISTINCT course_lessons.id) AS lesson_count,
        COUNT(DISTINCT CASE WHEN course_lesson_progress.completed = 1 THEN course_lessons.id END) AS completed_lessons
      FROM courses
      LEFT JOIN course_lessons ON course_lessons.course_id = courses.id AND course_lessons.is_published = 1
      LEFT JOIN course_lesson_progress
        ON course_lesson_progress.course_id = courses.id
        AND course_lesson_progress.lesson_id = course_lessons.id
        AND course_lesson_progress.student_id = ?
      WHERE courses.id = ? AND courses.is_published = 1
      GROUP BY courses.id
    `).get(request.student.id, request.params.courseId);
    if (!course) return response.status(404).json({ error: "This learning course could not be found." });

    const lessons = database.prepare(`
      SELECT course_lessons.*,
        COALESCE(course_lesson_progress.completed, 0) AS completed,
        COALESCE(course_lesson_progress.bookmarked, 0) AS bookmarked,
        course_lesson_progress.last_accessed_at
      FROM course_lessons
      LEFT JOIN course_lesson_progress
        ON course_lesson_progress.lesson_id = course_lessons.id
        AND course_lesson_progress.student_id = ?
      WHERE course_lessons.course_id = ? AND course_lessons.is_published = 1
      ORDER BY course_lessons.sort_order
    `).all(request.student.id, request.params.courseId).map(toPublicCourseLesson);

    return response.json({ course: toPublicCourse(course), lessons });
  });

  app.get("/api/admin/courses", requireAuth, requireAdmin, (_request, response) => {
    const courses = database.prepare(`
      SELECT courses.*, COUNT(course_lessons.id) AS lesson_count, 0 AS completed_lessons
      FROM courses
      LEFT JOIN course_lessons ON course_lessons.course_id = courses.id
      GROUP BY courses.id
      ORDER BY courses.subject, courses.title
    `).all().map((course) => ({
      ...toPublicCourse(course),
      isPublished: Boolean(course.is_published),
      lessons: database.prepare(`
        SELECT course_lessons.*, 0 AS completed, 0 AS bookmarked, NULL AS last_accessed_at
        FROM course_lessons WHERE course_id = ? ORDER BY sort_order
      `).all(course.id).map((lesson) => ({
        ...toPublicCourseLesson(lesson),
        isPublished: Boolean(lesson.is_published),
        sortOrder: lesson.sort_order,
      })),
    }));
    return response.json({ courses });
  });

  app.post("/api/admin/courses", requireAuth, requireAdmin, (request, response) => {
    const result = validateCourseMetadata(request.body, true);
    if (result.error) return response.status(400).json({ error: result.error });
    const course = result.value;
    try {
      database.prepare(`
        INSERT INTO courses
          (id, title, description, subject, level, language, estimated_minutes, source_name, license_info, is_published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        course.id, course.title, course.description, course.subject, course.level, course.language,
        course.estimatedMinutes, course.sourceName, course.licenseInfo, Number(course.isPublished),
      );
    } catch (error) {
      if (error?.code === "ERR_SQLITE_CONSTRAINT_PRIMARYKEY" || error?.code === "ERR_SQLITE_CONSTRAINT_UNIQUE") {
        return response.status(409).json({ error: "A course with this ID already exists." });
      }
      throw error;
    }
    return response.status(201).json({ course: { ...course, lessonCount: 0, completedLessons: 0, progressPercent: 0 } });
  });

  app.put("/api/admin/courses/:courseId", requireAuth, requireAdmin, (request, response) => {
    const result = validateCourseMetadata(request.body, false);
    if (result.error) return response.status(400).json({ error: result.error });
    const course = result.value;
    const updated = database.prepare(`
      UPDATE courses SET title = ?, description = ?, subject = ?, level = ?, language = ?,
        estimated_minutes = ?, source_name = ?, license_info = ?, is_published = ?, updated_at = ?
      WHERE id = ?
    `).run(
      course.title, course.description, course.subject, course.level, course.language,
      course.estimatedMinutes, course.sourceName, course.licenseInfo, Number(course.isPublished),
      new Date().toISOString(), request.params.courseId,
    );
    if (!updated.changes) return response.status(404).json({ error: "This course could not be found." });
    return response.json({ course: { id: request.params.courseId, ...course } });
  });

  app.delete("/api/admin/courses/:courseId", requireAuth, requireAdmin, (request, response) => {
    const updated = database.prepare("UPDATE courses SET is_published = 0, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), request.params.courseId);
    if (!updated.changes) return response.status(404).json({ error: "This course could not be found." });
    return response.status(204).end();
  });

  app.put("/api/admin/courses/:courseId/lessons/:lessonId", requireAuth, requireAdmin, (request, response) => {
    const lesson = validateCourseLesson(request.body);
    if (lesson.error) return response.status(400).json({ error: lesson.error });
    const courseExists = database.prepare("SELECT id FROM courses WHERE id = ?").get(request.params.courseId);
    if (!courseExists) return response.status(404).json({ error: "This course could not be found." });
    const current = database.prepare("SELECT course_id FROM course_lessons WHERE id = ?").get(request.params.lessonId);
    if (current && current.course_id !== request.params.courseId) {
      return response.status(409).json({ error: "This lesson ID already belongs to a different course." });
    }
    database.prepare(`
      INSERT INTO course_lessons
        (id, course_id, title, estimated_minutes, content_json, sort_order, is_published, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        estimated_minutes = excluded.estimated_minutes,
        content_json = excluded.content_json,
        sort_order = excluded.sort_order,
        is_published = excluded.is_published,
        updated_at = excluded.updated_at
    `).run(
      request.params.lessonId, request.params.courseId, lesson.value.title, lesson.value.estimatedMinutes,
      JSON.stringify(lesson.value.content), lesson.value.sortOrder, Number(lesson.value.isPublished),
      new Date().toISOString(),
    );
    return response.json({ lesson: { id: request.params.lessonId, courseId: request.params.courseId, ...lesson.value } });
  });

  app.delete("/api/admin/courses/:courseId/lessons/:lessonId", requireAuth, requireAdmin, (request, response) => {
    const updated = database.prepare(`
      UPDATE course_lessons SET is_published = 0, updated_at = ? WHERE id = ? AND course_id = ?
    `).run(new Date().toISOString(), request.params.lessonId, request.params.courseId);
    if (!updated.changes) return response.status(404).json({ error: "This course lesson could not be found." });
    return response.status(204).end();
  });

  app.get("/api/sync/status", requireAuth, (request, response) => {
    const lastSession = database.prepare(`
      SELECT completed_at, operation_count, acknowledged_count, failed_count
      FROM sync_sessions WHERE student_id = ? AND failed_count = 0 ORDER BY completed_at DESC LIMIT 1
    `).get(request.student.id);
    const counts = database.prepare(`
      SELECT
        SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END) AS acknowledged,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM sync_operations WHERE student_id = ?
    `).get(request.student.id);
    const pendingDoubts = database.prepare(`
      SELECT COUNT(*) AS count FROM ai_doubt_requests
      WHERE student_id = ? AND status = 'queued'
    `).get(request.student.id).count;
    return response.json({
      lastSuccessfulSyncAt: lastSession?.completed_at ?? null,
      lastSession: lastSession ?? null,
      acknowledgedOperations: counts.acknowledged ?? 0,
      failedOperations: counts.failed ?? 0,
      pendingDoubtRequests: pendingDoubts,
    });
  });

  app.post("/api/sync/batch", requireAuth, (request, response, next) => {
    try {
      const operations = request.body?.operations;
      const includePendingQuestions = request.body?.includePendingQuestions === true;
      if (!Array.isArray(operations) || operations.length > 100) {
        return response.status(400).json({ error: "Sync accepts a list of up to 100 operations." });
      }
      if (request.body?.includePendingQuestions !== undefined && typeof request.body.includePendingQuestions !== "boolean") {
        return response.status(400).json({ error: "Pending question consent must be explicitly true or false." });
      }
      const results = [];
      for (const operation of operations) {
        results.push(processSyncOperation(database, request.student.id, operation, includePendingQuestions));
      }
      const acknowledgedCount = results.filter((result) => result.status === "acknowledged").length;
      const failedCount = results.length - acknowledgedCount;
      database.prepare(`
        INSERT INTO sync_sessions (id, student_id, operation_count, acknowledged_count, failed_count, completed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), request.student.id, results.length, acknowledgedCount, failedCount, new Date().toISOString());
      return response.json({ results, status: "completed" });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/sync/snapshot", requireAuth, (request, response) => {
    const skillActions = database.prepare(`
      SELECT action_id, skill_id, lesson_id, action_type, occurred_at
      FROM skill_activity WHERE student_id = ? ORDER BY occurred_at ASC
    `).all(request.student.id);
    const profile = toPublicStudent(getStudent(database, request.student.id));
    return response.json({ profile, skillActions });
  });

  app.get("/api/doubt-requests", requireAuth, (request, response) => {
    const requests = database.prepare(`
      SELECT request_id AS requestId, subject, mode, status, created_at AS createdAt
      FROM ai_doubt_requests WHERE student_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(request.student.id);
    return response.json({ requests });
  });

  app.get("/api/admin/overview", requireAuth, requireAdmin, (_request, response) => {
    const summary = {
      students: database.prepare("SELECT COUNT(*) AS count FROM students").get().count,
      resources: database.prepare("SELECT COUNT(*) AS count FROM resources").get().count,
      assessmentAttempts: database.prepare("SELECT COUNT(*) AS count FROM assessment_attempts").get().count,
      completedResources: database.prepare("SELECT COUNT(*) AS count FROM resource_progress WHERE completed = 1").get().count,
      skillActions: database.prepare("SELECT COUNT(*) AS count FROM skill_activity").get().count,
      queuedDoubtRequests: database.prepare("SELECT COUNT(*) AS count FROM ai_doubt_requests WHERE status = 'queued'").get().count,
    };
    const sync = database.prepare(`
      SELECT
        SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END) AS acknowledged,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM sync_operations
    `).get();
    const recentSync = database.prepare(`
      SELECT operation_type AS type, status, error, processed_at AS processedAt
      FROM sync_operations
      ORDER BY processed_at DESC LIMIT 12
    `).all().map(({ type, status, error, processedAt }) => ({ type, status, error, processedAt }));
    return response.json({
      summary: { ...summary, acknowledgedSyncOperations: sync.acknowledged ?? 0, failedSyncOperations: sync.failed ?? 0 },
      recentSync,
    });
  });

  app.get("/api/ai/status", requireAuth, async (_request, response, next) => {
    try {
      return response.json(await aiService.getStatus());
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/ai/local", requireAuth, aiRateLimit, async (request, response) => {
    const validation = validateAiQuestion(request.body);
    if (validation.error) {
      return response.status(400).json({ error: validation.error });
    }
    try {
      const result = await aiService.askLocal(validation.value);
      return response.json({ answer: result.answer, provider: "local", model: result.model });
    } catch (error) {
      return response.status(error.status ?? 503).json({
        error: error.message || "The local AI model could not answer right now.",
        provider: "local",
      });
    }
  });

  app.post("/api/ai/online", requireAuth, aiRateLimit, async (request, response) => {
    const validation = validateAiQuestion(request.body);
    if (validation.error) {
      return response.status(400).json({ error: validation.error });
    }
    try {
      const result = await aiService.askOnline(validation.value);
      return response.json({ answer: result.answer, provider: "online", model: result.model });
    } catch (error) {
      return response.status(error.status ?? 503).json({
        error: error.message || "Online AI could not answer right now.",
        provider: "online",
      });
    }
  });

  app.get("/api/assessments", requireAuth, (request, response) => {
    const historyRows = database.prepare(`
      SELECT attempt_id, assessment_id, started_at, submitted_at, score, total, accuracy,
        questions_json, topic_results_json, weak_topics_json
      FROM assessment_attempts
      WHERE student_id = ?
      ORDER BY submitted_at DESC
    `).all(request.student.id);
    const history = historyRows.map(toPublicAssessmentAttempt);
    const latestByAssessment = new Map();
    for (const attempt of history) {
      if (!latestByAssessment.has(attempt.assessmentId)) latestByAssessment.set(attempt.assessmentId, attempt);
    }
    return response.json({
      categories: assessmentCategories,
      assessments: assessmentCatalog.map((assessment) => ({
        ...sanitizeAssessment(assessment),
        questionCount: assessment.questions.length,
        previousAttempts: history.filter((attempt) => attempt.assessmentId === assessment.id).length,
        bestAccuracy: Math.max(0, ...history.filter((attempt) => attempt.assessmentId === assessment.id).map((attempt) => attempt.accuracy)),
        latestAttempt: latestByAssessment.get(assessment.id) ?? null,
      })),
      history,
    });
  });

  app.get("/api/assessments/:assessmentId", requireAuth, (request, response) => {
    const assessment = getAssessment(request.params.assessmentId);
    if (!assessment) return response.status(404).json({ error: "Assessment not found." });
    const row = database.prepare(`
      SELECT accuracy, topic_results_json
      FROM assessment_attempts
      WHERE student_id = ? AND assessment_id = ?
      ORDER BY submitted_at DESC LIMIT 3
    `).all(request.student.id, assessment.id);
    const priorPerformance = row.map((attempt) => ({
      accuracy: attempt.accuracy,
      topicResults: JSON.parse(attempt.topic_results_json),
    }));
    return response.json({ assessment: sanitizeAssessment(assessment), priorPerformance });
  });

  app.get("/api/assessment-attempts/:attemptId", requireAuth, (request, response) => {
    const row = database.prepare(`
      SELECT attempt_id, assessment_id, started_at, submitted_at, score, total, accuracy,
        questions_json, topic_results_json, weak_topics_json
      FROM assessment_attempts WHERE student_id = ? AND attempt_id = ?
    `).get(request.student.id, request.params.attemptId);
    if (!row) return response.status(404).json({ error: "Assessment result not found." });
    return response.json({ attempt: toPublicAssessmentAttempt(row) });
  });

  app.post("/api/assessment-attempts", requireAuth, (request, response, next) => {
    try {
      const { attemptId, assessmentId, startedAt, submittedAt, answers } = request.body ?? {};
      if (typeof attemptId !== "string" || !/^[0-9a-f-]{36}$/i.test(attemptId)) {
        return response.status(400).json({ error: "A valid assessment attempt ID is required." });
      }
      const assessment = getAssessment(assessmentId);
      if (!assessment) return response.status(400).json({ error: "The selected assessment is not available." });
      if (!isValidTimestamp(startedAt) || !isValidTimestamp(submittedAt) || Date.parse(submittedAt) < Date.parse(startedAt)) {
        return response.status(400).json({ error: "Assessment attempt timestamps are invalid." });
      }
      if (!Array.isArray(answers) || answers.length !== assessment.questions.length) {
        return response.status(400).json({ error: "Submit an answer record for every assessment question." });
      }
      const validQuestionIds = new Set(assessment.questions.map((question) => question.id));
      const answerIds = new Set();
      for (const entry of answers) {
        if (!entry || typeof entry.questionId !== "string" || !validQuestionIds.has(entry.questionId) ||
            answerIds.has(entry.questionId) || typeof entry.answer !== "string" || entry.answer.length > 2000) {
          return response.status(400).json({ error: "Assessment answers are invalid. Review the saved attempt and try again." });
        }
        answerIds.add(entry.questionId);
      }
      if (answerIds.size !== validQuestionIds.size) {
        return response.status(400).json({ error: "Submit an answer record for every assessment question." });
      }

      const grading = gradeAssessment(assessment, answers);
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare(`
          INSERT OR IGNORE INTO assessment_attempts
            (student_id, attempt_id, assessment_id, started_at, submitted_at, score, total, accuracy,
             questions_json, topic_results_json, weak_topics_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          request.student.id,
          attemptId,
          assessment.id,
          startedAt,
          submittedAt,
          grading.score,
          grading.total,
          grading.accuracy,
          JSON.stringify(grading.questions),
          JSON.stringify(grading.topicResults),
          JSON.stringify(grading.weakTopics),
        );
        const savedAttempt = database.prepare(`
          SELECT attempt_id, assessment_id, started_at, submitted_at, score, total, accuracy,
            questions_json, topic_results_json, weak_topics_json
          FROM assessment_attempts WHERE student_id = ? AND attempt_id = ?
        `).get(request.student.id, attemptId);
        database.exec("COMMIT");
        return response.status(201).json({ attempt: toPublicAssessmentAttempt(savedAttempt) });
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/auth/register", authRateLimit, async (request, response, next) => {
    try {
      const { errors, value } = validateRegistration(request.body);
      if (Object.keys(errors).length > 0) {
        return response.status(400).json({ error: "Check the highlighted fields.", fieldErrors: errors });
      }

      const passwordHash = await bcrypt.hash(value.password, BCRYPT_COST);
      const studentId = randomUUID();

      try {
        database.prepare("INSERT INTO students (id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'student')")
          .run(studentId, value.name, value.email, passwordHash);
      } catch (error) {
        if (isUniqueConstraint(error)) {
          return response.status(409).json({ error: "An account with this email already exists.", fieldErrors: { email: "This email is already registered." } });
        }
        throw error;
      }

      const student = getStudent(database, studentId);
      createSession(database, studentId, response, secureCookies);
      return response.status(201).json({ student: toPublicStudent(student) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/admin/bootstrap", requireAuth, adminBootstrapRateLimit, (request, response) => {
    const bootstrapToken = environment.ADMIN_BOOTSTRAP_TOKEN;
    if (typeof bootstrapToken !== "string" || bootstrapToken.length < 32) {
      return response.status(503).json({ error: "Administrator setup is not configured. Ask the server operator to configure a secure bootstrap token." });
    }
    if (!adminEmails.has(request.student.email)) {
      return response.status(403).json({ error: "This account is not authorized for administrator setup." });
    }

    const suppliedToken = typeof request.body?.token === "string" && request.body.token.length <= 4096
      ? request.body.token
      : "";
    const expectedHash = createHash("sha256").update(bootstrapToken).digest();
    const suppliedHash = createHash("sha256").update(suppliedToken).digest();
    if (!timingSafeEqual(expectedHash, suppliedHash)) {
      return response.status(403).json({ error: "The administrator setup token is invalid." });
    }

    database.prepare("UPDATE students SET role = 'admin', updated_at = datetime('now') WHERE id = ?")
      .run(request.student.id);
    return response.json({ student: toPublicStudent(getStudent(database, request.student.id)) });
  });

  app.post("/api/auth/login", authRateLimit, async (request, response, next) => {
    try {
      const email = normalizeEmail(request.body?.email);
      const password = typeof request.body?.password === "string" ? request.body.password : "";

      if (email.length > 254 || !password || password.length > 128) {
        return response.status(401).json({ error: "Email or password is incorrect." });
      }

      const student = database.prepare("SELECT * FROM students WHERE email = ?").get(email);
      const validPassword = student
        ? await bcrypt.compare(password, student.password_hash)
        : await bcrypt.compare(password, "$2b$12$uSCSY7F0uB4O6VtVC2TFLe3z/yXeZh0xX3RhXOLCbYmrIWia93t/e");

      if (!student || !validPassword) {
        return response.status(401).json({ error: "Email or password is incorrect." });
      }

      createSession(database, student.id, response, secureCookies);
      return response.json({ student: toPublicStudent(student) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/auth/me", requireAuth, (request, response) => {
    response.json({ student: toPublicStudent(request.student) });
  });

  app.post("/api/auth/logout", requireAuth, (request, response) => {
    database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(request.sessionTokenHash);
    clearSessionCookie(response, secureCookies);
    response.status(204).end();
  });

  app.post("/api/auth/forgot-password", authRateLimit, async (request, response, next) => {
    if (!sendPasswordReset) {
      return response.status(503).json({
        error: "Password reset email is not configured. Ask the administrator to configure SMTP before requesting a reset.",
      });
    }

    try {
      const email = normalizeEmail(request.body?.email);
      if (!email || email.length > 254) {
        return response.status(400).json({ error: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address." } });
      }

      const student = database.prepare("SELECT id, email FROM students WHERE email = ?").get(email);
      if (student) {
        const token = randomBytes(32).toString("base64url");
        const tokenHash = hashToken(token);
        const expiresAt = Date.now() + RESET_DURATION_MS;
        database.prepare("DELETE FROM password_reset_tokens WHERE student_id = ?").run(student.id);
        database.prepare("INSERT INTO password_reset_tokens (token_hash, student_id, expires_at) VALUES (?, ?, ?)")
          .run(tokenHash, student.id, expiresAt);

        try {
          await sendPasswordReset({ email: student.email, token });
        } catch {
          database.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(tokenHash);
          return response.status(503).json({ error: "The reset email could not be sent. Please try again later." });
        }
      }

      return response.json({ message: "If an account exists for that email, password reset instructions have been sent." });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/auth/reset-password", authRateLimit, async (request, response, next) => {
    try {
      const token = typeof request.body?.token === "string" ? request.body.token : "";
      const password = typeof request.body?.password === "string" ? request.body.password : "";
      if (!token || token.length > 128) {
        return response.status(400).json({ error: "This password reset link is invalid or has expired." });
      }
      if (password.length < 8 || password.length > 128) {
        return response.status(400).json({ error: "Use a password between 8 and 128 characters.", fieldErrors: { password: "Use a password between 8 and 128 characters." } });
      }

      const tokenHash = hashToken(token);
      const reset = database.prepare("SELECT student_id, expires_at FROM password_reset_tokens WHERE token_hash = ?").get(tokenHash);
      if (!reset || reset.expires_at <= Date.now()) {
        if (reset) {
          database.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(tokenHash);
        }
        return response.status(400).json({ error: "This password reset link is invalid or has expired." });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
      database.exec("BEGIN IMMEDIATE");
      try {
        const activeReset = database.prepare(`
          SELECT student_id, expires_at
          FROM password_reset_tokens
          WHERE token_hash = ?
        `).get(tokenHash);
        if (!activeReset || activeReset.expires_at <= Date.now()) {
          database.exec("ROLLBACK");
          return response.status(400).json({ error: "This password reset link is invalid or has expired." });
        }

        database.prepare("UPDATE students SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
          .run(passwordHash, activeReset.student_id);
        database.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(tokenHash);
        database.prepare("DELETE FROM sessions WHERE student_id = ?").run(activeReset.student_id);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      clearSessionCookie(response, secureCookies);
      return response.json({ message: "Your password has been updated. Please sign in with your new password." });
    } catch (error) {
      return next(error);
    }
  });

  app.put("/api/profile", requireAuth, (request, response, next) => {
    try {
      const { errors, value } = validateProfile(request.body);
      if (Object.keys(errors).length > 0) {
        return response.status(400).json({ error: "Check the highlighted fields.", fieldErrors: errors });
      }

      database.prepare(`
        UPDATE students SET
          full_name = ?,
          college = ?,
          course = ?,
          branch = ?,
          year_of_study = ?,
          interests_json = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        value.name,
        value.college,
        value.course,
        value.branch,
        value.yearOfStudy,
        JSON.stringify(value.interests),
        new Date().toISOString(),
        request.student.id,
      );

      return response.json({ student: toPublicStudent(getStudent(database, request.student.id)) });
    } catch (error) {
      return next(error);
    }
  });

  app.put(
    "/api/profile/avatar",
    requireAuth,
    express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "2mb" }),
    async (request, response) => {
      const mimeType = request.get("content-type");
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        return response.status(400).json({ error: "Choose a PNG, JPEG, or WebP image smaller than 2 MB." });
      }

      try {
        const image = sharp(request.body, { limitInputPixels: 16_000_000 });
        const metadata = await image.metadata();
        const expectedFormat = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" }[mimeType];
        if (!expectedFormat || metadata.format !== expectedFormat) {
          return response.status(400).json({ error: "The image contents do not match its file type." });
        }

        const avatar = await image
          .rotate()
          .resize(512, 512, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        database.prepare("UPDATE students SET avatar_webp = ?, updated_at = datetime('now') WHERE id = ?")
          .run(avatar, request.student.id);
        return response.json({ student: toPublicStudent(getStudent(database, request.student.id)) });
      } catch {
        return response.status(400).json({ error: "This image could not be opened. Choose a valid PNG, JPEG, or WebP image." });
      }
    },
  );

  app.delete("/api/profile/avatar", requireAuth, (request, response) => {
    database.prepare("UPDATE students SET avatar_webp = NULL, updated_at = datetime('now') WHERE id = ?")
      .run(request.student.id);
    response.json({ student: toPublicStudent(getStudent(database, request.student.id)) });
  });

  app.get("/api/resources/options", requireAuth, (_request, response) => {
    const languages = database.prepare("SELECT DISTINCT language FROM resources ORDER BY language COLLATE NOCASE").all()
      .map((entry) => entry.language);
    const classLevels = database.prepare("SELECT DISTINCT class_level FROM resources ORDER BY class_level COLLATE NOCASE").all()
      .map((entry) => entry.class_level);
    response.json({ subjects: resourceCategories, types: resourceTypes, levels: resourceLevels, languages, classLevels });
  });

  app.get("/api/resources/activity", requireAuth, (request, response) => {
    const bookmarks = database.prepare(`
      SELECT resources.*, 1 AS is_bookmarked,
        EXISTS (SELECT 1 FROM resource_files WHERE resource_files.resource_id = resources.id) AS has_file
      FROM resource_bookmarks
      JOIN resources ON resources.id = resource_bookmarks.resource_id
      WHERE resource_bookmarks.student_id = ? AND resource_bookmarks.bookmarked = 1
      ORDER BY resource_bookmarks.created_at DESC
    `).all(request.student.id).map(toPublicResource);
    const recent = database.prepare(`
      SELECT resources.*, resource_progress.last_position_seconds,
        resource_progress.last_accessed_at, resource_progress.completed,
        EXISTS (
          SELECT 1 FROM resource_bookmarks
          WHERE resource_bookmarks.resource_id = resources.id
            AND resource_bookmarks.student_id = resource_progress.student_id
            AND resource_bookmarks.bookmarked = 1
        ) AS is_bookmarked
        , EXISTS (SELECT 1 FROM resource_files WHERE resource_files.resource_id = resources.id) AS has_file
      FROM resource_progress
      JOIN resources ON resources.id = resource_progress.resource_id
      WHERE resource_progress.student_id = ?
      ORDER BY resource_progress.last_accessed_at DESC
      LIMIT 10
    `).all(request.student.id).map(toPublicResource);

    response.json({
      saved: bookmarks,
      recent,
      continueLearning: recent.filter((resource) => !resource.completed).slice(0, 5),
    });
  });

  app.get("/api/resources", requireAuth, (request, response) => {
    const search = readQueryValue(request.query.q, 120);
    const subject = readQueryValue(request.query.subject, 50);
    const type = readQueryValue(request.query.type, 30);
    const sort = readQueryValue(request.query.sort, 20) || "newest";
    if (!["newest", "title", "time"].includes(sort)) {
      return response.status(400).json({ error: "Choose a supported sort order." });
    }
    if (subject && !resourceCategories.includes(subject)) {
      return response.status(400).json({ error: "Choose a supported subject filter." });
    }
    if (type && !resourceTypes.includes(type)) {
      return response.status(400).json({ error: "Choose a supported resource type filter." });
    }
    const language = readQueryValue(request.query.language, 40);
    const level = readQueryValue(request.query.level, 30);
    const classLevel = readQueryValue(request.query.classLevel, 60);
    if (level && !resourceLevels.includes(level)) {
      return response.status(400).json({ error: "Choose a supported difficulty filter." });
    }

    const sortExpression = {
      newest: "resources.created_at DESC, resources.title COLLATE NOCASE ASC",
      title: "resources.title COLLATE NOCASE ASC",
      time: "resources.estimated_minutes ASC, resources.title COLLATE NOCASE ASC",
    }[sort];
    const resources = database.prepare(`
      SELECT resources.*,
        EXISTS (
          SELECT 1 FROM resource_bookmarks
          WHERE resource_bookmarks.resource_id = resources.id
            AND resource_bookmarks.student_id = ?
            AND resource_bookmarks.bookmarked = 1
        ) AS is_bookmarked,
        resource_progress.last_position_seconds,
        resource_progress.last_accessed_at,
        COALESCE(resource_progress.completed, 0) AS completed
        , EXISTS (SELECT 1 FROM resource_files WHERE resource_files.resource_id = resources.id) AS has_file
      FROM resources
      LEFT JOIN resource_progress
        ON resource_progress.resource_id = resources.id
        AND resource_progress.student_id = ?
      WHERE (? = '' OR resources.subject = ?)
        AND (? = '' OR resources.type = ?)
        AND (? = '' OR resources.level = ?)
        AND (? = '' OR resources.language = ?)
        AND (? = '' OR resources.class_level = ?)
        AND (? = '' OR resources.title LIKE ? ESCAPE '\\'
          OR resources.description LIKE ? ESCAPE '\\'
          OR resources.subject LIKE ? ESCAPE '\\'
          OR resources.preview LIKE ? ESCAPE '\\'
          OR resources.source_name LIKE ? ESCAPE '\\'
          OR resources.class_level LIKE ? ESCAPE '\\'
          OR resources.language LIKE ? ESCAPE '\\')
      ORDER BY ${sortExpression}
      LIMIT 100
    `).all(
      request.student.id,
      request.student.id,
      subject, subject,
      type, type,
      level, level,
      language, language,
      classLevel, classLevel,
      search, `%${escapeLike(search)}%`, `%${escapeLike(search)}%`,
      `%${escapeLike(search)}%`, `%${escapeLike(search)}%`, `%${escapeLike(search)}%`,
      `%${escapeLike(search)}%`, `%${escapeLike(search)}%`,
    ).map(toPublicResource);

    response.json({ resources });
  });

  app.post("/api/resources/:resourceId/bookmark", requireAuth, (request, response) => {
    if (!findResource(database, request.params.resourceId)) {
      return response.status(404).json({ error: "This learning resource could not be found." });
    }

    const existing = database.prepare("SELECT bookmarked FROM resource_bookmarks WHERE student_id = ? AND resource_id = ?")
      .get(request.student.id, request.params.resourceId);
    const bookmarked = !existing?.bookmarked;
    database.prepare(`
      INSERT INTO resource_bookmarks (student_id, resource_id, created_at, bookmarked, updated_at)
      VALUES (?, ?, datetime('now'), ?, datetime('now'))
      ON CONFLICT(student_id, resource_id) DO UPDATE SET
        bookmarked = excluded.bookmarked,
        created_at = excluded.created_at,
        updated_at = datetime('now')
    `).run(request.student.id, request.params.resourceId, Number(bookmarked));
    return response.json({ bookmarked });
  });

  app.post("/api/resources/:resourceId/progress", requireAuth, (request, response) => {
    if (!findResource(database, request.params.resourceId)) {
      return response.status(404).json({ error: "This learning resource could not be found." });
    }
    const lastPositionSeconds = Number(request.body?.lastPositionSeconds ?? 0);
    const completed = request.body?.completed ?? false;
    if (!Number.isInteger(lastPositionSeconds) || lastPositionSeconds < 0 || lastPositionSeconds > 86_400 || typeof completed !== "boolean") {
      return response.status(400).json({ error: "Learning progress must contain a valid position and completion status." });
    }

    database.prepare(`
      INSERT INTO resource_progress
        (student_id, resource_id, last_position_seconds, last_accessed_at, completed, updated_at)
      VALUES (?, ?, ?, datetime('now'), ?, datetime('now'))
      ON CONFLICT(student_id, resource_id) DO UPDATE SET
        last_position_seconds = excluded.last_position_seconds,
        last_accessed_at = datetime('now'),
        completed = excluded.completed,
        updated_at = datetime('now')
    `).run(request.student.id, request.params.resourceId, lastPositionSeconds, Number(completed));
    return response.json({ saved: true });
  });

  app.get("/api/resources/:resourceId", requireAuth, (request, response) => {
    const resource = findResource(database, request.params.resourceId);
    if (!resource) {
      return response.status(404).json({ error: "This learning resource could not be found." });
    }

    database.prepare(`
      INSERT INTO resource_progress (student_id, resource_id, last_accessed_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(student_id, resource_id) DO UPDATE SET last_accessed_at = datetime('now')
    `).run(request.student.id, request.params.resourceId);

    const enriched = database.prepare(`
      SELECT resources.*,
        EXISTS (
          SELECT 1 FROM resource_bookmarks
          WHERE resource_bookmarks.resource_id = resources.id
            AND resource_bookmarks.student_id = ?
            AND resource_bookmarks.bookmarked = 1
        ) AS is_bookmarked,
        resource_progress.last_position_seconds,
        resource_progress.last_accessed_at,
        COALESCE(resource_progress.completed, 0) AS completed,
        EXISTS (SELECT 1 FROM resource_files WHERE resource_files.resource_id = resources.id) AS has_file
      FROM resources
      JOIN resource_progress
        ON resource_progress.resource_id = resources.id
        AND resource_progress.student_id = ?
      WHERE resources.id = ?
    `).get(request.student.id, request.student.id, request.params.resourceId);
    return response.json({ resource: toPublicResource(enriched) });
  });

  app.get("/api/resources/:resourceId/file", requireAuth, (request, response) => {
    const file = database.prepare(`
      SELECT resource_files.file_name, resource_files.data
      FROM resource_files
      JOIN resources ON resources.id = resource_files.resource_id
      WHERE resources.id = ? AND resources.download_allowed = 1
    `).get(request.params.resourceId);
    if (!file) {
      return response.status(404).json({ error: "No permission-approved PDF is available for this resource." });
    }
    response.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeDownloadName(file.file_name)}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
    });
    return response.send(Buffer.from(file.data));
  });

  app.get("/api/admin/resources", requireAuth, requireAdmin, (_request, response) => {
    const resources = database.prepare(`
      SELECT resources.*, EXISTS (SELECT 1 FROM resource_files WHERE resource_files.resource_id = resources.id) AS has_file
      FROM resources ORDER BY created_at DESC, title COLLATE NOCASE ASC
    `)
      .all().map(toPublicResource);
    response.json({ resources });
  });

  app.post("/api/admin/resources", requireAuth, requireAdmin, (request, response) => {
    const { errors, value } = validateResource(request.body);
    if (Object.keys(errors).length > 0) {
      return response.status(400).json({ error: "Check the highlighted resource fields.", fieldErrors: errors });
    }

    const resourceId = randomUUID();
    database.prepare(`
      INSERT INTO resources
        (id, title, description, subject, level, type, estimated_minutes, preview, language,
          class_level, source_name, source_url, license_info, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resourceId, value.title, value.description, value.subject, value.level,
      value.type, value.estimatedMinutes, value.preview, value.language, value.classLevel, value.sourceName,
      value.sourceUrl, value.licenseInfo, request.student.id,
    );

    return response.status(201).json({ resource: toPublicResource(findResource(database, resourceId)) });
  });

  app.put("/api/admin/resources/:resourceId", requireAuth, requireAdmin, (request, response) => {
    const resource = findResource(database, request.params.resourceId);
    if (!resource) {
      return response.status(404).json({ error: "This learning resource could not be found." });
    }
    if (resource.source_directory) {
      return response.status(403).json({ error: "Official source directory entries are maintained by EduSphere." });
    }
    const { errors, value } = validateResource(request.body, { partial: true });
    if (Object.keys(errors).length > 0) {
      return response.status(400).json({ error: "Check the highlighted resource fields.", fieldErrors: errors });
    }

    const merged = {
      title: value.title ?? resource.title,
      description: value.description ?? resource.description,
      subject: value.subject ?? resource.subject,
      level: value.level ?? resource.level,
      type: value.type ?? resource.type,
      estimatedMinutes: value.estimatedMinutes ?? resource.estimated_minutes,
      preview: value.preview ?? resource.preview,
      language: value.language ?? resource.language,
      sourceName: value.sourceName ?? resource.source_name,
      classLevel: value.classLevel ?? resource.class_level,
      sourceUrl: value.sourceUrl ?? resource.source_url,
      licenseInfo: value.licenseInfo ?? resource.license_info,
    };
    const validation = validateResource(merged);
    if (Object.keys(validation.errors).length > 0) {
      return response.status(400).json({ error: "Check the highlighted resource fields.", fieldErrors: validation.errors });
    }

    database.prepare(`
      UPDATE resources SET title = ?, description = ?, subject = ?, level = ?, type = ?,
        estimated_minutes = ?, preview = ?, language = ?, class_level = ?, source_name = ?, source_url = ?,
        license_info = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      merged.title, merged.description, merged.subject, merged.level,
      merged.type, merged.estimatedMinutes, merged.preview, merged.language, merged.classLevel, merged.sourceName,
      merged.sourceUrl, merged.licenseInfo, resource.id,
    );
    return response.json({ resource: toPublicResource(findResource(database, resource.id)) });
  });

  app.put("/api/admin/resources/:resourceId/file", requireAuth, requireAdmin, express.raw({ type: "application/pdf", limit: "10mb" }), (request, response) => {
    const resource = findResource(database, request.params.resourceId);
    if (!resource) {
      return response.status(404).json({ error: "This learning resource could not be found." });
    }
    if (resource.source_directory) {
      return response.status(403).json({ error: "Files cannot be uploaded to official source directory entries." });
    }
    if (request.headers["x-resource-permission-confirmed"] !== "true") {
      return response.status(400).json({ error: "Confirm that you have permission to store and distribute this PDF." });
    }
    const data = request.body;
    if (!Buffer.isBuffer(data) || data.length < 8 || !data.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return response.status(415).json({ error: "Upload a valid PDF file with the application/pdf content type." });
    }
    const rawName = readQueryValue(request.headers["x-resource-file-name"], 180);
    let decodedName = rawName || "learning-resource.pdf";
    try {
      decodedName = decodeURIComponent(decodedName);
    } catch {
      return response.status(400).json({ error: "The uploaded file name is not valid." });
    }
    const fileName = safeDownloadName(decodedName);
    const saveFile = database.prepare(`
      INSERT INTO resource_files (resource_id, file_name, content_type, data, byte_length)
      VALUES (?, ?, 'application/pdf', ?, ?)
      ON CONFLICT(resource_id) DO UPDATE SET
        file_name = excluded.file_name,
        data = excluded.data,
        byte_length = excluded.byte_length,
        uploaded_at = datetime('now')
    `);
    const updatePermission = database.prepare(`
      UPDATE resources SET download_allowed = 1, updated_at = datetime('now') WHERE id = ?
    `);
    database.exec("BEGIN");
    try {
      saveFile.run(resource.id, fileName, data, data.length);
      updatePermission.run(resource.id);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return response.json({ resource: toPublicResource(findResource(database, resource.id)) });
  });

  app.delete("/api/admin/resources/:resourceId/file", requireAuth, requireAdmin, (request, response) => {
    const resource = findResource(database, request.params.resourceId);
    if (!resource) {
      return response.status(404).json({ error: "This learning resource could not be found." });
    }
    database.prepare("DELETE FROM resource_files WHERE resource_id = ?").run(resource.id);
    database.prepare("UPDATE resources SET download_allowed = 0, updated_at = datetime('now') WHERE id = ?").run(resource.id);
    return response.status(204).end();
  });

  app.delete("/api/admin/resources/:resourceId", requireAuth, requireAdmin, (request, response) => {
    const resource = findResource(database, request.params.resourceId);
    if (!resource) {
      return response.status(404).json({ error: "This learning resource could not be found." });
    }
    if (resource.is_demo) {
      return response.status(403).json({ error: "Seed demo resources are protected from deletion." });
    }
    database.prepare("DELETE FROM resources WHERE id = ?").run(resource.id);
    return response.status(204).end();
  });

  app.use((error, _request, response, _next) => {
    if (error?.type === "entity.too.large") {
      return response.status(413).json({ error: "The uploaded file or request is too large." });
    }
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({ error: "Request body must contain valid JSON." });
    }
    if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return response.status(409).json({ error: "This account already exists." });
    }

    console.error("EduSphere API request failed:", error?.message ?? "Unknown error");
    return response.status(500).json({ error: "The server could not complete this request." });
  });

  return app;
}

function requireStudent(database, secureCookies) {
  return (request, response, next) => {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!token || token.length > 128) {
      clearSessionCookie(response, secureCookies);
      return response.status(401).json({ error: "Please sign in to continue." });
    }

    const tokenHash = hashToken(token);
    const session = database.prepare(`
      SELECT students.*, sessions.token_hash, sessions.expires_at
      FROM sessions
      JOIN students ON students.id = sessions.student_id
      WHERE sessions.token_hash = ?
    `).get(tokenHash);

    if (!session || session.expires_at <= Date.now()) {
      if (session) {
        database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
      }
      clearSessionCookie(response, secureCookies);
      return response.status(401).json({ error: "Your session has expired. Please sign in again." });
    }

    request.student = session;
    request.sessionTokenHash = tokenHash;
    return next();
  };
}

function createSession(database, studentId, response, secureCookies) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  database.prepare("INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)")
    .run(hashToken(token), studentId, expiresAt);
  response.cookie(SESSION_COOKIE, token, cookieOptions(secureCookies));
}

function clearSessionCookie(response, secureCookies) {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "strict",
    path: "/api",
  });
}

function cookieOptions(secureCookies) {
  return {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "strict",
    path: "/api",
    maxAge: SESSION_DURATION_MS,
  };
}

function toPublicStudent(student) {
  return {
    id: student.id,
    name: student.full_name,
    email: student.email,
    role: student.role ?? "student",
    college: student.college,
    course: student.course,
    branch: student.branch,
    yearOfStudy: student.year_of_study,
    interests: JSON.parse(student.interests_json),
    avatarUrl: student.avatar_webp
      ? `data:image/webp;base64,${Buffer.from(student.avatar_webp).toString("base64")}`
      : null,
    createdAt: student.created_at,
    updatedAt: student.updated_at,
  };
}

function toPublicResource(resource) {
  return {
    id: resource.id,
    title: resource.title,
    description: resource.description,
    subject: resource.subject,
    level: resource.level,
    type: resource.type,
    estimatedMinutes: resource.estimated_minutes,
    preview: resource.preview,
    language: resource.language ?? "English",
    sourceName: resource.source_name ?? "EduSphere",
    classLevel: resource.class_level ?? "Not specified",
    sourceUrl: resource.source_url ?? "",
    licenseInfo: resource.license_info ?? "Terms not specified.",
    downloadAllowed: Boolean(resource.download_allowed && resource.has_file),
    hasFile: Boolean(resource.has_file),
    sourceDirectory: Boolean(resource.source_directory),
    isDemo: Boolean(resource.is_demo),
    bookmarked: Boolean(resource.is_bookmarked),
    lastPositionSeconds: resource.last_position_seconds ?? 0,
    lastAccessedAt: resource.last_accessed_at ?? null,
    completed: Boolean(resource.completed),
    createdAt: resource.created_at,
    updatedAt: resource.updated_at,
  };
}

function toPublicAssessmentAttempt(attempt) {
  return {
    attemptId: attempt.attempt_id,
    assessmentId: attempt.assessment_id,
    startedAt: attempt.started_at,
    submittedAt: attempt.submitted_at,
    score: attempt.score,
    total: attempt.total,
    accuracy: attempt.accuracy,
    questions: JSON.parse(attempt.questions_json),
    topicResults: JSON.parse(attempt.topic_results_json),
    weakTopics: JSON.parse(attempt.weak_topics_json),
  };
}

function toPublicCourse(course) {
  const lessonCount = Number(course.lesson_count ?? 0);
  const completedLessons = Number(course.completed_lessons ?? 0);
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    subject: course.subject,
    level: course.level,
    language: course.language,
    estimatedMinutes: course.estimated_minutes,
    sourceName: course.source_name,
    licenseInfo: course.license_info,
    lessonCount,
    completedLessons,
    progressPercent: lessonCount ? Math.round(completedLessons / lessonCount * 100) : 0,
  };
}

function toPublicCourseLesson(lesson) {
  return {
    id: lesson.id,
    courseId: lesson.course_id,
    title: lesson.title,
    estimatedMinutes: lesson.estimated_minutes,
    ...JSON.parse(lesson.content_json),
    completed: Boolean(lesson.completed),
    bookmarked: Boolean(lesson.bookmarked),
    lastAccessedAt: lesson.last_accessed_at ?? null,
  };
}

function validateCourseMetadata(input, includeId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Course information must be an object." };
  }
  const fields = [
    ["title", 120], ["description", 1200], ["subject", 80], ["level", 80],
    ["language", 40], ["sourceName", 120], ["licenseInfo", 1000],
  ];
  const value = {};
  for (const [field, maximum] of fields) {
    const text = typeof input[field] === "string" ? input[field].trim() : "";
    if (!text || text.length > maximum) return { error: `${field} is required and must be at most ${maximum} characters.` };
    value[field] = text;
  }
  if (includeId) {
    if (!isSafeIdentifier(input.id)) return { error: "Course ID must contain 1–100 letters, numbers, colons, underscores, or hyphens." };
    value.id = input.id;
  }
  if (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes < 1 || input.estimatedMinutes > 10_000) {
    return { error: "Estimated course time must be a whole number between 1 and 10,000 minutes." };
  }
  if (input.isPublished !== undefined && typeof input.isPublished !== "boolean") {
    return { error: "Course publication status must be true or false." };
  }
  value.estimatedMinutes = input.estimatedMinutes;
  value.isPublished = input.isPublished ?? true;
  return { value };
}

function validateCourseLesson(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Lesson information must be an object." };
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 160) return { error: "Lesson title is required and must be at most 160 characters." };
  if (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes < 1 || input.estimatedMinutes > 600) {
    return { error: "Estimated lesson time must be a whole number between 1 and 600 minutes." };
  }
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 10_000) {
    return { error: "Lesson order must be a whole number between 0 and 10,000." };
  }
  if (input.isPublished !== undefined && typeof input.isPublished !== "boolean") {
    return { error: "Lesson publication status must be true or false." };
  }
  const content = input.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { error: "Lesson content must include learning objectives, sections, a summary, and practice questions." };
  }
  if (!isStringArray(content.objectives, 1, 10, 300) ||
      !Array.isArray(content.sections) || content.sections.length < 1 || content.sections.length > 20 ||
      !isStringArray(content.summary, 1, 15, 500) ||
      !Array.isArray(content.questions) || content.questions.length > 30) {
    return { error: "Lesson objectives, sections, summary, or questions are missing or exceed their limits." };
  }
  for (const section of content.sections) {
    if (!section || typeof section !== "object" || Array.isArray(section) ||
        typeof section.heading !== "string" || !section.heading.trim() || section.heading.length > 160 ||
        !isStringArray(section.paragraphs, 1, 12, 4000) ||
        (section.bullets !== undefined && !isStringArray(section.bullets, 1, 15, 400))) {
      return { error: "Each lesson section needs a heading and readable paragraphs; optional lists must be valid." };
    }
    if (section.example !== undefined) {
      const example = section.example;
      if (!example || typeof example !== "object" || typeof example.title !== "string" ||
          !example.title.trim() || example.title.length > 160 || !isStringArray(example.steps, 1, 12, 1000)) {
        return { error: "Worked examples need a title and one or more concise steps." };
      }
    }
  }
  const questionIds = new Set();
  for (const question of content.questions) {
    if (!question || typeof question !== "object" || Array.isArray(question) ||
        !isSafeIdentifier(question.id) || questionIds.has(question.id) ||
        typeof question.prompt !== "string" || !question.prompt.trim() || question.prompt.length > 500 ||
        !["multiple-choice", "short-answer", "true-false"].includes(question.type) ||
        typeof question.answer !== "string" || !question.answer.trim() || question.answer.length > 300 ||
        typeof question.explanation !== "string" || !question.explanation.trim() || question.explanation.length > 1200 ||
        (question.options !== undefined && !isStringArray(question.options, 2, 8, 200)) ||
        (question.type !== "short-answer" && !Array.isArray(question.options)) ||
        (Array.isArray(question.options) && !question.options.includes(question.answer))) {
      return { error: "Each practice question needs a unique ID, prompt, answer, explanation, and valid options when required." };
    }
    questionIds.add(question.id);
  }
  if (Buffer.byteLength(JSON.stringify(content), "utf8") > 80_000) {
    return { error: "Lesson content must be smaller than 80 KB." };
  }
  return {
    value: {
      title,
      estimatedMinutes: input.estimatedMinutes,
      sortOrder: input.sortOrder,
      isPublished: input.isPublished ?? true,
      content,
    },
  };
}

function isStringArray(value, minimum, maximum, maxStringLength) {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum &&
    value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= maxStringLength);
}

function processSyncOperation(database, studentId, operation, includePendingQuestions) {
  const operationId = operation && typeof operation.id === "string" ? operation.id : "";
  const operationType = operation && typeof operation.type === "string" ? operation.type : "";
  if (!/^[\w:-]{1,100}$/.test(operationId)) {
    return { operationId, status: "failed", error: "A stable operation ID is required." };
  }
  const payload = operation?.payload;
  const payloadHash = createHash("sha256").update(JSON.stringify({ type: operationType, payload, occurredAt: operation?.occurredAt })).digest("hex");
  const existing = database.prepare(`
    SELECT operation_type, payload_hash, status, error
    FROM sync_operations WHERE student_id = ? AND operation_id = ?
  `).get(studentId, operationId);
  if (existing) {
    if (existing.operation_type !== operationType || existing.payload_hash !== payloadHash) {
      return { operationId, status: "failed", error: "This operation ID was already used for different data." };
    }
    if (existing.status === "acknowledged") {
      return { operationId, status: "acknowledged", duplicate: true };
    }
  }
  if (!isValidTimestamp(operation?.occurredAt) || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return recordSyncFailure(database, studentId, operationId, operationType || "invalid", payloadHash, operation?.occurredAt, "The sync operation data is invalid.");
  }
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 10_000) {
    return recordSyncFailure(database, studentId, operationId, operationType, payloadHash, operation.occurredAt, "This sync item is too large.");
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    const outcome = applySyncOperation(database, studentId, operationId, operationType, payload, operation.occurredAt, includePendingQuestions);
    database.prepare(`
      INSERT INTO sync_operations
        (student_id, operation_id, operation_type, payload_hash, status, error, created_at, processed_at)
      VALUES (?, ?, ?, ?, 'acknowledged', '', ?, ?)
      ON CONFLICT(student_id, operation_id) DO UPDATE SET
        status = 'acknowledged',
        error = '',
        processed_at = excluded.processed_at
    `).run(studentId, operationId, operationType, payloadHash, operation.occurredAt, new Date().toISOString());
    database.exec("COMMIT");
    return { operationId, status: "acknowledged", conflict: outcome.conflict ?? null, note: outcome.note ?? null };
  } catch (error) {
    database.exec("ROLLBACK");
    const message = error instanceof SyncOperationError
      ? error.message
      : "The sync operation could not be saved. Please retry; the local copy has been retained.";
    return recordSyncFailure(database, studentId, operationId, operationType, payloadHash, operation.occurredAt, message);
  }
}

class SyncOperationError extends Error {}

function applySyncOperation(database, studentId, operationId, type, payload, occurredAt, includePendingQuestions) {
  if (type === "resource.bookmark") {
    if (!isSafeIdentifier(payload.resourceId) || typeof payload.bookmarked !== "boolean" || !findResource(database, payload.resourceId)) {
      throw new SyncOperationError("The resource bookmark is invalid or its resource is no longer available.");
    }
    const current = database.prepare(`
      SELECT bookmarked, updated_at FROM resource_bookmarks WHERE student_id = ? AND resource_id = ?
    `).get(studentId, payload.resourceId);
    if (current?.updated_at && timestampMilliseconds(current.updated_at) > timestampMilliseconds(occurredAt)) {
      return { conflict: "server-newer", note: "A newer server bookmark change was kept." };
    }
    database.prepare(`
      INSERT INTO resource_bookmarks (student_id, resource_id, created_at, bookmarked, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(student_id, resource_id) DO UPDATE SET
        bookmarked = excluded.bookmarked,
        updated_at = excluded.updated_at
    `).run(studentId, payload.resourceId, occurredAt, Number(payload.bookmarked), occurredAt);
    return {};
  }

  if (type === "resource.progress") {
    const position = payload.lastPositionSeconds;
    if (!isSafeIdentifier(payload.resourceId) || !Number.isInteger(position) || position < 0 || position > 86_400 ||
        typeof payload.completed !== "boolean" || !findResource(database, payload.resourceId)) {
      throw new SyncOperationError("The resource progress update is invalid or its resource is no longer available.");
    }
    const current = database.prepare(`
      SELECT updated_at FROM resource_progress WHERE student_id = ? AND resource_id = ?
    `).get(studentId, payload.resourceId);
    if (current?.updated_at && timestampMilliseconds(current.updated_at) > timestampMilliseconds(occurredAt)) {
      return { conflict: "server-newer", note: "A newer server progress update was kept." };
    }
    database.prepare(`
      INSERT INTO resource_progress
        (student_id, resource_id, last_position_seconds, last_accessed_at, completed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, resource_id) DO UPDATE SET
        last_position_seconds = excluded.last_position_seconds,
        last_accessed_at = excluded.last_accessed_at,
        completed = excluded.completed,
        updated_at = excluded.updated_at
    `).run(studentId, payload.resourceId, position, occurredAt, Number(payload.completed), occurredAt);
    return {};
  }

  if (type === "skill.activity") {
    if (!isSafeIdentifier(payload.skillId) || !isSafeIdentifier(payload.lessonId) ||
        !["lesson-started", "lesson-completed", "exercise-completed"].includes(payload.actionType)) {
      throw new SyncOperationError("The skill learning activity is invalid.");
    }
    database.prepare(`
      INSERT OR IGNORE INTO skill_activity
        (student_id, action_id, skill_id, lesson_id, action_type, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(studentId, payload.actionId ?? "", payload.skillId, payload.lessonId, payload.actionType, occurredAt);
    return {};
  }

  if (type === "course.lesson") {
    const courseId = payload.courseId;
    const lessonId = payload.lessonId;
    if (!isSafeIdentifier(courseId) || !isSafeIdentifier(lessonId) ||
        typeof payload.completed !== "boolean" || typeof payload.bookmarked !== "boolean") {
      throw new SyncOperationError("The course lesson progress update is invalid.");
    }
    const lesson = database.prepare(`
      SELECT course_lessons.id
      FROM course_lessons
      JOIN courses ON courses.id = course_lessons.course_id
      WHERE course_lessons.id = ? AND course_lessons.course_id = ?
    `).get(lessonId, courseId);
    if (!lesson) throw new SyncOperationError("This course lesson is no longer available for synchronization.");

    const current = database.prepare(`
      SELECT updated_at FROM course_lesson_progress
      WHERE student_id = ? AND lesson_id = ?
    `).get(studentId, lessonId);
    if (current?.updated_at && timestampMilliseconds(current.updated_at) > timestampMilliseconds(occurredAt)) {
      return { conflict: "server-newer", note: "A newer server lesson progress update was kept." };
    }
    database.prepare(`
      INSERT INTO course_lesson_progress
        (student_id, lesson_id, course_id, completed, bookmarked, last_accessed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, lesson_id) DO UPDATE SET
        course_id = excluded.course_id,
        completed = excluded.completed,
        bookmarked = excluded.bookmarked,
        last_accessed_at = excluded.last_accessed_at,
        updated_at = excluded.updated_at
    `).run(studentId, lessonId, courseId, Number(payload.completed), Number(payload.bookmarked), occurredAt, occurredAt);
    return {};
  }

  if (type === "profile.update") {
    const { errors, value } = validateProfile(payload.profile);
    if (Object.keys(errors).length || !isValidTimestamp(payload.baseUpdatedAt)) {
      throw new SyncOperationError("The saved profile update is invalid. Review the profile fields and try again.");
    }
    const current = getStudent(database, studentId);
    if (timestampMilliseconds(current.updated_at) > timestampMilliseconds(payload.baseUpdatedAt)) {
      throw new SyncOperationError("Your profile changed on another device. Refresh it before retrying this update.");
    }
    database.prepare(`
      UPDATE students SET full_name = ?, college = ?, course = ?, branch = ?, year_of_study = ?,
        interests_json = ?, updated_at = ?
      WHERE id = ?
    `).run(value.name, value.college, value.course, value.branch, value.yearOfStudy, JSON.stringify(value.interests), occurredAt, studentId);
    return {};
  }

  if (type === "ai.question") {
    if (!includePendingQuestions) throw new SyncOperationError("The student has not consented to upload pending questions.");
    const question = typeof payload.question === "string" ? payload.question.trim() : "";
    const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
    const mode = payload.mode;
    if (question.length < 2 || question.length > 2000 || subject.length > 50 ||
        !["simple", "step-by-step"].includes(mode) || payload.requestId !== operationId) {
      throw new SyncOperationError("The pending doubt request is invalid.");
    }
    database.prepare(`
      INSERT OR IGNORE INTO ai_doubt_requests (student_id, request_id, question, subject, mode, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(studentId, operationId, question, subject || "General", mode, occurredAt);
    return { note: "Question securely queued for staff follow-up; this does not generate an AI answer." };
  }

  throw new SyncOperationError("This sync operation type is not supported.");
}

function recordSyncFailure(database, studentId, operationId, operationType, payloadHash, occurredAt, message) {
  if (operationId && /^[\w:-]{1,100}$/.test(operationId)) {
    database.prepare(`
      INSERT OR IGNORE INTO sync_operations
        (student_id, operation_id, operation_type, payload_hash, status, error, created_at, processed_at)
      VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)
      ON CONFLICT(student_id, operation_id) DO UPDATE SET
        status = 'failed',
        error = excluded.error,
        processed_at = excluded.processed_at
    `).run(studentId, operationId, operationType, payloadHash, message.slice(0, 300), isValidTimestamp(occurredAt) ? occurredAt : new Date().toISOString(), new Date().toISOString());
  }
  return { operationId, status: "failed", error: message };
}

function isSafeIdentifier(value) {
  return typeof value === "string" && /^[a-zA-Z0-9:_-]{1,100}$/.test(value);
}

function isValidTimestamp(value) {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(timestampMilliseconds(value));
}

function timestampMilliseconds(value) {
  const withUtcZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return Date.parse(withUtcZone);
}

function findResource(database, resourceId) {
  return database.prepare(`
    SELECT resources.*, EXISTS (SELECT 1 FROM resource_files WHERE resource_files.resource_id = resources.id) AS has_file
    FROM resources WHERE id = ?
  `).get(resourceId);
}

function safeDownloadName(value) {
  const name = String(value ?? "learning-resource.pdf")
    .replace(/[\\/"\r\n]/g, "_")
    .replace(/[^\w .()-]/g, "_")
    .trim()
    .slice(0, 120);
  return name.toLowerCase().endsWith(".pdf") ? name : `${name || "learning-resource"}.pdf`;
}

function parseAdminEmails(value) {
  if (!value) return new Set();
  return new Set(value.split(",").map((email) => normalizeEmail(email)).filter(Boolean));
}

function readQueryValue(value, maximumLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maximumLength);
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function getStudent(database, studentId) {
  return database.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
}

function readCookie(header, cookieName) {
  if (!header) {
    return "";
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === cookieName) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return "";
      }
    }
  }

  return "";
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function isUniqueConstraint(error) {
  return error?.code === "SQLITE_CONSTRAINT_UNIQUE"
    || error?.errcode === 2067
    || error?.message?.includes("UNIQUE constraint failed: students.email");
}
