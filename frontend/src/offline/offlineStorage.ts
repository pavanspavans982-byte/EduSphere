import type { CourseBundle, CourseLesson, LearningResource } from "../auth/api";

export type OfflineResource = {
  key: string;
  studentId: string;
  resource: LearningResource;
  cachedAt: string;
  download: Blob;
  fileName: string;
  contentLabel: string;
  downloadBytes: number;
};

export async function createOfflinePreview(resource: LearningResource) {
  const fileLabel = resource.type === "video" || resource.type === "audio"
    ? `${resourceTypeName(resource.type)} text preview only; no playable media file was supplied.\n\n`
    : "";
  const contents = `${resource.title}\n${resource.subject} · ${resource.level} · ${resource.language} · ${resource.estimatedMinutes || "Not specified"} minutes\nSource: ${resource.sourceName}${resource.sourceUrl ? ` (${resource.sourceUrl})` : ""}\n\n${resource.description}\n\n${fileLabel}${resource.preview}\n\nEduSphere sample text preview. This is not the original source file or media.`;
  return {
    blob: new Blob([contents], { type: "text/plain;charset=utf-8" }),
    fileName: `${safeFileName(resource.title)}-sample-preview.txt`,
    contentLabel: resource.type === "audio" || resource.type === "video"
      ? "Sample text only · no playable media file supplied"
      : "Sample text preview · not the original source file",
  };
}

export type OfflineBookmark = {
  key: string;
  studentId: string;
  resourceId: string;
  bookmarked: boolean;
  updatedAt: string;
};

export type OfflineProgress = {
  key: string;
  studentId: string;
  resourceId: string;
  lastPositionSeconds: number;
  completed: boolean;
  lastAccessedAt: string;
  updatedAt: string;
};

export type OfflineOperation = {
  id: string;
  studentId: string;
  resourceId: string;
  type: "progress" | "bookmark";
  payload: Record<string, unknown>;
  createdAt: string;
};

export type CachedCourseBundle = CourseBundle & {
  key: string;
  studentId: string;
  cachedAt: string;
};

export type CourseLessonProgress = {
  key: string;
  studentId: string;
  courseId: string;
  lessonId: string;
  completed: boolean;
  bookmarked: boolean;
  lastAccessedAt: string;
  updatedAt: string;
};

export type PendingCourseOperation = {
  id: string;
  studentId: string;
  courseId: string;
  lessonId: string;
  type: "course.lesson";
  payload: Pick<CourseLessonProgress, "courseId" | "lessonId" | "completed" | "bookmarked">;
  createdAt: string;
};

const DATABASE_NAME = "edusphere-offline-learning";
const DATABASE_VERSION = 3;
const STORES = {
  resources: "resources",
  bookmarks: "bookmarks",
  progress: "progress",
  outbox: "outbox",
  courseBundles: "courseBundles",
  courseProgress: "courseProgress",
  courseOutbox: "courseOutbox",
} as const;

let openingDatabase: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (!("indexedDB" in globalThis)) {
    return Promise.reject(new Error("This browser does not support offline storage."));
  }
  if (openingDatabase) return openingDatabase;

  openingDatabase = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORES.resources)) {
        const resources = database.createObjectStore(STORES.resources, { keyPath: "key" });
        resources.createIndex("studentId", "studentId", { unique: false });
        resources.createIndex("studentSubject", ["studentId", "resource.subject"], { unique: false });
      }
      if (!database.objectStoreNames.contains(STORES.bookmarks)) {
        const bookmarks = database.createObjectStore(STORES.bookmarks, { keyPath: "key" });
        bookmarks.createIndex("studentId", "studentId", { unique: false });
      }
      if (!database.objectStoreNames.contains(STORES.progress)) {
        const progress = database.createObjectStore(STORES.progress, { keyPath: "key" });
        progress.createIndex("studentId", "studentId", { unique: false });
      }
      if (!database.objectStoreNames.contains(STORES.outbox)) {
        const outbox = database.createObjectStore(STORES.outbox, { keyPath: "id" });
        outbox.createIndex("studentId", "studentId", { unique: false });
      }
      if (!database.objectStoreNames.contains(STORES.courseBundles)) {
        const bundles = database.createObjectStore(STORES.courseBundles, { keyPath: "key" });
        bundles.createIndex("studentId", "studentId", { unique: false });
      }
      if (!database.objectStoreNames.contains(STORES.courseProgress)) {
        const courseProgress = database.createObjectStore(STORES.courseProgress, { keyPath: "key" });
        courseProgress.createIndex("studentId", "studentId", { unique: false });
        courseProgress.createIndex("studentCourse", ["studentId", "courseId"], { unique: false });
      }
      if (!database.objectStoreNames.contains(STORES.courseOutbox)) {
        const courseOutbox = database.createObjectStore(STORES.courseOutbox, { keyPath: "id" });
        courseOutbox.createIndex("studentId", "studentId", { unique: false });
      }
      if (event.oldVersion < 2) {
        const upgradeTransaction = request.transaction;
        if (!upgradeTransaction) throw new Error("Offline resource storage could not be upgraded.");
        const cursorRequest = upgradeTransaction.objectStore(STORES.resources).openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const entry = cursor.value as OfflineResource;
          if (entry.resource) {
            const resource = entry.resource;
            cursor.update({
              ...entry,
              resource: {
                ...resource,
                subject: resource.subject === "Technical Skills" ? "Digital Skills" : resource.subject,
                language: resource.language || "English",
                sourceName: resource.sourceName || "EduSphere",
                sourceUrl: resource.sourceUrl || "",
                licenseInfo: resource.licenseInfo || "Legacy EduSphere sample; no third-party source license recorded.",
                downloadAllowed: Boolean(resource.downloadAllowed),
                hasFile: Boolean(resource.hasFile),
                sourceDirectory: Boolean(resource.sourceDirectory),
              },
            });
          }
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      openingDatabase = null;
      reject(request.error ?? new Error("Offline storage could not be opened."));
    };
    request.onblocked = () => {
      openingDatabase = null;
      reject(new Error("Another EduSphere tab is preventing offline storage from opening."));
    };
  });

  return openingDatabase;
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline data could not be saved."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline data could not be saved."));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline data could not be read."));
  });
}

function keyFor(studentId: string, resourceId: string) {
  return `${studentId}:${resourceId}`;
}

function isQuotaError(error: unknown) {
  return error instanceof DOMException && (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED"
  );
}

export async function estimateOfflineStorage(additionalBytes = 0) {
  if (!navigator.storage?.estimate) return;
  const { usage = 0, quota } = await navigator.storage.estimate();
  if (quota && usage + additionalBytes > quota * 0.9) {
    throw new Error("This device is running low on browser storage. Remove an old download or free up space before saving this resource.");
  }
}

export async function cacheResourceMetadata(studentId: string, resources: LearningResource[]) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.resources, "readwrite");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(STORES.resources);
  for (const resource of resources) {
    const key = keyFor(studentId, resource.id);
    const existing = await requestResult<OfflineResource | undefined>(store.get(key));
    if (existing) {
      store.put({
        ...existing,
        resource: { ...resource, lastPositionSeconds: existing.resource.lastPositionSeconds, lastAccessedAt: existing.resource.lastAccessedAt, completed: existing.resource.completed },
      });
    } else {
      const entry: OfflineResource = {
        key,
        studentId,
        resource,
        cachedAt: new Date().toISOString(),
        download: new Blob([resource.preview], { type: "text/plain;charset=utf-8" }),
        fileName: `${safeFileName(resource.title)}-preview.txt`,
        contentLabel: "Online preview only",
        downloadBytes: 0,
      };
      store.put(entry);
    }
  }
  await completion;
}

export async function getCachedResource(studentId: string, resourceId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.resources, "readonly");
  const completion = transactionComplete(transaction);
  const result = await requestResult<OfflineResource | undefined>(
    transaction.objectStore(STORES.resources).get(keyFor(studentId, resourceId)),
  );
  await completion;
  return result ?? null;
}

export async function listCachedResources(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.resources, "readonly");
  const completion = transactionComplete(transaction);
  const result = await requestResult<OfflineResource[]>(
    transaction.objectStore(STORES.resources).index("studentId").getAll(IDBKeyRange.only(studentId)),
  );
  await completion;
  return result.sort((left, right) => left.resource.title.localeCompare(right.resource.title));
}

export async function storeOfflineResource(entry: OfflineResource) {
  const database = await openDatabase();
  try {
    await estimateOfflineStorage(entry.downloadBytes);
    const transaction = database.transaction(STORES.resources, "readwrite");
    const completion = transactionComplete(transaction);
    transaction.objectStore(STORES.resources).put({ ...entry, key: keyFor(entry.studentId, entry.resource.id) });
    await completion;
  } catch (error) {
    if (isQuotaError(error)) {
      throw new Error("There is not enough browser storage for this download. Remove another saved resource or free up device space.");
    }
    throw error;
  }
}

export async function removeOfflineResource(studentId: string, resourceId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.resources, "readwrite");
  const completion = transactionComplete(transaction);
  transaction.objectStore(STORES.resources).delete(keyFor(studentId, resourceId));
  await completion;
}

export async function listOfflineBookmarks(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.bookmarks, STORES.resources], "readonly");
  const completion = transactionComplete(transaction);
  const bookmarkRequest = transaction.objectStore(STORES.bookmarks).index("studentId").getAll(IDBKeyRange.only(studentId));
  const resourceStore = transaction.objectStore(STORES.resources);
  const bookmarks = await requestResult<OfflineBookmark[]>(bookmarkRequest);
  const entries = await Promise.all(bookmarks.filter((bookmark) => bookmark.bookmarked).map(async (bookmark) =>
    requestResult<OfflineResource | undefined>(resourceStore.get(keyFor(studentId, bookmark.resourceId))),
  ));
  await completion;
  return entries
    .filter((entry): entry is OfflineResource => Boolean(entry))
    .map((entry) => ({ ...entry, resource: { ...entry.resource, bookmarked: true } }));
}

export async function saveBookmarkLocally(studentId: string, resource: LearningResource, bookmarked: boolean) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.resources, STORES.bookmarks, STORES.outbox], "readwrite");
  const completion = transactionComplete(transaction);
  const resourceStore = transaction.objectStore(STORES.resources);
  const key = keyFor(studentId, resource.id);
  const existing = await requestResult<OfflineResource | undefined>(resourceStore.get(key));
  const entry: OfflineResource = existing ?? {
    key,
    studentId,
    resource,
    cachedAt: new Date().toISOString(),
    download: new Blob([resource.preview], { type: "text/plain;charset=utf-8" }),
    fileName: `${safeFileName(resource.title)}-preview.txt`,
    contentLabel: "Online preview only",
    downloadBytes: 0,
  };
  resourceStore.put({ ...entry, resource: { ...resource, bookmarked } });
  transaction.objectStore(STORES.bookmarks).put({
    key,
    studentId,
    resourceId: resource.id,
    bookmarked,
    updatedAt: new Date().toISOString(),
  } satisfies OfflineBookmark);
  putOutboxOperation(transaction.objectStore(STORES.outbox), studentId, resource.id, "bookmark", { bookmarked });
  await completion;
}

export async function getLocalBookmark(studentId: string, resourceId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.bookmarks, "readonly");
  const completion = transactionComplete(transaction);
  const result = await requestResult<OfflineBookmark | undefined>(
    transaction.objectStore(STORES.bookmarks).get(keyFor(studentId, resourceId)),
  );
  await completion;
  return result?.bookmarked ?? null;
}

export async function saveProgressLocally(
  studentId: string,
  resource: LearningResource,
  lastPositionSeconds: number,
  completed: boolean,
) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.resources, STORES.progress, STORES.outbox], "readwrite");
  const completionPromise = transactionComplete(transaction);
  const key = keyFor(studentId, resource.id);
  const resourceStore = transaction.objectStore(STORES.resources);
  const existing = await requestResult<OfflineResource | undefined>(resourceStore.get(key));
  const entry: OfflineResource = existing ?? {
    key,
    studentId,
    resource,
    cachedAt: new Date().toISOString(),
    download: new Blob([resource.preview], { type: "text/plain;charset=utf-8" }),
    fileName: `${safeFileName(resource.title)}-preview.txt`,
    contentLabel: "Online preview only",
    downloadBytes: 0,
  };
  const now = new Date().toISOString();
  resourceStore.put({ ...entry, resource: { ...resource, lastPositionSeconds, completed, lastAccessedAt: now } });
  transaction.objectStore(STORES.progress).put({
    key,
    studentId,
    resourceId: resource.id,
    lastPositionSeconds,
    completed,
    lastAccessedAt: now,
    updatedAt: now,
  } satisfies OfflineProgress);
  putOutboxOperation(transaction.objectStore(STORES.outbox), studentId, resource.id, "progress", { lastPositionSeconds, completed });
  await completionPromise;
}

export async function listOfflineProgress(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.progress, STORES.resources], "readonly");
  const completion = transactionComplete(transaction);
  const records = await requestResult<OfflineProgress[]>(
    transaction.objectStore(STORES.progress).index("studentId").getAll(IDBKeyRange.only(studentId)),
  );
  const resourceStore = transaction.objectStore(STORES.resources);
  const entries = await Promise.all(records.map(async (progress) => ({
    progress,
    entry: await requestResult<OfflineResource | undefined>(resourceStore.get(keyFor(studentId, progress.resourceId))),
  })));
  await completion;
  return entries
    .filter((item): item is { progress: OfflineProgress; entry: OfflineResource } => Boolean(item.entry))
    .map(({ progress, entry }) => ({
      ...entry,
      resource: {
        ...entry.resource,
        lastPositionSeconds: progress.lastPositionSeconds,
        completed: progress.completed,
        lastAccessedAt: progress.lastAccessedAt,
      },
    }))
    .sort((left, right) => (right.resource.lastAccessedAt ?? "").localeCompare(left.resource.lastAccessedAt ?? ""));
}

export async function listPendingOfflineOperations(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.outbox, "readonly");
  const completion = transactionComplete(transaction);
  const result = await requestResult<OfflineOperation[]>(
    transaction.objectStore(STORES.outbox).index("studentId").getAll(IDBKeyRange.only(studentId)),
  );
  await completion;
  return result.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function mergeServerResourceActivity(
  studentId: string,
  activity: { saved: LearningResource[]; recent: LearningResource[] },
) {
  const cached = await listCachedResources(studentId);
  const byId = new Map(cached.map((entry) => [entry.resource.id, entry]));
  const savedIds = new Set(activity.saved.map((resource) => resource.id));
  const progressById = new Map(activity.recent.map((resource) => [resource.id, resource]));
  const transaction = (await openDatabase()).transaction([STORES.resources, STORES.bookmarks, STORES.progress], "readwrite");
  const done = transactionComplete(transaction);
  const resourceStore = transaction.objectStore(STORES.resources);
  const bookmarkStore = transaction.objectStore(STORES.bookmarks);
  const progressStore = transaction.objectStore(STORES.progress);

  for (const [resourceId, existing] of byId) {
    const remoteProgress = progressById.get(resourceId);
    const bookmarked = savedIds.has(resourceId);
    const resource = {
      ...existing.resource,
      bookmarked,
      ...(remoteProgress ? {
        lastPositionSeconds: remoteProgress.lastPositionSeconds,
        completed: remoteProgress.completed,
        lastAccessedAt: remoteProgress.lastAccessedAt,
      } : {}),
    };
    resourceStore.put({ ...existing, resource });
    bookmarkStore.put({
      key: keyFor(studentId, resourceId),
      studentId,
      resourceId,
      bookmarked,
      updatedAt: new Date().toISOString(),
    } satisfies OfflineBookmark);
    if (remoteProgress) {
      progressStore.put({
        key: keyFor(studentId, resourceId),
        studentId,
        resourceId,
        lastPositionSeconds: remoteProgress.lastPositionSeconds,
        completed: remoteProgress.completed,
        lastAccessedAt: remoteProgress.lastAccessedAt ?? new Date().toISOString(),
        updatedAt: remoteProgress.updatedAt ?? remoteProgress.lastAccessedAt ?? new Date().toISOString(),
      } satisfies OfflineProgress);
    }
  }
  await done;
}

export async function acknowledgeOfflineOperation(operationId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.outbox, "readwrite");
  const completion = transactionComplete(transaction);
  transaction.objectStore(STORES.outbox).delete(operationId);
  await completion;
}

export async function cacheCourseBundle(studentId: string, bundle: CourseBundle) {
  const progress = await listCourseProgress(studentId, bundle.course.id);
  const progressByLesson = new Map(progress.map((entry) => [entry.lessonId, entry]));
  const lessons = bundle.lessons.map((lesson) => {
    const local = progressByLesson.get(lesson.id);
    if (!local || (lesson.lastAccessedAt && local.updatedAt <= lesson.lastAccessedAt)) return lesson;
    return {
      ...lesson,
      completed: local.completed,
      bookmarked: local.bookmarked,
      lastAccessedAt: local.lastAccessedAt,
    };
  });
  const database = await openDatabase();
  const transaction = database.transaction(STORES.courseBundles, "readwrite");
  const completion = transactionComplete(transaction);
  transaction.objectStore(STORES.courseBundles).put({
    ...bundle,
    lessons,
    key: `${studentId}:${bundle.course.id}`,
    studentId,
    cachedAt: new Date().toISOString(),
  } satisfies CachedCourseBundle);
  await completion;
}

export async function getCachedCourseBundle(studentId: string, courseId: string) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.courseBundles, STORES.courseProgress], "readonly");
  const completion = transactionComplete(transaction);
  const bundle = await requestResult<CachedCourseBundle | undefined>(
    transaction.objectStore(STORES.courseBundles).get(`${studentId}:${courseId}`),
  );
  if (!bundle) {
    await completion;
    return null;
  }
  const progress = await requestResult<CourseLessonProgress[]>(
    transaction.objectStore(STORES.courseProgress).index("studentCourse")
      .getAll(IDBKeyRange.only([studentId, courseId])),
  );
  await completion;
  const progressByLesson = new Map(progress.map((entry) => [entry.lessonId, entry]));
  const lessons = bundle.lessons.map((lesson) => {
    const local = progressByLesson.get(lesson.id);
    if (!local || (lesson.lastAccessedAt && local.updatedAt <= lesson.lastAccessedAt)) return lesson;
    return { ...lesson, completed: local.completed, bookmarked: local.bookmarked, lastAccessedAt: local.lastAccessedAt };
  });
  return { course: bundle.course, lessons };
}

export async function listCachedCourseBundles(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.courseBundles, "readonly");
  const completion = transactionComplete(transaction);
  const bundles = await requestResult<CachedCourseBundle[]>(
    transaction.objectStore(STORES.courseBundles).index("studentId").getAll(IDBKeyRange.only(studentId)),
  );
  await completion;
  return bundles.sort((left, right) => left.course.title.localeCompare(right.course.title));
}

export async function listCourseProgress(studentId: string, courseId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.courseProgress, "readonly");
  const completion = transactionComplete(transaction);
  const records = await requestResult<CourseLessonProgress[]>(
    transaction.objectStore(STORES.courseProgress).index("studentCourse")
      .getAll(IDBKeyRange.only([studentId, courseId])),
  );
  await completion;
  return records;
}

export async function saveCourseLessonProgress(
  studentId: string,
  courseId: string,
  lesson: Pick<CourseLesson, "id">,
  update: Partial<Pick<CourseLessonProgress, "completed" | "bookmarked">> = {},
) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.courseProgress, STORES.courseOutbox], "readwrite");
  const completion = transactionComplete(transaction);
  const progressStore = transaction.objectStore(STORES.courseProgress);
  const key = `${studentId}:${lesson.id}`;
  const previous = await requestResult<CourseLessonProgress | undefined>(progressStore.get(key));
  const now = new Date().toISOString();
  const progress: CourseLessonProgress = {
    key,
    studentId,
    courseId,
    lessonId: lesson.id,
    completed: update.completed ?? previous?.completed ?? false,
    bookmarked: update.bookmarked ?? previous?.bookmarked ?? false,
    lastAccessedAt: now,
    updatedAt: now,
  };
  progressStore.put(progress);
  const operation: PendingCourseOperation = {
    id: crypto.randomUUID(),
    studentId,
    courseId,
    lessonId: lesson.id,
    type: "course.lesson",
    payload: {
      courseId,
      lessonId: lesson.id,
      completed: progress.completed,
      bookmarked: progress.bookmarked,
    },
    createdAt: now,
  };
  transaction.objectStore(STORES.courseOutbox).put(operation);
  await completion;
}

export async function listPendingCourseOperations(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.courseOutbox, "readonly");
  const completion = transactionComplete(transaction);
  const operations = await requestResult<PendingCourseOperation[]>(
    transaction.objectStore(STORES.courseOutbox).index("studentId").getAll(IDBKeyRange.only(studentId)),
  );
  await completion;
  return operations.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function acknowledgeCourseOperation(operationId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.courseOutbox, "readwrite");
  const completion = transactionComplete(transaction);
  transaction.objectStore(STORES.courseOutbox).delete(operationId);
  await completion;
}

function putOutboxOperation(
  store: IDBObjectStore,
  studentId: string,
  resourceId: string,
  type: OfflineOperation["type"],
  payload: Record<string, unknown>,
) {
  const id = crypto.randomUUID();
  store.put({ id, studentId, resourceId, type, payload, createdAt: new Date().toISOString() } satisfies OfflineOperation);
}

function safeFileName(value: string) {
  const result = value.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return result || "edusphere-resource";
}

function resourceTypeName(type: LearningResource["type"]) {
  return type === "video" ? "Video" : "Audio";
}
