import { assessmentApi, resourceApi, syncApi, type SyncOperation } from "../auth/api";
import { cacheStudentProfile } from "../ai/chatStorage";
import { listChatMessages, updateChatMessage } from "../ai/chatStorage";
import { cacheAssessmentPackages, listAssessmentAttempts, saveDraftAttempt } from "../assessments/assessmentStorage";
import {
  acknowledgeCourseOperation, acknowledgeOfflineOperation, cacheResourceMetadata, listPendingCourseOperations,
  listPendingOfflineOperations, mergeServerResourceActivity,
} from "../offline/offlineStorage";
import { acknowledgeSkillAction, listPendingSkillActions, mergeServerSkillActions } from "../skills/skillStorage";
import {
  acknowledgeProfileUpdate, getSyncState, listQueuedProfileUpdates, updateSyncState,
} from "./syncStorage";

const activeRuns = new Map<string, Promise<SyncRunResult>>();

export type SyncRunResult = {
  acknowledged: number;
  failed: number;
  pending: number;
  error: string;
  lastSuccessfulSyncAt: string | null;
};

export async function getPendingSyncCount(studentId: string, includePendingQuestions = false) {
  const [resources, courses, skills, profiles, attempts, chats] = await Promise.all([
    listPendingOfflineOperations(studentId),
    listPendingCourseOperations(studentId),
    listPendingSkillActions(studentId),
    listQueuedProfileUpdates(studentId),
    listAssessmentAttempts(studentId),
    includePendingQuestions ? listChatMessages(studentId) : Promise.resolve([]),
  ]);
  const pendingAttempts = attempts.filter((attempt) => attempt.status === "submitted" && attempt.syncStatus === "pending");
  const pendingQuestions = includePendingQuestions
    ? chats.filter((message) => message.role === "user" && message.status === "pending-online" && message.syncRequestStatus !== "queued")
    : [];
  return resources.length + courses.length + skills.length + profiles.length + pendingAttempts.length + pendingQuestions.length;
}

export async function runSynchronization(studentId: string, includePendingQuestions = false): Promise<SyncRunResult> {
  const running = activeRuns.get(studentId);
  if (running) return running;
  const promise = performSynchronization(studentId, includePendingQuestions)
    .catch(async (syncError: unknown) => {
      const message = syncError instanceof Error
        ? syncError.message
        : "Synchronization failed before the server could confirm the local changes.";
      await updateSyncState(studentId, { status: "failed", error: message });
      return {
        acknowledged: 0,
        failed: 1,
        pending: await getPendingSyncCount(studentId, includePendingQuestions),
        error: message,
        lastSuccessfulSyncAt: (await getSyncState(studentId)).lastSuccessfulSyncAt,
      };
    })
    .finally(() => activeRuns.delete(studentId));
  activeRuns.set(studentId, promise);
  return promise;
}

async function performSynchronization(studentId: string, includePendingQuestions: boolean): Promise<SyncRunResult> {
  const startedAt = new Date().toISOString();
  await updateSyncState(studentId, { status: "syncing", lastAttemptAt: startedAt, error: "" });
  if (!navigator.onLine) {
    const message = "You are offline. Your saved changes remain on this device and will retry after reconnecting.";
    await updateSyncState(studentId, { status: "waiting", error: message });
    return {
      acknowledged: 0,
      failed: 0,
      pending: await getPendingSyncCount(studentId, includePendingQuestions),
      error: message,
      lastSuccessfulSyncAt: (await getSyncState(studentId)).lastSuccessfulSyncAt,
    };
  }

  let acknowledged = 0;
  let failed = 0;
  const errors: string[] = [];
  const resolvedConflicts: string[] = [];
  const [resourceOperations, courseOperations, skillActions, profileUpdates, attempts, messages] = await Promise.all([
    listPendingOfflineOperations(studentId),
    listPendingCourseOperations(studentId),
    listPendingSkillActions(studentId),
    listQueuedProfileUpdates(studentId),
    listAssessmentAttempts(studentId),
    includePendingQuestions ? listChatMessages(studentId) : Promise.resolve([]),
  ]);
  const syncOperations: SyncOperation[] = [
    ...resourceOperations.map((operation) => ({
      id: operation.id,
      type: operation.type === "bookmark" ? "resource.bookmark" as const : "resource.progress" as const,
      occurredAt: operation.createdAt,
      payload: { resourceId: operation.resourceId, ...operation.payload },
    })),
    ...courseOperations.map((operation) => ({
      id: operation.id,
      type: "course.lesson" as const,
      occurredAt: operation.createdAt,
      payload: operation.payload,
    })),
    ...skillActions.map((action) => ({
      id: action.id,
      type: "skill.activity" as const,
      occurredAt: action.occurredAt,
      payload: { actionId: action.id, skillId: action.skillId, lessonId: action.lessonId, actionType: action.type },
    })),
    ...profileUpdates.map((operation) => ({
      id: operation.id,
      type: "profile.update" as const,
      occurredAt: operation.occurredAt,
      payload: operation.payload,
    })),
    ...(includePendingQuestions ? messages
      .filter((message) => message.role === "user" && message.status === "pending-online" && message.syncRequestStatus !== "queued")
      .map((message) => ({
        id: message.id,
        type: "ai.question" as const,
        occurredAt: message.createdAt,
        payload: { requestId: message.id, question: message.content, subject: "General", mode: "step-by-step" },
      })) : []),
  ];

  try {
    const operationBatches = syncOperations.length
      ? Array.from({ length: Math.ceil(syncOperations.length / 50) }, (_, index) => syncOperations.slice(index * 50, (index + 1) * 50))
      : [[]];
    for (const batch of operationBatches) {
      const response = await syncApi.batch(batch, includePendingQuestions);
      for (const result of response.results) {
        if (result.status !== "acknowledged") {
          failed += 1;
          errors.push(result.error ?? `Sync failed for item ${result.operationId}.`);
          continue;
        }
        acknowledged += 1;
        const resource = resourceOperations.find((item) => item.id === result.operationId);
        if (resource) await acknowledgeOfflineOperation(resource.id);
        const course = courseOperations.find((item) => item.id === result.operationId);
        if (course) await acknowledgeCourseOperation(course.id);
        const skill = skillActions.find((item) => item.id === result.operationId);
        if (skill) await acknowledgeSkillAction(skill.id);
        const profile = profileUpdates.find((item) => item.id === result.operationId);
        if (profile) await acknowledgeProfileUpdate(profile.id);
        if (includePendingQuestions && messages.some((message) => message.id === result.operationId)) {
          await updateChatMessage(result.operationId, studentId, { syncRequestStatus: "queued" });
        }
        if (result.conflict) resolvedConflicts.push(result.note ?? "A newer server change was kept.");
      }
    }

    for (const pending of attempts.filter((attempt) => attempt.status === "submitted" && attempt.syncStatus === "pending" && attempt.result)) {
      if (!pending.result) continue;
      try {
        const response = await assessmentApi.submit({
          attemptId: pending.attemptId,
          assessmentId: pending.assessmentId,
          startedAt: pending.startedAt,
          submittedAt: pending.result.submittedAt,
          answers: pending.questionIds.map((questionId) => ({ questionId, answer: pending.answers[questionId] ?? "" })),
        });
        await saveDraftAttempt({
          ...pending,
          result: response.attempt,
          syncStatus: "synced",
          updatedAt: new Date().toISOString(),
        });
        acknowledged += 1;
      } catch (assessmentError) {
        failed += 1;
        errors.push(assessmentError instanceof Error ? assessmentError.message : "Assessment result is still waiting to sync.");
      }
    }

    const [snapshot, resourceActivity, resources, assessmentHistory, remoteStatus] = await Promise.all([
      syncApi.snapshot(),
      resourceApi.activity(),
      resourceApi.list(),
      assessmentApi.list(),
      syncApi.status(),
    ]);
    await mergeServerSkillActions(studentId, snapshot.skillActions.map((action) => ({
      actionId: action.action_id,
      skillId: action.skill_id,
      lessonId: action.lesson_id,
      actionType: action.action_type,
      occurredAt: action.occurred_at,
    })));
    await cacheResourceMetadata(studentId, [...resources.resources, ...resourceActivity.saved, ...resourceActivity.recent]);
    await mergeServerResourceActivity(studentId, resourceActivity);
    await cacheAssessmentPackages(studentId, assessmentHistory.assessments);
    await cacheStudentProfile(snapshot.profile);
    const remaining = await getPendingSyncCount(studentId, includePendingQuestions);
    if (failed === 0 && remaining === 0 && errors.length === 0) {
      await updateSyncState(studentId, {
        status: "synced",
        lastSuccessfulSyncAt: remoteStatus.lastSuccessfulSyncAt ?? new Date().toISOString(),
        error: resolvedConflicts.join(" "),
      });
    } else {
      const message = errors.join(" ") || `${remaining} item${remaining === 1 ? "" : "s"} still waiting for synchronization.`;
      await updateSyncState(studentId, { status: "failed", error: message });
    }
  } catch (syncError) {
    failed += 1;
    const message = syncError instanceof Error
      ? syncError.message
      : "EduSphere could not confirm synchronization. Your local data has been retained.";
    errors.push(message);
    await updateSyncState(studentId, { status: "failed", error: message });
  }

  const state = await getSyncState(studentId);
  return {
    acknowledged,
    failed,
    pending: await getPendingSyncCount(studentId, includePendingQuestions),
    error: errors.join(" "),
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
  };
}
