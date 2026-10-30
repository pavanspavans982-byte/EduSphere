export type SkillProgressRecord = {
  id: string;
  studentId: string;
  skillId: string;
  startedAt: string;
  lastAccessedAt: string;
  lastLessonId: string;
  completedLessons: Record<string, string>;
  completedExercises: Record<string, string>;
};

export type PendingSkillAction = {
  id: string;
  studentId: string;
  skillId: string;
  lessonId: string;
  type: "lesson-started" | "lesson-completed" | "exercise-completed";
  occurredAt: string;
};

const DATABASE_NAME = "edusphere-skills";
const DATABASE_VERSION = 1;
const ACTIVITY_STORE = "activity";
const OUTBOX_STORE = "outbox";
let openingDatabase: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (!("indexedDB" in globalThis)) return Promise.reject(new Error("This browser does not support offline skill progress storage."));
  if (openingDatabase) return openingDatabase;

  openingDatabase = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ACTIVITY_STORE)) {
        const activity = database.createObjectStore(ACTIVITY_STORE, { keyPath: "id" });
        activity.createIndex("studentId", "studentId", { unique: false });
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = database.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        outbox.createIndex("studentId", "studentId", { unique: false });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      openingDatabase = null;
      reject(request.error ?? new Error("Offline skill progress could not be opened."));
    };
    request.onblocked = () => {
      openingDatabase = null;
      reject(new Error("Another EduSphere tab is preventing skill progress storage from opening."));
    };
  });
  return openingDatabase;
}

function readRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline skill progress could not be read."));
  });
}

function transactionFinished(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline skill progress could not be saved."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline skill progress could not be saved."));
  });
}

function activityId(studentId: string, skillId: string) {
  return `${studentId}:${skillId}`;
}

export async function listSkillProgress(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(ACTIVITY_STORE, "readonly");
  const completion = transactionFinished(transaction);
  const records = await readRequest<SkillProgressRecord[]>(
    transaction.objectStore(ACTIVITY_STORE).index("studentId").getAll(IDBKeyRange.only(studentId)),
  );
  await completion;
  return records.sort((left, right) => right.lastAccessedAt.localeCompare(left.lastAccessedAt));
}

export async function getSkillProgress(studentId: string, skillId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(ACTIVITY_STORE, "readonly");
  const completion = transactionFinished(transaction);
  const record = await readRequest<SkillProgressRecord | undefined>(
    transaction.objectStore(ACTIVITY_STORE).get(activityId(studentId, skillId)),
  );
  await completion;
  return record ?? null;
}

export async function listPendingSkillActions(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(OUTBOX_STORE, "readonly");
  const completion = transactionFinished(transaction);
  const actions = await readRequest<PendingSkillAction[]>(
    transaction.objectStore(OUTBOX_STORE).index("studentId").getAll(IDBKeyRange.only(studentId)),
  );
  await completion;
  return actions.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

export async function acknowledgeSkillAction(actionId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(OUTBOX_STORE, "readwrite");
  const completion = transactionFinished(transaction);
  transaction.objectStore(OUTBOX_STORE).delete(actionId);
  await completion;
}

export async function mergeServerSkillActions(
  studentId: string,
  serverActions: Array<{ actionId: string; skillId: string; lessonId: string; actionType: PendingSkillAction["type"]; occurredAt: string }>,
) {
  const localRecords = await listSkillProgress(studentId);
  const bySkill = new Map(localRecords.map((record) => [record.skillId, record]));
  for (const action of serverActions) {
    const current = bySkill.get(action.skillId);
    const next: SkillProgressRecord = current ?? {
      id: activityId(studentId, action.skillId),
      studentId,
      skillId: action.skillId,
      startedAt: action.occurredAt,
      lastAccessedAt: action.occurredAt,
      lastLessonId: action.lessonId,
      completedLessons: {},
      completedExercises: {},
    };
    if (!current || action.occurredAt < next.startedAt) next.startedAt = action.occurredAt;
    if (!current || action.occurredAt >= next.lastAccessedAt) {
      next.lastAccessedAt = action.occurredAt;
      next.lastLessonId = action.lessonId;
    }
    if (action.actionType === "lesson-completed") {
      const currentCompletion = next.completedLessons[action.lessonId];
      if (!currentCompletion || action.occurredAt > currentCompletion) next.completedLessons[action.lessonId] = action.occurredAt;
    }
    if (action.actionType === "exercise-completed") {
      const currentCompletion = next.completedExercises[action.lessonId];
      if (!currentCompletion || action.occurredAt > currentCompletion) next.completedExercises[action.lessonId] = action.occurredAt;
    }
    bySkill.set(action.skillId, next);
  }

  const database = await openDatabase();
  const transaction = database.transaction(ACTIVITY_STORE, "readwrite");
  const completion = transactionFinished(transaction);
  for (const record of bySkill.values()) transaction.objectStore(ACTIVITY_STORE).put(record);
  await completion;
}

export async function recordSkillAction(
  studentId: string,
  skillId: string,
  lessonId: string,
  type: PendingSkillAction["type"],
) {
  const database = await openDatabase();
  const transaction = database.transaction([ACTIVITY_STORE, OUTBOX_STORE], "readwrite");
  const completion = transactionFinished(transaction);
  const now = new Date().toISOString();
  const id = activityId(studentId, skillId);
  const activityStore = transaction.objectStore(ACTIVITY_STORE);
  const request = activityStore.get(id);
  request.onsuccess = () => {
    const current = request.result as SkillProgressRecord | undefined;
    const next: SkillProgressRecord = {
      id,
      studentId,
      skillId,
      startedAt: current?.startedAt ?? now,
      lastAccessedAt: now,
      lastLessonId: lessonId,
      completedLessons: { ...(current?.completedLessons ?? {}) },
      completedExercises: { ...(current?.completedExercises ?? {}) },
    };
    if (type === "lesson-completed") next.completedLessons[lessonId] = now;
    if (type === "exercise-completed") next.completedExercises[lessonId] = now;
    activityStore.put(next);
    transaction.objectStore(OUTBOX_STORE).put({
      id: crypto.randomUUID(),
      studentId,
      skillId,
      lessonId,
      type,
      occurredAt: now,
    } satisfies PendingSkillAction);
  };
  request.onerror = () => transaction.abort();
  await completion;
}
