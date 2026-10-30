import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { demoResources, trustedSourceResources } from "./resource-data.js";
import courseCatalog from "../../shared/course-catalog.json" with { type: "json" };

export function createDatabase(databasePath = process.env.AUTH_DB_PATH ?? "backend/data/edusphere.sqlite") {
  const resolvedPath = databasePath === ":memory:" ? databasePath : resolve(databasePath);

  if (resolvedPath !== ":memory:") {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }

  const database = new DatabaseSync(resolvedPath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      college TEXT NOT NULL DEFAULT '',
      course TEXT NOT NULL DEFAULT '',
      branch TEXT NOT NULL DEFAULT '',
      year_of_study TEXT NOT NULL DEFAULT '',
      interests_json TEXT NOT NULL DEFAULT '[]',
      avatar_webp BLOB,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      subject TEXT NOT NULL,
      level TEXT NOT NULL,
      type TEXT NOT NULL,
      estimated_minutes INTEGER NOT NULL,
      preview TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'English',
      class_level TEXT NOT NULL DEFAULT 'Not specified',
      source_name TEXT NOT NULL DEFAULT 'EduSphere',
      source_url TEXT NOT NULL DEFAULT '',
      license_info TEXT NOT NULL DEFAULT 'EduSphere demo material',
      download_allowed INTEGER NOT NULL DEFAULT 0,
      source_directory INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_by TEXT REFERENCES students(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resource_bookmarks (
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      bookmarked INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (student_id, resource_id)
    );

    CREATE TABLE IF NOT EXISTS resource_files (
      resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL CHECK (content_type = 'application/pdf'),
      data BLOB NOT NULL,
      byte_length INTEGER NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resource_progress (
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      last_position_seconds INTEGER NOT NULL DEFAULT 0,
      last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (student_id, resource_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_attempts (
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attempt_id TEXT NOT NULL,
      assessment_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      accuracy INTEGER NOT NULL,
      questions_json TEXT NOT NULL,
      topic_results_json TEXT NOT NULL,
      weak_topics_json TEXT NOT NULL,
      PRIMARY KEY (student_id, attempt_id)
    );

    CREATE TABLE IF NOT EXISTS skill_activity (
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      action_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      action_type TEXT NOT NULL CHECK (action_type IN ('lesson-started', 'lesson-completed', 'exercise-completed')),
      occurred_at TEXT NOT NULL,
      PRIMARY KEY (student_id, action_id)
    );

    CREATE TABLE IF NOT EXISTS sync_operations (
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('acknowledged', 'failed')),
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (student_id, operation_id)
    );

    CREATE TABLE IF NOT EXISTS sync_sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      operation_count INTEGER NOT NULL,
      acknowledged_count INTEGER NOT NULL,
      failed_count INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_doubt_requests (
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      question TEXT NOT NULL,
      subject TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('simple', 'step-by-step')),
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'answered', 'failed')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (student_id, request_id)
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      subject TEXT NOT NULL,
      level TEXT NOT NULL,
      language TEXT NOT NULL,
      estimated_minutes INTEGER NOT NULL,
      source_name TEXT NOT NULL,
      license_info TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS course_lessons (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      estimated_minutes INTEGER NOT NULL,
      content_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS course_lesson_progress (
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      completed INTEGER NOT NULL DEFAULT 0,
      bookmarked INTEGER NOT NULL DEFAULT 0,
      last_accessed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (student_id, lesson_id)
    );

    CREATE INDEX IF NOT EXISTS sessions_student_id_idx ON sessions(student_id);
    CREATE INDEX IF NOT EXISTS password_reset_expiry_idx ON password_reset_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS resources_category_idx ON resources(subject, type);
    CREATE INDEX IF NOT EXISTS resource_progress_student_idx ON resource_progress(student_id, last_accessed_at DESC);
    CREATE INDEX IF NOT EXISTS assessment_attempts_student_idx ON assessment_attempts(student_id, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS skill_activity_student_idx ON skill_activity(student_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS sync_operations_student_idx ON sync_operations(student_id, processed_at DESC);
    CREATE INDEX IF NOT EXISTS sync_sessions_student_idx ON sync_sessions(student_id, completed_at DESC);
    CREATE INDEX IF NOT EXISTS ai_doubt_requests_status_idx ON ai_doubt_requests(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS course_lessons_course_idx ON course_lessons(course_id, sort_order);
    CREATE INDEX IF NOT EXISTS course_lesson_progress_student_idx ON course_lesson_progress(student_id, course_id, updated_at DESC);
  `);

  addColumnIfMissing(database, "students", "role", "TEXT NOT NULL DEFAULT 'student'");
  addColumnIfMissing(database, "resource_bookmarks", "bookmarked", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(database, "resource_bookmarks", "updated_at", "TEXT NOT NULL DEFAULT ''");
  database.exec("UPDATE resource_bookmarks SET updated_at = created_at WHERE updated_at = ''");
  addColumnIfMissing(database, "resource_progress", "updated_at", "TEXT NOT NULL DEFAULT ''");
  database.exec("UPDATE resource_progress SET updated_at = last_accessed_at WHERE updated_at = ''");
  addColumnIfMissing(database, "resources", "language", "TEXT NOT NULL DEFAULT 'English'");
  addColumnIfMissing(database, "resources", "class_level", "TEXT NOT NULL DEFAULT 'Not specified'");
  addColumnIfMissing(database, "resources", "source_name", "TEXT NOT NULL DEFAULT 'EduSphere'");
  addColumnIfMissing(database, "resources", "source_url", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(database, "resources", "license_info", "TEXT NOT NULL DEFAULT 'EduSphere demo material'");
  addColumnIfMissing(database, "resources", "download_allowed", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(database, "resources", "source_directory", "INTEGER NOT NULL DEFAULT 0");
  database.exec("UPDATE resources SET subject = 'Digital Skills' WHERE subject = 'Technical Skills'");
  seedDemoResources(database);
  seedTrustedSourceResources(database);
  seedLearningCourses(database);

  return database;
}

function seedLearningCourses(database) {
  const insertCourse = database.prepare(`
    INSERT OR IGNORE INTO courses
      (id, title, description, subject, level, language, estimated_minutes, source_name, license_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLesson = database.prepare(`
    INSERT OR IGNORE INTO course_lessons
      (id, course_id, title, estimated_minutes, content_json, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const course of courseCatalog) {
    insertCourse.run(
      course.id,
      course.title,
      course.description,
      course.subject,
      course.level,
      course.language,
      course.estimatedMinutes,
      course.sourceName,
      course.licenseInfo,
    );
    course.chapters.forEach((lesson, index) => {
      const { id, title, estimatedMinutes, ...content } = lesson;
      insertLesson.run(id, course.id, title, estimatedMinutes, JSON.stringify(content), index);
    });
  }
}

function addColumnIfMissing(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedDemoResources(database) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO resources
      (id, title, description, subject, level, type, estimated_minutes, preview, language, source_name, source_url, license_info, download_allowed, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'English', 'EduSphere demo', '', 'Original sample text for demonstration; not a third-party source file.', 0, 1)
  `);

  for (const [index, resource] of demoResources.entries()) {
    insert.run(
      `demo-${String(index + 1).padStart(3, "0")}`,
      resource.title,
      resource.description,
      resource.subject,
      resource.level,
      resource.type,
      resource.estimatedMinutes,
      resource.preview,
    );
  }
}

function seedTrustedSourceResources(database) {
  const insert = database.prepare(`
    INSERT INTO resources
      (id, title, description, subject, level, type, estimated_minutes, preview, language,
        class_level, source_name, source_url, license_info, download_allowed, source_directory, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      subject = excluded.subject,
      level = excluded.level,
      type = excluded.type,
      estimated_minutes = excluded.estimated_minutes,
      preview = excluded.preview,
      language = excluded.language,
      class_level = excluded.class_level,
      source_name = excluded.source_name,
      source_url = excluded.source_url,
      license_info = excluded.license_info
    WHERE resources.source_directory = 1
  `);
  for (const resource of trustedSourceResources) {
    insert.run(
      resource.id,
      resource.title,
      resource.description,
      resource.subject,
      resource.level,
      resource.type,
      resource.estimatedMinutes,
      resource.preview,
      resource.language,
      resource.classLevel,
      resource.sourceName,
      resource.sourceUrl,
      resource.licenseInfo,
    );
  }
}
