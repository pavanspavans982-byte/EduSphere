export type Student = {
  id: string;
  name: string;
  email: string;
  role: "student" | "admin";
  offline?: boolean;
  college: string;
  course: string;
  branch: string;
  yearOfStudy: string;
  interests: string[];
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FieldErrors = Record<string, string>;

export const learningInterestLabels = [
  { value: "technology", label: "Technology" },
  { value: "mathematics", label: "Mathematics" },
  { value: "science", label: "Science" },
  { value: "creative-thinking", label: "Creative thinking" },
  { value: "digital-skills", label: "Digital skills" },
  { value: "languages", label: "Languages" },
];

export type LearningResource = {
  id: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  type: "notes" | "pdf" | "video" | "audio" | "tutorial" | "practice" | "link";
  estimatedMinutes: number;
  preview: string;
  language: string;
  classLevel: string;
  sourceName: string;
  sourceUrl: string;
  licenseInfo: string;
  downloadAllowed: boolean;
  hasFile: boolean;
  sourceDirectory: boolean;
  isDemo: boolean;
  bookmarked: boolean;
  lastPositionSeconds: number;
  lastAccessedAt: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LearningCourse = {
  id: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  language: string;
  estimatedMinutes: number;
  sourceName: string;
  licenseInfo: string;
  lessonCount: number;
  completedLessons: number;
  progressPercent: number;
};

export type CourseLesson = {
  id: string;
  courseId: string;
  title: string;
  estimatedMinutes: number;
  objectives: string[];
  sections: Array<{
    heading: string;
    paragraphs: string[];
    bullets?: string[];
    example?: { title: string; steps: string[] };
  }>;
  summary: string[];
  questions: Array<{
    id: string;
    prompt: string;
    type: "multiple-choice" | "short-answer" | "true-false";
    options?: string[];
    answer: string;
    explanation: string;
  }>;
  completed: boolean;
  bookmarked: boolean;
  lastAccessedAt: string | null;
};

export type CourseBundle = { course: LearningCourse; lessons: CourseLesson[] };
export type AdminCourseLesson = CourseLesson & { isPublished: boolean; sortOrder: number };
export type AdminCourse = LearningCourse & { isPublished: boolean; lessons: AdminCourseLesson[] };

export const resourceCategories = [
  "Mathematics",
  "Science",
  "Computer Science",
  "Programming",
  "English",
  "General Knowledge",
  "Digital Skills",
  "Multiple Subjects",
];

export const resourceTypeLabels: Record<LearningResource["type"], string> = {
  notes: "Study notes",
  pdf: "PDF document",
  video: "Video lesson",
  audio: "Audio lesson",
  tutorial: "Text tutorial",
  practice: "Practice material",
  link: "External source",
};

export class ApiError extends Error {
  status: number;
  fieldErrors: FieldErrors;

  constructor(message: string, status: number, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body instanceof ArrayBuffer ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError("EduSphere could not be reached. Check your connection and try again.", 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const result = await response.json().catch(() => ({})) as {
    student?: Student;
    error?: string;
    fieldErrors?: FieldErrors;
    message?: string;
  };
  if (!response.ok) {
    throw new ApiError(result.error ?? "The request could not be completed.", response.status, result.fieldErrors);
  }
  return result as T;
}

export const authApi = {
  register: (details: { name: string; email: string; password: string }) =>
    request<{ student: Student }>("/api/auth/register", { method: "POST", body: JSON.stringify(details) }),
  login: (details: { email: string; password: string }) =>
    request<{ student: Student }>("/api/auth/login", { method: "POST", body: JSON.stringify(details) }),
  currentStudent: () => request<{ student: Student }>("/api/auth/me"),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  forgotPassword: (email: string) =>
    request<{ message: string }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  updateProfile: (details: Pick<Student, "name" | "college" | "course" | "branch" | "yearOfStudy" | "interests">) =>
    request<{ student: Student }>("/api/profile", { method: "PUT", body: JSON.stringify(details) }),
  uploadAvatar: async (file: File) =>
    request<{ student: Student }>("/api/profile/avatar", {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: await file.arrayBuffer(),
    }),
  deleteAvatar: () =>
    request<{ student: Student }>("/api/profile/avatar", { method: "DELETE" }),
};

export const resourceApi = {
  list: (filters: { q?: string; subject?: string; type?: string; level?: string; language?: string; classLevel?: string; sort?: string } = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value);
    }
    return request<{ resources: LearningResource[] }>(`/api/resources${query.size ? `?${query}` : ""}`);
  },
  activity: () => request<{ saved: LearningResource[]; recent: LearningResource[]; continueLearning: LearningResource[] }>("/api/resources/activity"),
  detail: (id: string) => request<{ resource: LearningResource }>(`/api/resources/${encodeURIComponent(id)}`),
  bookmark: (id: string) => request<{ bookmarked: boolean }>(`/api/resources/${encodeURIComponent(id)}/bookmark`, { method: "POST" }),
  saveProgress: (id: string, lastPositionSeconds: number, completed = false) =>
    request<{ saved: boolean }>(`/api/resources/${encodeURIComponent(id)}/progress`, {
      method: "POST",
      body: JSON.stringify({ lastPositionSeconds, completed }),
    }),
  adminList: () => request<{ resources: LearningResource[] }>("/api/admin/resources"),
  create: (details: ResourceDetails) =>
    request<{ resource: LearningResource }>("/api/admin/resources", { method: "POST", body: JSON.stringify(details) }),
  update: (id: string, details: ResourceDetails) =>
    request<{ resource: LearningResource }>(`/api/admin/resources/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(details) }),
  delete: (id: string) =>
    request<void>(`/api/admin/resources/${encodeURIComponent(id)}`, { method: "DELETE" }),
  uploadPdf: async (id: string, file: File) =>
    request<{ resource: LearningResource }>(`/api/admin/resources/${encodeURIComponent(id)}/file`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        "X-Resource-Permission-Confirmed": "true",
        "X-Resource-File-Name": encodeURIComponent(file.name),
      },
      body: await file.arrayBuffer(),
    }),
  removePdf: (id: string) =>
    request<void>(`/api/admin/resources/${encodeURIComponent(id)}/file`, { method: "DELETE" }),
  fetchPdf: async (id: string) => {
    let response: Response;
    try {
      response = await fetch(`/api/resources/${encodeURIComponent(id)}/file`, { credentials: "include" });
    } catch {
      throw new ApiError("The permission-approved PDF could not be reached. Check your connection.", 0);
    }
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw new ApiError(result.error ?? "The permission-approved PDF could not be downloaded.", response.status);
    }
    return response.blob();
  },
};

export const courseApi = {
  list: (filters: { q?: string; subject?: string; language?: string; level?: string } = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value);
    }
    return request<{ courses: LearningCourse[] }>(`/api/courses${query.size ? `?${query}` : ""}`);
  },
  detail: (courseId: string) =>
    request<CourseBundle>(`/api/courses/${encodeURIComponent(courseId)}`),
  adminList: () => request<{ courses: AdminCourse[] }>("/api/admin/courses"),
  create: (course: Omit<LearningCourse, "lessonCount" | "completedLessons" | "progressPercent"> & { isPublished: boolean }) =>
    request<{ course: LearningCourse }>("/api/admin/courses", { method: "POST", body: JSON.stringify(course) }),
  update: (courseId: string, course: Omit<LearningCourse, "id" | "lessonCount" | "completedLessons" | "progressPercent"> & { isPublished: boolean }) =>
    request<{ course: LearningCourse }>(`/api/admin/courses/${encodeURIComponent(courseId)}`, {
      method: "PUT", body: JSON.stringify(course),
    }),
  unpublish: (courseId: string) =>
    request<void>(`/api/admin/courses/${encodeURIComponent(courseId)}`, { method: "DELETE" }),
  saveLesson: (courseId: string, lessonId: string, lesson: {
    title: string;
    estimatedMinutes: number;
    sortOrder: number;
    isPublished: boolean;
    content: Pick<CourseLesson, "objectives" | "sections" | "summary" | "questions">;
  }) => request<{ lesson: AdminCourseLesson }>(
    `/api/admin/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`,
    { method: "PUT", body: JSON.stringify(lesson) },
  ),
  unpublishLesson: (courseId: string, lessonId: string) =>
    request<void>(`/api/admin/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`, { method: "DELETE" }),
};

export type ResourceDetails = Pick<LearningResource, "title" | "description" | "subject" | "level" | "type" | "estimatedMinutes" | "preview" | "language" | "classLevel" | "sourceName" | "sourceUrl" | "licenseInfo">;

export type AiServiceStatus = {
  local: { available: boolean; model: string; runtime: string; location: string };
  online: { configured: boolean; model: string | null };
};

export const aiApi = {
  status: () => request<AiServiceStatus>("/api/ai/status"),
  askLocal: (details: AiQuestion) =>
    request<AiAnswer>("/api/ai/local", { method: "POST", body: JSON.stringify(details) }),
  askOnline: (details: AiQuestion) =>
    request<AiAnswer>("/api/ai/online", { method: "POST", body: JSON.stringify(details) }),
};

export type AssessmentQuestionType = "multiple-choice" | "true-false" | "fill-blank" | "short-answer" | "programming";
export type AssessmentDifficulty = "Beginner" | "Intermediate" | "Advanced";

export type AssessmentQuestion = {
  id: string;
  type: AssessmentQuestionType;
  prompt: string;
  topic: string;
  difficulty: AssessmentDifficulty;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

export type AssessmentPackage = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  description: string;
  estimatedMinutes: number;
  isDemo: boolean;
  questions: AssessmentQuestion[];
};

export type TopicAssessmentResult = {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
};

export type GradedAssessmentQuestion = {
  questionId: string;
  prompt: string;
  topic: string;
  difficulty: AssessmentDifficulty;
  type: AssessmentQuestionType;
  answer: string;
  correctAnswer: string;
  correct: boolean;
  explanation: string;
};

export type AssessmentAttempt = {
  attemptId: string;
  assessmentId: string;
  startedAt: string;
  submittedAt: string;
  score: number;
  total: number;
  accuracy: number;
  questions: GradedAssessmentQuestion[];
  topicResults: TopicAssessmentResult[];
  weakTopics: string[];
};

export type AssessmentListing = AssessmentPackage & {
  questionCount: number;
  previousAttempts: number;
  bestAccuracy: number;
  latestAttempt: AssessmentAttempt | null;
};

export const assessmentApi = {
  list: () => request<{ categories: string[]; assessments: AssessmentListing[]; history: AssessmentAttempt[] }>("/api/assessments"),
  detail: (assessmentId: string) =>
    request<{ assessment: AssessmentPackage; priorPerformance: Array<{ accuracy: number; topicResults: TopicAssessmentResult[] }> }>(
      `/api/assessments/${encodeURIComponent(assessmentId)}`,
    ),
  submit: (attempt: { attemptId: string; assessmentId: string; startedAt: string; submittedAt: string; answers: Array<{ questionId: string; answer: string }> }) =>
    request<{ attempt: AssessmentAttempt }>("/api/assessment-attempts", {
      method: "POST",
      body: JSON.stringify(attempt),
    }),
  attempt: (attemptId: string) =>
    request<{ attempt: AssessmentAttempt }>(`/api/assessment-attempts/${encodeURIComponent(attemptId)}`),
};

export type SyncOperation = {
  id: string;
  type: "resource.bookmark" | "resource.progress" | "skill.activity" | "course.lesson" | "profile.update" | "ai.question";
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type SyncOperationResult = {
  operationId: string;
  status: "acknowledged" | "failed";
  error?: string;
  duplicate?: boolean;
  conflict?: string | null;
  note?: string | null;
};

export const syncApi = {
  bootstrapAdmin: (token: string) =>
    request<{ student: Student }>("/api/admin/bootstrap", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  status: () => request<{
    lastSuccessfulSyncAt: string | null;
    lastSession: { operation_count: number; acknowledged_count: number; failed_count: number } | null;
    acknowledgedOperations: number;
    failedOperations: number;
    pendingDoubtRequests: number;
  }>("/api/sync/status"),
  batch: (operations: SyncOperation[], includePendingQuestions = false) =>
    request<{ results: SyncOperationResult[]; status: string }>("/api/sync/batch", {
      method: "POST",
      body: JSON.stringify({ operations, includePendingQuestions }),
    }),
  snapshot: () => request<{
    profile: Student;
    skillActions: Array<{
      action_id: string;
      skill_id: string;
      lesson_id: string;
      action_type: "lesson-started" | "lesson-completed" | "exercise-completed";
      occurred_at: string;
    }>;
  }>("/api/sync/snapshot"),
  doubtRequests: () => request<{ requests: Array<{ requestId: string; subject: string; mode: "simple" | "step-by-step"; status: "queued" | "answered" | "failed"; createdAt: string }> }>("/api/doubt-requests"),
  adminOverview: () => request<{
    summary: Record<string, number>;
    recentSync: Array<{ type: string; status: "acknowledged" | "failed"; error: string; processedAt: string }>;
  }>("/api/admin/overview"),
};

export type AiQuestion = {
  question: string;
  subject: string;
  mode: "simple" | "step-by-step";
  context: Array<{ role: "user" | "assistant"; content: string }>;
};

export type AiAnswer = { answer: string; provider: "local" | "online"; model: string };
