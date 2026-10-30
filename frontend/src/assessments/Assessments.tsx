import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpen, Check, Clock3, Download, FileCheck2, Lightbulb,
  LoaderCircle, RotateCcw, Target, Wifi, WifiOff, XCircle,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  assessmentApi, type AssessmentAttempt, type AssessmentDifficulty,
  type AssessmentListing, type AssessmentPackage, type AssessmentQuestion, type GradedAssessmentQuestion,
} from "../auth/api";
import { useStudentAuth } from "../auth/AuthContext";
import {
  cacheAssessmentPackages, getDraftAttempt, listAssessmentAttempts,
  listCachedAssessments, saveDraftAttempt, type DraftAttempt,
} from "./assessmentStorage";
import { runSynchronization } from "../sync/syncEngine";

const assessmentSubjects = [
  "Mathematics", "Science", "Computer Science", "Programming", "English",
  "Digital Literacy", "General Knowledge", "Skill Development",
];
const difficulties: AssessmentDifficulty[] = ["Beginner", "Intermediate", "Advanced"];
const emptyAnswer = "";

function isCorrect(question: AssessmentQuestion, answer: string) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/[`"'.,!?;:]/g, "").replace(/\s+/g, " ");
  return Boolean(answer.trim()) && normalize(answer) === normalize(question.correctAnswer);
}

function gradeLocally(assessment: AssessmentPackage, draft: DraftAttempt): AssessmentAttempt {
  const selectedQuestions = draft.questionIds
    .map((id) => assessment.questions.find((question) => question.id === id))
    .filter((question): question is AssessmentQuestion => Boolean(question));
  const questions: GradedAssessmentQuestion[] = selectedQuestions.map((question) => ({
    questionId: question.id,
    prompt: question.prompt,
    topic: question.topic,
    difficulty: question.difficulty,
    type: question.type,
    answer: draft.answers[question.id] ?? "",
    correctAnswer: question.correctAnswer,
    correct: isCorrect(question, draft.answers[question.id] ?? ""),
    explanation: question.explanation,
  }));
  const topicMap = new Map<string, { topic: string; correct: number; total: number }>();
  for (const result of questions) {
    const topic = topicMap.get(result.topic) ?? { topic: result.topic, correct: 0, total: 0 };
    topic.total += 1;
    if (result.correct) topic.correct += 1;
    topicMap.set(result.topic, topic);
  }
  const topics = [...topicMap.values()];
  const correctCount = questions.filter((question) => question.correct).length;
  return {
    attemptId: draft.attemptId,
    assessmentId: draft.assessmentId,
    startedAt: draft.startedAt,
    submittedAt: new Date().toISOString(),
    score: correctCount,
    total: questions.length,
    accuracy: questions.length ? Math.round(correctCount / questions.length * 100) : 0,
    questions,
    topicResults: topics.map((topic) => ({ ...topic, accuracy: Math.round(topic.correct / topic.total * 100) })),
    weakTopics: topics.filter((topic) => topic.correct / topic.total < 0.6).map((topic) => topic.topic),
  };
}

function chooseQuestion(
  assessment: AssessmentPackage,
  questionIds: string[],
  targetDifficulty: AssessmentDifficulty,
) {
  const used = new Set(questionIds);
  const targetIndex = difficulties.indexOf(targetDifficulty);
  return assessment.questions
    .filter((question) => !used.has(question.id))
    .sort((left, right) => Math.abs(difficulties.indexOf(left.difficulty) - targetIndex) - Math.abs(difficulties.indexOf(right.difficulty) - targetIndex))[0] ?? null;
}

function initialDifficulty(assessment: AssessmentListing, attempts: DraftAttempt[]): AssessmentDifficulty {
  const localAccuracy = attempts
    .filter((attempt) => attempt.assessmentId === assessment.id && attempt.result)
    .slice(0, 3)
    .map((attempt) => attempt.result?.accuracy ?? 0);
  const recentAccuracies = localAccuracy.length
    ? localAccuracy
    : assessment.latestAttempt ? [assessment.latestAttempt.accuracy] : [];
  if (!recentAccuracies.length) return "Beginner";
  const average = recentAccuracies.reduce((sum, accuracy) => sum + accuracy, 0) / recentAccuracies.length;
  return average >= 80 ? "Advanced" : average >= 50 ? "Intermediate" : "Beginner";
}

export function AssessmentsPage() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { student } = useStudentAuth();
  const studentId = student?.id ?? "";
  const [assessments, setAssessments] = useState<AssessmentListing[]>([]);
  const [localPackages, setLocalPackages] = useState<AssessmentPackage[]>([]);
  const [attempts, setAttempts] = useState<DraftAttempt[]>([]);
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");
  const [timerMinutes, setTimerMinutes] = useState(0);
  const [activeAttempt, setActiveAttempt] = useState<DraftAttempt | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingOffline, setSavingOffline] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const packageById = useMemo(() => new Map(localPackages.map((assessment) => [assessment.id, assessment])), [localPackages]);

  const refreshLocalData = useCallback(async () => {
    if (!studentId) return;
    const [cached, localAttempts] = await Promise.all([
      listCachedAssessments(studentId),
      listAssessmentAttempts(studentId),
    ]);
    setLocalPackages(cached);
    setAttempts(localAttempts);
  }, [studentId]);

  const syncPendingAttempts = useCallback(async () => {
    if (!studentId || !navigator.onLine || student?.offline) return;
    try {
      const result = await runSynchronization(studentId);
      await refreshLocalData();
      if (result.acknowledged > 0) {
        setNotice("Pending assessment results were acknowledged by the EduSphere server.");
      }
      if (result.error) setError(`Some learning data is still waiting to sync. ${result.error}`);
    } catch (syncError) {
      setError(syncError instanceof Error ? `Assessment results are still waiting to sync: ${syncError.message}` : "Assessment results are still waiting to sync.");
    }
  }, [refreshLocalData, student?.offline, studentId]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!studentId) return;
      setLoading(true);
      try {
        const response = await assessmentApi.list();
        await cacheAssessmentPackages(studentId, response.assessments);
        const [local, localAttempts] = await Promise.all([
          listCachedAssessments(studentId),
          listAssessmentAttempts(studentId),
        ]);
        if (active) {
          setAssessments(response.assessments);
          setLocalPackages(local);
          const knownAttemptIds = new Set(localAttempts.map((attempt) => attempt.attemptId));
          const serverAttempts: DraftAttempt[] = response.history
            .filter((attempt) => !knownAttemptIds.has(attempt.attemptId))
            .map((attempt) => ({
              attemptId: attempt.attemptId,
              assessmentId: attempt.assessmentId,
              studentId,
              startedAt: attempt.startedAt,
              updatedAt: attempt.submittedAt,
              questionIds: attempt.questions.map((question) => question.questionId),
              answers: Object.fromEntries(attempt.questions.map((question) => [question.questionId, question.answer])),
              currentIndex: attempt.questions.length - 1,
              timerSeconds: 0,
              initialDifficulty: "Beginner",
              status: "submitted",
              result: attempt,
              syncStatus: "synced",
            }));
          setAttempts([...localAttempts, ...serverAttempts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
          setError("");
        }
      } catch (requestError) {
        try {
          const [cached, localAttempts] = await Promise.all([
            listCachedAssessments(studentId),
            listAssessmentAttempts(studentId),
          ]);
          if (!cached.length) throw requestError;
          if (active) {
            setAssessments(cached.map((assessment) => ({
              ...assessment,
              questionCount: assessment.questions.length,
              previousAttempts: localAttempts.filter((attempt) => attempt.assessmentId === assessment.id && attempt.status === "submitted").length,
              bestAccuracy: Math.max(0, ...localAttempts.filter((attempt) => attempt.assessmentId === assessment.id).map((attempt) => attempt.result?.accuracy ?? 0)),
              latestAttempt: null,
            })));
            setLocalPackages(cached);
            setAttempts(localAttempts);
            setError(navigator.onLine ? "The assessment server is unavailable. Showing assessments saved on this device." : "Offline mode: showing assessments and results saved on this device.");
          }
        } catch (storageError) {
          if (active) setError(storageError instanceof Error ? storageError.message : "Assessments could not be loaded.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    const handleOnline = () => {
      setOnline(true);
      void syncPendingAttempts();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void syncPendingAttempts();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [studentId, syncPendingAttempts]);

  useEffect(() => {
    let active = true;
    const attemptId = searchParams.get("attempt");
    if (!studentId || !attemptId) {
      setActiveAttempt(null);
      return;
    }
    getDraftAttempt(studentId, attemptId)
      .then(async (attempt) => {
        if (attempt) {
          if (active) setActiveAttempt(attempt);
          return;
        }
        if (!navigator.onLine || student?.offline) return;
        const { attempt: result } = await assessmentApi.attempt(attemptId);
        const restored: DraftAttempt = {
          attemptId: result.attemptId,
          assessmentId: result.assessmentId,
          studentId,
          startedAt: result.startedAt,
          updatedAt: result.submittedAt,
          questionIds: result.questions.map((question) => question.questionId),
          answers: Object.fromEntries(result.questions.map((question) => [question.questionId, question.answer])),
          currentIndex: result.questions.length - 1,
          timerSeconds: 0,
          initialDifficulty: "Beginner",
          status: "submitted",
          result,
          syncStatus: "synced",
        };
        await saveDraftAttempt(restored);
        if (active) setActiveAttempt(restored);
      })
      .catch((storageError: unknown) => {
        if (active) setError(storageError instanceof Error ? storageError.message : "The saved assessment attempt could not be opened.");
      });
    return () => { active = false; };
  }, [searchParams, studentId]);

  useEffect(() => {
    if (!activeAttempt || activeAttempt.status !== "in-progress" || activeAttempt.timerSeconds <= 0) return;
    setSecondsRemaining(Math.max(0, activeAttempt.timerSeconds - Math.floor((Date.now() - Date.parse(activeAttempt.startedAt)) / 1000)));
    const timer = window.setInterval(() => {
      setSecondsRemaining((remaining) => {
        if (remaining <= 1) {
          window.clearInterval(timer);
          void submitAttempt();
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeAttempt?.attemptId, activeAttempt?.status]);

  const filteredAssessments = assessments.filter((assessment) =>
    (!category || assessment.subject === category) && (!topic || assessment.topic.toLowerCase().includes(topic.toLowerCase())),
  );
  const availableTopics = [...new Set(assessments.filter((assessment) => !category || assessment.subject === category).map((assessment) => assessment.topic))];
  const selectedAssessment = assessmentId ? packageById.get(assessmentId) : null;
  const currentQuestionId = activeAttempt?.questionIds[activeAttempt.currentIndex];
  const currentQuestion = selectedAssessment?.questions.find((question) => question.id === currentQuestionId);

  async function saveOffline(assessment: AssessmentPackage) {
    if (!studentId) return;
    setSavingOffline(assessment.id);
    setError("");
    try {
      await cacheAssessmentPackages(studentId, [assessment]);
      await refreshLocalData();
      setNotice(`${assessment.title} is saved and available offline on this device.`);
    } catch (storageError) {
      setError(storageError instanceof Error ? storageError.message : "This assessment could not be saved for offline use.");
    } finally {
      setSavingOffline(null);
    }
  }

  async function startAttempt(assessment: AssessmentListing, resume?: DraftAttempt) {
    try {
      let fullAssessment = packageById.get(assessment.id);
      if (!fullAssessment && navigator.onLine && !student?.offline) {
        const details = await assessmentApi.detail(assessment.id);
        fullAssessment = details.assessment;
        await cacheAssessmentPackages(studentId, [fullAssessment]);
      }
      if (!fullAssessment) {
        setError("This assessment is not saved on this device yet. Connect to the server and choose Save offline before starting it.");
        return;
      }
      if (resume) {
        navigate(`/assessments/${assessment.id}?attempt=${encodeURIComponent(resume.attemptId)}`);
        return;
      }
      const initial = initialDifficulty(assessment, attempts);
      const first = chooseQuestion(fullAssessment, [], initial);
      if (!first) throw new Error("This assessment does not contain any questions.");
      const now = new Date().toISOString();
      const draft: DraftAttempt = {
        attemptId: crypto.randomUUID(),
        assessmentId: assessment.id,
        studentId,
        startedAt: now,
        updatedAt: now,
        questionIds: [first.id],
        answers: {},
        currentIndex: 0,
        timerSeconds: timerMinutes * 60,
        initialDifficulty: initial,
        status: "in-progress",
        syncStatus: "not-needed",
      };
      await saveDraftAttempt(draft);
      await refreshLocalData();
      navigate(`/assessments/${assessment.id}?attempt=${encodeURIComponent(draft.attemptId)}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "This assessment could not be started.");
    }
  }

  async function updateAnswer(value: string) {
    if (!activeAttempt || !currentQuestion) return;
    const updated = {
      ...activeAttempt,
      answers: { ...activeAttempt.answers, [currentQuestion.id]: value },
      updatedAt: new Date().toISOString(),
    };
    setActiveAttempt(updated);
    try {
      await saveDraftAttempt(updated);
    } catch (storageError) {
      setError(storageError instanceof Error ? storageError.message : "Your answer could not be saved.");
    }
  }

  async function goToQuestion(index: number) {
    if (!activeAttempt || !selectedAssessment) return;
    const clampedIndex = Math.max(0, Math.min(index, activeAttempt.questionIds.length - 1));
    const updated = { ...activeAttempt, currentIndex: clampedIndex, updatedAt: new Date().toISOString() };
    setActiveAttempt(updated);
    try {
      await saveDraftAttempt(updated);
    } catch (storageError) {
      setError(storageError instanceof Error ? storageError.message : "Your assessment progress could not be saved.");
    }
  }

  async function nextQuestion() {
    if (!activeAttempt || !selectedAssessment || !currentQuestion) return;
    const existingIndex = activeAttempt.currentIndex + 1;
    if (existingIndex < activeAttempt.questionIds.length) {
      await goToQuestion(existingIndex);
      return;
    }
    const answerWasCorrect = isCorrect(currentQuestion, activeAttempt.answers[currentQuestion.id] ?? emptyAnswer);
    const currentDifficultyIndex = difficulties.indexOf(currentQuestion.difficulty);
    const targetIndex = Math.max(0, Math.min(difficulties.length - 1, currentDifficultyIndex + (answerWasCorrect ? 1 : -1)));
    const next = chooseQuestion(selectedAssessment, activeAttempt.questionIds, difficulties[targetIndex]);
    if (!next) return;
    const updated = {
      ...activeAttempt,
      questionIds: [...activeAttempt.questionIds, next.id],
      currentIndex: existingIndex,
      updatedAt: new Date().toISOString(),
    };
    setActiveAttempt(updated);
    try {
      await saveDraftAttempt(updated);
    } catch (storageError) {
      setError(storageError instanceof Error ? storageError.message : "Your next question could not be saved.");
    }
  }

  async function submitAttempt() {
    if (!activeAttempt || !selectedAssessment || activeAttempt.status !== "in-progress") return;
    const questionIds = [...activeAttempt.questionIds];
    for (const question of selectedAssessment.questions) {
      if (!questionIds.includes(question.id)) questionIds.push(question.id);
    }
    const draftToGrade = { ...activeAttempt, questionIds };
    const result = gradeLocally(selectedAssessment, draftToGrade);
    const submitted: DraftAttempt = {
      ...draftToGrade,
      status: "submitted",
      result,
      syncStatus: "pending",
      updatedAt: new Date().toISOString(),
    };
    setActiveAttempt(submitted);
    setError("");
    setNotice("Answers saved on this device. Checking whether the server can record the result…");
    try {
      await saveDraftAttempt(submitted);
      await refreshLocalData();
      if (navigator.onLine && !student?.offline) {
        const response = await assessmentApi.submit({
          attemptId: submitted.attemptId,
          assessmentId: submitted.assessmentId,
          startedAt: submitted.startedAt,
          submittedAt: result.submittedAt,
          answers: questionIds.map((questionId) => ({ questionId, answer: submitted.answers[questionId] ?? "" })),
        });
        const synced = { ...submitted, result: response.attempt, syncStatus: "synced" as const, updatedAt: new Date().toISOString() };
        await saveDraftAttempt(synced);
        setActiveAttempt(synced);
        setNotice("Assessment result received and saved by the EduSphere server.");
        await refreshLocalData();
      } else {
        setNotice("Result saved on this device. It will sync when the connection returns.");
      }
    } catch (submitError) {
      setNotice("Result is saved on this device and is waiting to sync.");
      setError(submitError instanceof Error ? submitError.message : "Server synchronization has not been confirmed.");
    }
  }

  function exitAttempt() {
    if (assessmentId) navigate(`/assessments/${assessmentId}`);
    else navigate("/assessments");
  }

  if (loading) {
    return <AssessmentLayout><div className="assessment-loading"><LoaderCircle size={20} /> Loading assessments…</div></AssessmentLayout>;
  }

  if (activeAttempt?.status === "in-progress" && selectedAssessment && currentQuestion) {
    const allQuestionIds = [...activeAttempt.questionIds];
    for (const question of selectedAssessment.questions) if (!allQuestionIds.includes(question.id)) allQuestionIds.push(question.id);
    const review = searchParams.get("review") === "1";
    return (
      <AssessmentLayout>
        <main className="assessment-main">
          <div className="assessment-quiz-top"><button className="assessment-back" onClick={exitAttempt} type="button"><ArrowLeft size={15} /> Save and exit</button><span className="assessment-demo-tag">DEMO ASSESSMENT</span></div>
          <section className="assessment-quiz-card">
            <div className="assessment-quiz-heading"><div><div className="section-eyebrow">{selectedAssessment.subject.toUpperCase()} · {currentQuestion.topic}</div><h1>{selectedAssessment.title}</h1></div>{activeAttempt.timerSeconds > 0 && <span className="assessment-timer"><Clock3 size={15} /> {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, "0")}</span>}</div>
            <div className="assessment-progress-label"><span>Question {activeAttempt.currentIndex + 1} of {selectedAssessment.questions.length}</span><span>{Math.round((activeAttempt.currentIndex + 1) / selectedAssessment.questions.length * 100)}%</span></div>
            <div className="assessment-progress-track"><i style={{ width: `${(activeAttempt.currentIndex + 1) / selectedAssessment.questions.length * 100}%` }} /></div>
            <div className="assessment-question-meta"><span>{currentQuestion.type.replace("-", " ")}</span><span>{currentQuestion.difficulty}</span><span>Adaptive difficulty</span></div>
            <h2 className="assessment-question-prompt">{currentQuestion.prompt}</h2>
            <AnswerInput key={currentQuestion.id} question={currentQuestion} value={activeAttempt.answers[currentQuestion.id] ?? ""} onChange={(value) => void updateAnswer(value)} />
            <div className="assessment-quiz-controls">
              <button className="assessment-quiet-button" disabled={activeAttempt.currentIndex === 0} onClick={() => void goToQuestion(activeAttempt.currentIndex - 1)} type="button"><ArrowLeft size={15} /> Previous</button>
              <div>{activeAttempt.currentIndex + 1 < selectedAssessment.questions.length
                ? <button className="button button-primary" onClick={() => void nextQuestion()} type="button">Save and continue <ArrowRight size={15} /></button>
                : <button className="button button-primary" onClick={() => navigate(`/assessments/${selectedAssessment.id}?attempt=${encodeURIComponent(activeAttempt.attemptId)}&review=1`)} type="button">Review answers <FileCheck2 size={15} /></button>}
              </div>
            </div>
            {review && <ReviewPanel assessment={selectedAssessment} attempt={activeAttempt} onGoTo={goToQuestion} onSubmit={() => void submitAttempt()} onClose={() => navigate(`/assessments/${selectedAssessment.id}?attempt=${encodeURIComponent(activeAttempt.attemptId)}`)} />}
            <div className="assessment-question-nav" aria-label="Question navigation">{allQuestionIds.map((questionId, index) => {
              const isSelected = index === activeAttempt.currentIndex;
              const hasAnswer = Boolean(activeAttempt.answers[questionId]?.trim());
              return <button aria-label={`Question ${index + 1}${hasAnswer ? ", answered" : ", unanswered"}`} aria-current={isSelected ? "step" : undefined} className={`${isSelected ? "question-nav-active" : ""}${hasAnswer ? " question-nav-answered" : ""}`} key={questionId} onClick={() => {
                if (index >= activeAttempt.questionIds.length) return;
                void goToQuestion(index);
              }} type="button">{index + 1}</button>;
            })}</div>
            <p className="assessment-adaptive-note">Difficulty starts from previous recorded performance and adjusts one level after each actual answer. This is a transparent rule-based demo—not AI.</p>
          </section>
          {error && <div className="assessment-error" role="alert">{error}</div>}
        </main>
      </AssessmentLayout>
    );
  }

  if (activeAttempt?.status === "submitted" && activeAttempt.result && selectedAssessment) {
    return (
      <AssessmentLayout>
        <main className="assessment-main">
          <div className="assessment-quiz-top"><button className="assessment-back" onClick={exitAttempt} type="button"><ArrowLeft size={15} /> Assessment dashboard</button><span className={`assessment-sync-tag ${activeAttempt.syncStatus}`}>{activeAttempt.syncStatus === "synced" ? <><Check size={13} /> Server recorded</> : <><WifiOff size={13} /> Saved on device · sync pending</>}</span></div>
          <ResultPanel assessment={selectedAssessment} result={activeAttempt.result} onRetake={() => {
            const listing = assessments.find((assessment) => assessment.id === selectedAssessment.id);
            if (listing) void startAttempt(listing);
          }} />
          {notice && <div className="assessment-notice" role="status">{notice}</div>}
          {error && <div className="assessment-error" role="alert">{error}</div>}
        </main>
      </AssessmentLayout>
    );
  }

  if (assessmentId) {
    const packageData = packageById.get(assessmentId);
    const listing = assessments.find((assessment) => assessment.id === assessmentId);
    const draft = attempts.find((attempt) => attempt.assessmentId === assessmentId && attempt.status === "in-progress");
    if (!packageData || !listing) {
      return <AssessmentLayout><main className="assessment-main"><div className="assessment-error" role="alert">{error || "This assessment is not available on this device."}</div><button className="assessment-back" onClick={exitAttempt} type="button"><ArrowLeft size={15} /> Back to assessments</button></main></AssessmentLayout>;
    }
    return (
      <AssessmentLayout>
        <main className="assessment-main">
          <div className="assessment-quiz-top"><button className="assessment-back" onClick={exitAttempt} type="button"><ArrowLeft size={15} /> All assessments</button><span className="assessment-demo-tag">DEMO ASSESSMENT</span></div>
          <section className="assessment-intro-card"><div className="assessment-subject-chip">{listing.subject}</div><h1>{listing.title}</h1><p>{listing.description}</p><div className="assessment-info-row"><span><FileCheck2 size={15} /> {listing.questionCount} questions</span><span><Clock3 size={15} /> {listing.estimatedMinutes} min suggested</span><span><Download size={15} /> {localPackages.some((item) => item.id === listing.id) ? "Saved offline" : "Online only"}</span></div>
            <div className="assessment-level-info"><Lightbulb size={17} /><span>Difficulty uses your prior recorded scores for this assessment. The sequence then moves up after a correct answer or down after a missed answer.</span></div>
            <label className="assessment-timer-select"><span>Optional timer</span><select value={timerMinutes} onChange={(event) => setTimerMinutes(Number(event.target.value))}><option value={0}>No timer</option><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={15}>15 minutes</option></select></label>
            <div className="assessment-start-actions">{draft
              ? <button className="button button-primary" onClick={() => void startAttempt(listing, draft)} type="button">Continue unfinished assessment <ArrowRight size={15} /></button>
              : <button className="button button-primary" onClick={() => void startAttempt(listing)} type="button">Start assessment <ArrowRight size={15} /></button>}
              {!localPackages.some((item) => item.id === listing.id) && <button className="assessment-save-offline" disabled={savingOffline === listing.id} onClick={() => void saveOffline(packageData)} type="button">{savingOffline === listing.id ? <LoaderCircle size={15} /> : <Download size={15} />} Save assessment offline</button>}
            </div>
          </section>
          {error && <div className="assessment-error" role="alert">{error}</div>}
        </main>
      </AssessmentLayout>
    );
  }

  const submittedAttempts = attempts.filter((attempt) => attempt.status === "submitted" && attempt.result);
  const unfinishedAttempts = attempts.filter((attempt) => attempt.status === "in-progress");
  const historyByAssessment = new Map<string, DraftAttempt[]>();
  for (const attempt of submittedAttempts) {
    const list = historyByAssessment.get(attempt.assessmentId) ?? [];
    list.push(attempt);
    historyByAssessment.set(attempt.assessmentId, list);
  }
  const topicRecommendations = [...new Set(submittedAttempts.flatMap((attempt) => attempt.result?.weakTopics ?? []))];
  return (
    <AssessmentLayout>
      <main className="assessment-main assessment-dashboard">
        <div className="assessment-page-heading"><div><div className="section-eyebrow">PRACTISE · LEARN · TRY AGAIN</div><h1>Adaptive Assessments</h1><p>Demo quizzes with scores calculated from your submitted answers. Difficulty changes use a transparent rule, not AI.</p></div><span className={`assessment-connect ${online ? "connected" : "disconnected"}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? "Connection available" : "Offline"}</span></div>
        {error && <div className="assessment-error" role="alert">{error}</div>}
        {notice && <div className="assessment-notice" role="status">{notice}</div>}
        {unfinishedAttempts.length > 0 && <section className="assessment-section"><div className="assessment-section-title"><div><div className="section-eyebrow">SAVED ON THIS DEVICE</div><h2>Continue an unfinished assessment</h2></div></div><div className="assessment-continue-list">{unfinishedAttempts.map((attempt) => {
          const assessment = assessments.find((item) => item.id === attempt.assessmentId);
          if (!assessment) return null;
          return <article className="assessment-continue-card" key={attempt.attemptId}><span className="assessment-card-icon"><FileCheck2 size={18} /></span><div><b>{assessment.title}</b><small>Question {attempt.currentIndex + 1} of {assessment.questionCount} · Answers saved locally</small></div><button className="assessment-card-action" onClick={() => navigate(`/assessments/${attempt.assessmentId}?attempt=${encodeURIComponent(attempt.attemptId)}`)} type="button">Continue <ArrowRight size={14} /></button></article>;
        })}</div></section>}
        {topicRecommendations.length > 0 && <section className="assessment-recommendation"><div><div className="section-eyebrow">BASED ON YOUR ANSWERS</div><h2>Topics to practise next</h2><p>{topicRecommendations.join(" · ")}</p></div><Link to="/resources">Find learning resources <ArrowRight size={14} /></Link><Link to="/skills">Try a skill activity <ArrowRight size={14} /></Link></section>}
        <section className="assessment-section">
          <div className="assessment-section-title"><div><div className="section-eyebrow">DEMO QUESTION BANK</div><h2>Choose an assessment</h2></div><label className="assessment-timer-select assessment-dashboard-timer"><span>Optional timer</span><select value={timerMinutes} onChange={(event) => setTimerMinutes(Number(event.target.value))}><option value={0}>No timer</option><option value={5}>5 min</option><option value={10}>10 min</option><option value={15}>15 min</option></select></label></div>
          <div className="assessment-filters"><label><span>Subject</span><select aria-label="Filter assessments by subject" value={category} onChange={(event) => { setCategory(event.target.value); setTopic(""); }}><option value="">All subjects</option>{assessmentSubjects.map((subjectName) => <option key={subjectName}>{subjectName}</option>)}</select></label><label><span>Topic</span><select aria-label="Filter assessments by topic" value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">All topics</option>{availableTopics.map((topicName) => <option key={topicName}>{topicName}</option>)}</select></label></div>
          <div className="assessment-card-grid">{filteredAssessments.map((assessment) => {
            const history = historyByAssessment.get(assessment.id) ?? [];
            const best = Math.max(assessment.bestAccuracy, ...history.map((attempt) => attempt.result?.accuracy ?? 0));
            const hasSavedPackage = localPackages.some((item) => item.id === assessment.id);
            return <article className="assessment-list-card" key={assessment.id}>
              <div className="assessment-list-card-top"><span className="assessment-subject-chip">{assessment.subject}</span><span className="assessment-demo-label">Demo</span></div>
              <h3>{assessment.title}</h3><p>{assessment.description}</p>
              <div className="assessment-list-meta"><span><FileCheck2 size={14} /> {assessment.questionCount} questions</span><span><Clock3 size={14} /> ~{assessment.estimatedMinutes} min</span></div>
              <div className="assessment-score-row"><span>{history.length || assessment.previousAttempts ? `${history.length || assessment.previousAttempts} previous attempt${(history.length || assessment.previousAttempts) === 1 ? "" : "s"}` : "Not attempted"}</span>{best > 0 && <b>Best: {best}%</b>}</div>
              <div className="assessment-list-actions"><Link className="assessment-card-action" to={`/assessments/${assessment.id}`}>View &amp; start <ArrowRight size={14} /></Link>{hasSavedPackage ? <span className="assessment-offline-saved"><Check size={13} /> Offline ready</span> : <button className="assessment-card-download" disabled={savingOffline === assessment.id} onClick={() => void saveOffline(assessment)} type="button">{savingOffline === assessment.id ? <LoaderCircle size={14} /> : <Download size={14} />} Save offline</button>}</div>
            </article>;
          })}</div>
          {filteredAssessments.length === 0 && <p className="assessment-empty">No assessments match those filters.</p>}
        </section>
        <section className="assessment-section assessment-history-section"><div className="assessment-section-title"><div><div className="section-eyebrow">YOUR RECORDED ANSWERS</div><h2>Completed assessments</h2></div></div>
          {submittedAttempts.length ? <div className="assessment-history-list">{submittedAttempts.map((attempt) => {
            const assessment = assessments.find((item) => item.id === attempt.assessmentId);
            return <Link className="assessment-history-row" key={attempt.attemptId} to={`/assessments/${attempt.assessmentId}?attempt=${encodeURIComponent(attempt.attemptId)}`}><span className="assessment-history-icon"><Target size={17} /></span><span><b>{assessment?.title ?? "Assessment"}</b><small>{new Date(attempt.result!.submittedAt).toLocaleString()} · {attempt.syncStatus === "synced" ? "Server recorded" : "Sync pending"}</small></span><strong>{attempt.result!.score}/{attempt.result!.total} · {attempt.result!.accuracy}%</strong><ArrowRight size={15} /></Link>;
          })}</div> : <div className="assessment-empty">Completed assessment results will appear here after you submit a demo quiz.</div>}
        </section>
        <div className="assessment-adaptive-note dashboard-adaptive-note">Adaptive behaviour is rule-based and uses your actual submitted answers and prior recorded scores. Results are not AI-generated or mastery claims.</div>
      </main>
    </AssessmentLayout>
  );
}

function AnswerInput({ question, value, onChange }: { question: AssessmentQuestion; value: string; onChange: (value: string) => void }) {
  if (question.type === "multiple-choice") {
    return <div className="assessment-answer-options">{question.options.map((option, index) => <label className={`assessment-option${value === option ? " option-selected" : ""}`} key={option}><input checked={value === option} name={question.id} onChange={() => onChange(option)} type="radio" /><span>{String.fromCharCode(65 + index)}</span>{option}</label>)}</div>;
  }
  if (question.type === "true-false") {
    return <div className="assessment-answer-options answer-binary">{["true", "false"].map((option) => <label className={`assessment-option${value === option ? " option-selected" : ""}`} key={option}><input checked={value === option} name={question.id} onChange={() => onChange(option)} type="radio" /><span>{option === "true" ? "T" : "F"}</span>{option === "true" ? "True" : "False"}</label>)}</div>;
  }
  return <label className="assessment-text-answer"><span>{question.type === "fill-blank" ? "Your answer" : question.type === "programming" ? "Write your answer or code expression" : "Your short answer"}</span><textarea maxLength={2000} onChange={(event) => onChange(event.target.value)} placeholder={question.type === "programming" ? "Enter a short expression or answer…" : "Type your answer…"} rows={question.type === "programming" ? 5 : 3} value={value} /></label>;
}

function ReviewPanel({ assessment, attempt, onGoTo, onSubmit, onClose }: { assessment: AssessmentPackage; attempt: DraftAttempt; onGoTo: (index: number) => Promise<void>; onSubmit: () => void; onClose: () => void }) {
  return <div className="assessment-review" role="dialog" aria-modal="true" aria-labelledby="assessment-review-title"><div className="assessment-review-header"><div><div className="section-eyebrow">CHECK BEFORE SUBMITTING</div><h2 id="assessment-review-title">Review your answers</h2></div><button aria-label="Close review" onClick={onClose} type="button"><XCircle size={19} /></button></div><div className="assessment-review-list">{attempt.questionIds.map((questionId, index) => {
    const question = assessment.questions.find((item) => item.id === questionId);
    if (!question) return null;
    const answer = attempt.answers[questionId] ?? "";
    return <button className="assessment-review-item" key={questionId} onClick={() => { void onGoTo(index); onClose(); }} type="button"><span>Q{index + 1}</span><span><b>{question.prompt}</b><small>{answer || "Not answered"}</small></span><ArrowRight size={14} /></button>;
  })}</div><div className="assessment-review-actions"><button className="assessment-quiet-button" onClick={onClose} type="button">Continue reviewing</button><button className="button button-primary" onClick={onSubmit} type="button">Submit assessment <Check size={15} /></button></div></div>;
}

function ResultPanel({ assessment, result, onRetake }: { assessment: AssessmentPackage; result: AssessmentAttempt; onRetake: () => void }) {
  return <section className="assessment-result">
    <div className="assessment-result-heading"><span className="assessment-result-icon"><Target size={22} /></span><div><div className="section-eyebrow">ASSESSMENT RESULTS · DEMO</div><h1>{assessment.title}</h1><p>Score calculated from your saved answers.</p></div></div>
    <div className="assessment-result-metrics"><div><strong>{result.score}<small>/{result.total}</small></strong><span>Correct answers</span></div><div><strong>{result.accuracy}%</strong><span>Accuracy</span></div><div><strong>{result.questions.length - result.score}</strong><span>Incorrect or unanswered</span></div></div>
    <section className="assessment-topic-results"><div className="assessment-section-title"><div><div className="section-eyebrow">WHAT TO PRACTISE</div><h2>Topic-wise performance</h2></div></div>
      {result.topicResults.map((topic) => <div className="assessment-topic-row" key={topic.topic}><span>{topic.topic}</span><div className="assessment-topic-track"><i className={topic.accuracy < 60 ? "topic-needs-work" : ""} style={{ width: `${topic.accuracy}%` }} /></div><strong>{topic.correct}/{topic.total} · {topic.accuracy}%</strong></div>)}
      {result.weakTopics.length > 0 ? <div className="assessment-improve"><Lightbulb size={17} /><span><b>Suggested practice:</b> {result.weakTopics.join(", ")}</span></div> : <div className="assessment-strength"><Check size={16} /> No topic fell below 60% on this attempt. Keep practising to build consistency.</div>}
    </section>
    <section className="assessment-answer-review"><div className="assessment-section-title"><div><div className="section-eyebrow">FEEDBACK AND EXPLANATIONS</div><h2>Review each answer</h2></div></div>
      {result.questions.map((question, index) => <article className={`assessment-feedback-card${question.correct ? " answer-correct" : " answer-incorrect"}`} key={question.questionId}><div className="assessment-feedback-title"><span>Question {index + 1} · {question.topic}</span><b>{question.correct ? <><Check size={14} /> Correct</> : <><XCircle size={14} /> Review</>}</b></div><p>{question.prompt}</p><div className="assessment-answer-pair"><span>Your answer</span><b>{question.answer || "Not answered"}</b></div>{!question.correct && <div className="assessment-answer-pair answer-key"><span>Correct answer</span><b>{question.correctAnswer}</b></div>}<div className="assessment-explanation"><Lightbulb size={15} /><span>{question.explanation}</span></div></article>)}
    </section>
    <div className="assessment-result-actions"><button className="button button-primary" onClick={onRetake} type="button"><RotateCcw size={15} /> Try another attempt</button><Link className="assessment-quiet-button" to="/assessments">Back to assessments <ArrowRight size={14} /></Link>{result.weakTopics.length > 0 && <Link className="assessment-quiet-button" to={`/resources?subject=${encodeURIComponent(assessment.subject)}`}>Find related resources <BookOpen size={14} /></Link>}</div>
  </section>;
}

function AssessmentLayout({ children }: { children: React.ReactNode }) {
  return <div className="assessment-page"><header className="assessment-header"><Link aria-label="EduSphere home" className="brand" to="/"><span className="brand-mark"><BookOpen size={20} /></span><span>edu<span>sphere</span></span></Link><nav aria-label="Assessment navigation"><Link to="/dashboard">Dashboard</Link><Link to="/resources">Resources</Link><Link to="/skills">Skills</Link><Link className="assessment-nav-active" to="/assessments">Assessments</Link></nav><Link className="assessment-dashboard-link" to="/dashboard"><ArrowLeft size={15} /> My dashboard</Link></header>{children}</div>;
}
