import type { AssessmentAttempt, AssessmentPackage } from "../auth/api";

export type DraftAttempt = {
  attemptId: string;
  assessmentId: string;
  studentId: string;
  startedAt: string;
  updatedAt: string;
  questionIds: string[];
  answers: Record<string, string>;
  currentIndex: number;
  timerSeconds: number;
  initialDifficulty: "Beginner" | "Intermediate" | "Advanced";
  status: "in-progress" | "submitted";
  result?: AssessmentAttempt;
  syncStatus: "not-needed" | "pending" | "synced";
};

const DB_NAME = "edusphere-assessments";
const DB_VERSION = 1;
const PACKAGES = "packages";
const ATTEMPTS = "attempts";
let opening: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (!("indexedDB" in globalThis)) return Promise.reject(new Error("This browser does not support offline assessment storage."));
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PACKAGES)) {
        const packages = database.createObjectStore(PACKAGES, { keyPath: "id" });
        packages.createIndex("studentId", "studentId", { unique: false });
      }
      if (!database.objectStoreNames.contains(ATTEMPTS)) {
        const attempts = database.createObjectStore(ATTEMPTS, { keyPath: "attemptId" });
        attempts.createIndex("studentId", "studentId", { unique: false });
        attempts.createIndex("studentAssessment", ["studentId", "assessmentId"], { unique: false });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error("Offline assessment storage could not be opened."));
    };
    request.onblocked = () => {
      opening = null;
      reject(new Error("Another EduSphere tab is preventing assessment storage from opening."));
    };
  });
  return opening;
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Assessment data could not be read."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Assessment data could not be saved."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Assessment data could not be saved."));
  });
}

export async function cacheAssessmentPackages(studentId: string, assessments: AssessmentPackage[]) {
  const database = await openDatabase();
  const transaction = database.transaction(PACKAGES, "readwrite");
  const done = transactionDone(transaction);
  for (const assessment of assessments) transaction.objectStore(PACKAGES).put({ ...assessment, studentId, cachedAt: new Date().toISOString() });
  await done;
}

export async function listCachedAssessments(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(PACKAGES, "readonly");
  const done = transactionDone(transaction);
  const entries = await requestValue<(AssessmentPackage & { studentId: string })[]>(
    transaction.objectStore(PACKAGES).index("studentId").getAll(IDBKeyRange.only(studentId)),
  );
  await done;
  return entries;
}

export async function getCachedAssessment(studentId: string, assessmentId: string) {
  const entries = await listCachedAssessments(studentId);
  return entries.find((assessment) => assessment.id === assessmentId) ?? null;
}

export async function saveDraftAttempt(attempt: DraftAttempt) {
  const database = await openDatabase();
  const transaction = database.transaction(ATTEMPTS, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(ATTEMPTS).put(attempt);
  await done;
}

export async function getDraftAttempt(studentId: string, attemptId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(ATTEMPTS, "readonly");
  const done = transactionDone(transaction);
  const attempt = await requestValue<DraftAttempt | undefined>(transaction.objectStore(ATTEMPTS).get(attemptId));
  await done;
  return attempt?.studentId === studentId ? attempt : null;
}

export async function listAssessmentAttempts(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(ATTEMPTS, "readonly");
  const done = transactionDone(transaction);
  const attempts = await requestValue<DraftAttempt[]>(
    transaction.objectStore(ATTEMPTS).index("studentId").getAll(IDBKeyRange.only(studentId)),
  );
  await done;
  return attempts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
