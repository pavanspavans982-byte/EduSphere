import type { Student } from "../auth/api";

export type ChatRole = "user" | "assistant";
export type ChatMessageSource = "student" | "local" | "online" | "system";
export type ChatMessageStatus = "answering" | "pending-online" | "answered-local" | "answered-online";

export type ChatMessage = {
  id: string;
  studentId: string;
  role: ChatRole;
  source: ChatMessageSource;
  content: string;
  createdAt: string;
  status?: ChatMessageStatus;
  replyToId?: string;
  error?: string;
  syncRequestStatus?: "pending" | "queued";
};

const DATABASE_NAME = "edusphere-ai-chat";
const DATABASE_VERSION = 2;
const STORE_NAME = "messages";
const PROFILE_STORE_NAME = "profiles";

let openingDatabase: Promise<IDBDatabase> | null = null;

function openChatDatabase() {
  if (!("indexedDB" in globalThis)) {
    return Promise.reject(new Error("This browser does not support local conversation storage."));
  }
  if (openingDatabase) return openingDatabase;

  openingDatabase = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const messages = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        messages.createIndex("studentId", "studentId", { unique: false });
        messages.createIndex("studentCreatedAt", ["studentId", "createdAt"], { unique: false });
      }
      if (!database.objectStoreNames.contains(PROFILE_STORE_NAME)) {
        database.createObjectStore(PROFILE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      openingDatabase = null;
      reject(request.error ?? new Error("The local conversation database could not be opened."));
    };
    request.onblocked = () => {
      openingDatabase = null;
      reject(new Error("Another EduSphere tab is preventing the local conversation database from updating."));
    };
  });

  return openingDatabase;
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("The local conversation was not saved."));
    transaction.onerror = () => reject(transaction.error ?? new Error("The local conversation could not be saved."));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The local conversation could not be read."));
  });
}

export async function listChatMessages(studentId: string) {
  const database = await openChatDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const completion = transactionComplete(transaction);
  const keys = IDBKeyRange.only(studentId);
  const result = await requestResult(transaction.objectStore(STORE_NAME).index("studentId").getAll(keys));
  await completion;
  return (result as ChatMessage[]).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function saveChatMessage(message: ChatMessage) {
  const database = await openChatDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const completion = transactionComplete(transaction);
  transaction.objectStore(STORE_NAME).put(message);
  await completion;
}

export async function updateChatMessage(id: string, studentId: string, update: Partial<ChatMessage>) {
  const database = await openChatDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(STORE_NAME);
  const message = await requestResult<ChatMessage | undefined>(store.get(id));
  if (message && message.studentId === studentId) {
    store.put({ ...message, ...update, id: message.id, studentId: message.studentId });
  }
  await completion;
}

export async function clearChatMessages(studentId: string) {
  const database = await openChatDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(STORE_NAME);
  const cursorRequest = store.index("studentId").openKeyCursor(IDBKeyRange.only(studentId));
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (cursor) {
      store.delete(cursor.primaryKey);
      cursor.continue();
    }
  };
  await completion;
}

export async function cacheStudentProfile(student: Student) {
  const database = await openChatDatabase();
  const transaction = database.transaction(PROFILE_STORE_NAME, "readwrite");
  const completion = transactionComplete(transaction);
  const { offline: _offline, ...profile } = student;
  transaction.objectStore(PROFILE_STORE_NAME).put(profile);
  await completion;
}

export async function getCachedStudentProfile(studentId?: string) {
  const database = await openChatDatabase();
  const transaction = database.transaction(PROFILE_STORE_NAME, "readonly");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(PROFILE_STORE_NAME);
  const result = studentId
    ? await requestResult<Student | undefined>(store.get(studentId))
    : undefined;
  if (!studentId) {
    const profiles = await requestResult<Student[]>(store.getAll());
    await completion;
    return profiles.sort((left, right) => left.name.localeCompare(right.name))[0] ?? null;
  }
  await completion;
  return result ?? null;
}

export async function clearCachedStudentProfile(studentId: string) {
  const database = await openChatDatabase();
  const transaction = database.transaction(PROFILE_STORE_NAME, "readwrite");
  const completion = transactionComplete(transaction);
  transaction.objectStore(PROFILE_STORE_NAME).delete(studentId);
  await completion;
}
