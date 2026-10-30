export type QueuedProfileUpdate = {
  id: string;
  studentId: string;
  type: "profile.update";
  occurredAt: string;
  payload: {
    profile: {
      name: string;
      college: string;
      course: string;
      branch: string;
      yearOfStudy: string;
      interests: string[];
    };
    baseUpdatedAt: string;
  };
};

export type SyncState = {
  id: string;
  studentId: string;
  status: "waiting" | "syncing" | "synced" | "failed";
  lastAttemptAt: string | null;
  lastSuccessfulSyncAt: string | null;
  error: string;
};

const DATABASE_NAME = "edusphere-sync-state";
const DATABASE_VERSION = 1;
const OPERATIONS = "operations";
const STATES = "states";
let opening: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (!("indexedDB" in globalThis)) return Promise.reject(new Error("This browser does not support durable sync storage."));
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OPERATIONS)) {
        const operations = database.createObjectStore(OPERATIONS, { keyPath: "id" });
        operations.createIndex("studentId", "studentId", { unique: false });
      }
      if (!database.objectStoreNames.contains(STATES)) {
        database.createObjectStore(STATES, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error("The sync queue could not be opened."));
    };
    request.onblocked = () => {
      opening = null;
      reject(new Error("Another EduSphere tab is preventing the sync queue from opening."));
    };
  });
  return opening;
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Sync state could not be saved."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Sync state could not be saved."));
  });
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Sync state could not be read."));
  });
}

export async function queueProfileUpdate(
  studentId: string,
  profile: QueuedProfileUpdate["payload"]["profile"],
  baseUpdatedAt: string,
) {
  const database = await openDatabase();
  const transaction = database.transaction(OPERATIONS, "readwrite");
  const done = transactionDone(transaction);
  const now = new Date().toISOString();
  const store = transaction.objectStore(OPERATIONS);
  const existing = await requestValue<QueuedProfileUpdate[]>(
    store.index("studentId").getAll(IDBKeyRange.only(studentId)),
  );
  const queued = existing
    .filter((operation) => operation.type === "profile.update")
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const operation: QueuedProfileUpdate = {
    id: queued[0]?.id ?? crypto.randomUUID(),
    studentId,
    type: "profile.update",
    occurredAt: now,
    payload: { profile, baseUpdatedAt: queued[0]?.payload.baseUpdatedAt ?? baseUpdatedAt },
  };
  for (const duplicate of queued.slice(1)) store.delete(duplicate.id);
  store.put(operation);
  await done;
  return operation;
}

export async function listQueuedProfileUpdates(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(OPERATIONS, "readonly");
  const done = transactionDone(transaction);
  const operations = await requestValue<QueuedProfileUpdate[]>(
    transaction.objectStore(OPERATIONS).index("studentId").getAll(IDBKeyRange.only(studentId)),
  );
  await done;
  return operations.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

export async function acknowledgeProfileUpdate(operationId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(OPERATIONS, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(OPERATIONS).delete(operationId);
  await done;
}

export async function clearQueuedProfileUpdates(studentId: string) {
  const operations = await listQueuedProfileUpdates(studentId);
  const database = await openDatabase();
  const transaction = database.transaction(OPERATIONS, "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(OPERATIONS);
  for (const operation of operations) store.delete(operation.id);
  await done;
}

export async function getSyncState(studentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STATES, "readonly");
  const done = transactionDone(transaction);
  const state = await requestValue<SyncState | undefined>(transaction.objectStore(STATES).get(`${studentId}:sync`));
  await done;
  return state ?? {
    id: `${studentId}:sync`,
    studentId,
    status: "waiting" as const,
    lastAttemptAt: null,
    lastSuccessfulSyncAt: null,
    error: "",
  };
}

export async function updateSyncState(studentId: string, values: Partial<Omit<SyncState, "id" | "studentId">>) {
  const database = await openDatabase();
  const transaction = database.transaction(STATES, "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(STATES);
  const request = store.get(`${studentId}:sync`);
  request.onsuccess = () => {
    const current = request.result as SyncState | undefined;
    store.put({
      id: `${studentId}:sync`,
      studentId,
      status: current?.status ?? "waiting",
      lastAttemptAt: current?.lastAttemptAt ?? null,
      lastSuccessfulSyncAt: current?.lastSuccessfulSyncAt ?? null,
      error: current?.error ?? "",
      ...values,
    } satisfies SyncState);
  };
  request.onerror = () => transaction.abort();
  await done;
}
