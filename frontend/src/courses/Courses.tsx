import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Bookmark, Check, Clock3, Download, GraduationCap, WifiOff } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { courseApi, type AdminCourse, type CourseBundle, type CourseLesson, type LearningCourse } from "../auth/api";
import { useStudentAuth } from "../auth/AuthContext";
import { getCachedCourseBundle, listCachedCourseBundles, saveCourseLessonProgress, cacheCourseBundle } from "../offline/offlineStorage";
import { runSynchronization } from "../sync/syncEngine";

const subjects = ["All subjects", "Mathematics", "Physics", "Chemistry", "Biology", "Computer Science"];

export function CourseCatalogPage() {
  const { student } = useStudentAuth();
  const [courses, setCourses] = useState<LearningCourse[]>([]);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("All subjects");
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadCourses() {
      if (!student?.id) return;
      setLoading(true);
      setError("");
      try {
        if (!navigator.onLine || student.offline) throw new Error("offline");
        const response = await courseApi.list();
        if (active) {
          setCourses(response.courses);
          setOffline(false);
        }
        try {
          const cached = await listCachedCourseBundles(student.id);
          if (active) setCourses((current) => mergeCourses(response.courses, current, cached.map((bundle) => bundle.course)));
        } catch (storageError) {
          if (active) setError(storageError instanceof Error ? `Courses are online, but the offline catalogue could not be read: ${storageError.message}` : "Courses are online, but saved course data could not be read.");
        }
      } catch (requestError) {
        try {
          const cached = await listCachedCourseBundles(student.id);
          if (!active) return;
          setCourses(cached.map((bundle) => bundle.course));
          setOffline(true);
          setError(cached.length
            ? "Offline catalogue: these are courses you opened previously while connected."
            : requestError instanceof Error && requestError.message !== "offline"
              ? `Course catalogue unavailable: ${requestError.message} No course content has been saved on this device yet.`
              : "No course content has been saved on this device yet. Connect once and open a course to make its lessons available offline.");
        } catch (storageError) {
          if (active) setError(storageError instanceof Error ? storageError.message : "The saved course catalogue could not be opened.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadCourses();
    return () => { active = false; };
  }, [student?.id, student?.offline]);

  const visibleCourses = useMemo(() => courses.filter((course) => {
    const matchesSubject = subject === "All subjects" || course.subject === subject;
    const searchable = `${course.title} ${course.description} ${course.subject} ${course.level}`.toLowerCase();
    return matchesSubject && searchable.includes(query.trim().toLowerCase());
  }), [courses, query, subject]);

  return (
    <main className="course-page">
      <header className="course-page-header">
        <Link className="course-back-link" to="/dashboard"><ArrowLeft size={17} /> My dashboard</Link>
        <span className="course-demo-label"><GraduationCap size={16} /> Original EduSphere lessons</span>
      </header>
      <section className="course-intro">
        <div className="section-eyebrow">LEARN AT YOUR OWN PACE</div>
        <h1>Learning courses</h1>
        <p>Written lessons, worked examples and practice questions designed for EduSphere. Open a course while connected to keep its lessons on this device for offline study.</p>
        <div className="course-filter-row">
          <label className="course-search">
            <span className="sr-only">Search courses</span>
            <BookOpen size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search courses or subjects" />
          </label>
          <label className="course-subject-filter">
            <span className="sr-only">Filter by subject</span>
            <select value={subject} onChange={(event) => setSubject(event.target.value)}>
              {subjects.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        </div>
        {offline && <div className="course-offline-message"><WifiOff size={17} /> {error}</div>}
        {!offline && error && <div className="course-error-message" role="alert">{error}</div>}
      </section>
      <section className="course-card-grid" aria-live="polite">
        {loading && <div className="course-state">Loading courses…</div>}
        {!loading && visibleCourses.map((course) => (
          <article className="learning-course-card" key={course.id}>
            <div className="course-card-icon"><BookOpen size={21} /></div>
            <div className="course-card-tags"><span>{course.subject}</span><span>{course.level}</span></div>
            <h2>{course.title}</h2>
            <p>{course.description}</p>
            <div className="course-card-meta"><span><BookOpen size={15} /> {course.lessonCount} lessons</span><span><Clock3 size={15} /> {course.estimatedMinutes} min</span></div>
            <div className="course-progress-track" aria-label={`${course.progressPercent}% complete`}><span style={{ width: `${course.progressPercent}%` }} /></div>
            <div className="course-card-footer">
              <span>{course.completedLessons}/{course.lessonCount} lessons complete</span>
              <Link to={`/courses/${encodeURIComponent(course.id)}`}>Open course <ArrowRight size={15} /></Link>
            </div>
          </article>
        ))}
        {!loading && visibleCourses.length === 0 && <div className="course-state">No matching courses were found. Try another subject or search term.</div>}
      </section>
      <p className="course-attribution">Course content is original EduSphere demonstration material. No external textbooks, videos, or third-party learning files are included.</p>
    </main>
  );
}

export function CoursePage() {
  const { courseId = "", lessonId } = useParams();
  const { student } = useStudentAuth();
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [storageError, setStorageError] = useState("");
  const lastAccessedLesson = useRef("");

  useEffect(() => {
    let active = true;
    async function loadCourse() {
      if (!student?.id || !courseId) return;
      setLoading(true);
      setError("");
      setStorageError("");
      try {
        if (!navigator.onLine || student.offline) throw new Error("offline");
        const response = await courseApi.detail(courseId);
        if (active) {
          setBundle(response);
          setOffline(false);
        }
        try {
          await cacheCourseBundle(student.id, response);
          if (active) setSavedOffline(true);
        } catch (cacheError) {
          if (active) setStorageError(cacheError instanceof Error ? cacheError.message : "Lessons could not be saved for offline use.");
        }
      } catch (requestError) {
        try {
          const cached = await getCachedCourseBundle(student.id, courseId);
          if (!active) return;
          if (cached) {
            setBundle(cached);
            setOffline(true);
            setSavedOffline(true);
            setError("Showing the saved lesson copy. Progress remains on this device until synchronization is confirmed.");
          } else {
            setOffline(!navigator.onLine || Boolean(student.offline));
            setError(requestError instanceof Error && requestError.message !== "offline"
              ? requestError.message
              : "This course has not been saved for offline study. Connect to the internet and open it once to cache its lessons.");
          }
        } catch (storageError) {
          if (active) setError(storageError instanceof Error ? storageError.message : "The saved course could not be opened.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadCourse();
    return () => { active = false; };
  }, [student?.id, student?.offline, courseId]);

  useEffect(() => {
    setAnswers({});
    setSubmitted(false);
  }, [lessonId]);

  const lesson = bundle?.lessons.find((item) => item.id === lessonId) ?? null;

  useEffect(() => {
    if (!student?.id || !bundle || !lesson) return;
    const visitKey = `${student.id}:${lesson.id}`;
    if (lastAccessedLesson.current === visitKey) return;
    lastAccessedLesson.current = visitKey;
    void saveCourseLessonProgress(student.id, bundle.course.id, lesson)
      .then(async () => {
        if (navigator.onLine && !student.offline) {
          const result = await runSynchronization(student.id);
          if (result.failed || result.pending) {
            setError("Lesson access is saved locally. The server has not confirmed synchronization yet.");
          }
        }
      })
      .catch((progressError: unknown) => {
        setError(progressError instanceof Error ? progressError.message : "Lesson access could not be saved.");
      });
  }, [bundle, lesson, student?.id, student?.offline]);

  async function saveProgress(update: Partial<Pick<CourseLesson, "completed" | "bookmarked">>) {
    if (!student?.id || !bundle || !lesson) return;
    setSaving(true);
    setError("");
    try {
      const next = {
        ...lesson,
        completed: update.completed ?? lesson.completed,
        bookmarked: update.bookmarked ?? lesson.bookmarked,
        lastAccessedAt: new Date().toISOString(),
      };
      setBundle({ ...bundle, lessons: bundle.lessons.map((item) => item.id === lesson.id ? next : item) });
      await saveCourseLessonProgress(student.id, bundle.course.id, lesson, update);
      if (navigator.onLine && !student.offline) {
        const result = await runSynchronization(student.id);
        if (result.failed || result.pending) {
          setError("Saved on this device. The server has not confirmed synchronization yet; this change will be retried.");
        }
      } else {
        setError("Saved on this device. It will sync after you reconnect.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Progress could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const score = lesson?.questions.reduce((total, question) =>
    total + (answers[question.id]?.trim().toLowerCase() === question.answer.trim().toLowerCase() ? 1 : 0), 0) ?? 0;

  if (loading) return <main className="course-page"><div className="course-state">Loading course lessons…</div></main>;
  if (!bundle) return (
    <main className="course-page">
      <Link className="course-back-link" to="/courses"><ArrowLeft size={17} /> All courses</Link>
      <div className="course-state" role="alert">{error || "This course could not be opened."}</div>
    </main>
  );

  return (
    <main className="course-page">
      <header className="course-page-header">
        <Link className="course-back-link" to="/courses"><ArrowLeft size={17} /> All courses</Link>
        <div className="course-header-status">{offline && <span><WifiOff size={15} /> Offline copy</span>}{savedOffline && <span><Download size={15} /> Saved on this device</span>}</div>
      </header>
      {(error || storageError) && <div className="course-offline-message" role="status">{error || `Course content is open, but was not saved for offline use: ${storageError}`}</div>}
      <div className="course-layout">
        <aside className="course-outline">
          <div className="section-eyebrow">{bundle.course.subject} · {bundle.course.level}</div>
          <h1>{bundle.course.title}</h1>
          <p>{bundle.course.description}</p>
          <div className="course-outline-progress"><span>{bundle.lessons.filter((item) => item.completed).length} of {bundle.lessons.length} lessons complete</span><div className="course-progress-track"><span style={{ width: `${bundle.lessons.length ? bundle.lessons.filter((item) => item.completed).length / bundle.lessons.length * 100 : 0}%` }} /></div></div>
          <nav aria-label="Course lessons" className="course-lesson-nav">
            {bundle.lessons.map((item, index) => (
              <Link className={`course-lesson-link${item.id === lessonId ? " selected" : ""}`} key={item.id} to={`/courses/${encodeURIComponent(bundle.course.id)}/${encodeURIComponent(item.id)}`}>
                <span className="course-lesson-number">{item.completed ? <Check size={15} /> : index + 1}</span><span>{item.title}<small>{item.estimatedMinutes} min</small></span><ArrowRight size={15} />
              </Link>
            ))}
          </nav>
          <div className="course-license"><b>{bundle.course.sourceName}</b><span>{bundle.course.licenseInfo}</span></div>
        </aside>
        <article className="course-lesson-content">
          {!lessonId ? (
            <section className="course-welcome">
              <div className="course-card-icon"><GraduationCap size={23} /></div>
              <div className="section-eyebrow">YOUR COURSE</div>
              <h2>Small steps build strong understanding.</h2>
              <p>Choose a lesson from the course outline. This course and its written lessons are saved on this device after opening while connected.</p>
              {bundle.lessons[0] && <Link className="button button-primary" to={`/courses/${encodeURIComponent(bundle.course.id)}/${encodeURIComponent(bundle.lessons[0].id)}`}>Start first lesson <ArrowRight size={16} /></Link>}
            </section>
          ) : !lesson ? (
            <div className="course-state" role="alert">This lesson is not available in this course.</div>
          ) : (
            <>
              <div className="course-lesson-kicker"><span>LESSON</span><span><Clock3 size={15} /> {lesson.estimatedMinutes} minutes</span></div>
              <h2 className="course-lesson-title">{lesson.title}</h2>
              <section className="course-objectives"><h3>In this lesson</h3><ul>{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></section>
              {lesson.sections.map((section) => (
                <section className="course-lesson-section" key={section.heading}>
                  <h3>{section.heading}</h3>
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
                  {section.example && <div className="course-worked-example"><b>{section.example.title}</b><ol>{section.example.steps.map((step) => <li key={step}>{step}</li>)}</ol></div>}
                </section>
              ))}
              <section className="course-summary"><h3>Key ideas</h3><ul>{lesson.summary.map((point) => <li key={point}>{point}</li>)}</ul></section>
              <section className="course-practice">
                <div className="course-practice-heading"><div><div className="section-eyebrow">CHECK YOUR UNDERSTANDING</div><h3>Practice questions</h3></div>{submitted && <span className="course-score">{score}/{lesson.questions.length} correct</span>}</div>
                {lesson.questions.map((question) => (
                  <fieldset className="course-question" key={question.id}>
                    <legend>{question.prompt}</legend>
                    {question.options ? question.options.map((option) => (
                      <label key={option} className={`course-answer${submitted && option === question.answer ? " answer-correct" : ""}`}>
                        <input type="radio" name={question.id} value={option} checked={answers[question.id] === option} onChange={() => setAnswers({ ...answers, [question.id]: option })} disabled={submitted} />
                        {option}
                      </label>
                    )) : (
                      <input className="course-short-answer" value={answers[question.id] ?? ""} onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })} disabled={submitted} aria-label={`Answer: ${question.prompt}`} />
                    )}
                    {submitted && <p className={`course-explanation${answers[question.id]?.trim().toLowerCase() === question.answer.trim().toLowerCase() ? " correct" : ""}`}><b>{answers[question.id]?.trim().toLowerCase() === question.answer.trim().toLowerCase() ? "Correct." : `Answer: ${question.answer}.`}</b> {question.explanation}</p>}
                  </fieldset>
                ))}
                {!submitted && <button className="button button-primary" onClick={() => setSubmitted(true)} disabled={lesson.questions.some((question) => !answers[question.id]?.trim())}>Check answers</button>}
              </section>
              <div className="course-lesson-actions">
                <button className={`course-bookmark-button${lesson.bookmarked ? " bookmarked" : ""}`} onClick={() => void saveProgress({ bookmarked: !lesson.bookmarked })} disabled={saving}><Bookmark size={17} /> {lesson.bookmarked ? "Bookmarked" : "Bookmark lesson"}</button>
                <button className="button button-primary" onClick={() => void saveProgress({ completed: !lesson.completed })} disabled={saving}>{lesson.completed ? "Mark as not complete" : "Mark lesson complete"} <Check size={16} /></button>
              </div>
              <p className="course-content-credit">Original EduSphere demonstration lesson · {bundle.course.licenseInfo}</p>
            </>
          )}
        </article>
      </div>
    </main>
  );
}

export function AdminCoursesPage() {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [courseId, setCourseId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [courseDraft, setCourseDraft] = useState(emptyCourseDraft());
  const [lessonDraft, setLessonDraft] = useState(emptyLessonDraft());
  const [contentText, setContentText] = useState(emptyLessonContent());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedCourse = courses.find((course) => course.id === courseId) ?? null;

  async function loadCourses() {
    setError("");
    try {
      const response = await courseApi.adminList();
      setCourses(response.courses);
      return response.courses;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Course management data could not be loaded.");
      return [];
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCourses(); }, []);

  useEffect(() => {
    if (!courseId && !creatingCourse && courses.length) setCourseId(courses[0].id);
  }, [courseId, creatingCourse, courses]);

  useEffect(() => {
    const course = courses.find((item) => item.id === courseId);
    if (!course || creatingCourse) return;
    setCourseDraft({
      id: course.id,
      title: course.title,
      description: course.description,
      subject: course.subject,
      level: course.level,
      language: course.language,
      estimatedMinutes: String(course.estimatedMinutes),
      sourceName: course.sourceName,
      licenseInfo: course.licenseInfo,
      isPublished: course.isPublished,
    });
    setLessonId("");
    setLessonDraft(emptyLessonDraft());
    setContentText(emptyLessonContent());
  }, [courseId, courses, creatingCourse]);

  useEffect(() => {
    const lesson = selectedCourse?.lessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    setLessonDraft({
      id: lesson.id,
      title: lesson.title,
      estimatedMinutes: String(lesson.estimatedMinutes),
      sortOrder: String(lesson.sortOrder),
      isPublished: lesson.isPublished,
    });
    setContentText(JSON.stringify({
      objectives: lesson.objectives,
      sections: lesson.sections,
      summary: lesson.summary,
      questions: lesson.questions,
    }, null, 2));
  }, [lessonId, selectedCourse]);

  async function submitCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const details = {
        title: courseDraft.title.trim(),
        description: courseDraft.description.trim(),
        subject: courseDraft.subject.trim(),
        level: courseDraft.level.trim(),
        language: courseDraft.language.trim(),
        estimatedMinutes: Number(courseDraft.estimatedMinutes),
        sourceName: courseDraft.sourceName.trim(),
        licenseInfo: courseDraft.licenseInfo.trim(),
        isPublished: courseDraft.isPublished,
      };
      if (creatingCourse) {
        await courseApi.create({ id: courseDraft.id.trim(), ...details });
        setCourseId(courseDraft.id.trim());
        setCreatingCourse(false);
      } else {
        await courseApi.update(courseId, details);
      }
      await loadCourses();
      setMessage("Course details were saved by the server.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Course details were not saved.");
    } finally {
      setSaving(false);
    }
  }

  async function submitLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourse) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let content: Pick<CourseLesson, "objectives" | "sections" | "summary" | "questions">;
      try {
        content = JSON.parse(contentText);
      } catch {
        throw new Error("Lesson content must be valid JSON before it can be saved.");
      }
      await courseApi.saveLesson(selectedCourse.id, lessonDraft.id.trim(), {
        title: lessonDraft.title.trim(),
        estimatedMinutes: Number(lessonDraft.estimatedMinutes),
        sortOrder: Number(lessonDraft.sortOrder),
        isPublished: lessonDraft.isPublished,
        content,
      });
      await loadCourses();
      setLessonId(lessonDraft.id.trim());
      setMessage("Lesson content was saved by the server.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Lesson content was not saved.");
    } finally {
      setSaving(false);
    }
  }

  async function unpublishCourse() {
    if (!selectedCourse || !window.confirm("Unpublish this course? Its lessons and student progress will be retained.")) return;
    setSaving(true);
    setError("");
    try {
      await courseApi.unpublish(selectedCourse.id);
      await loadCourses();
      setMessage("Course unpublished. Its records and student progress were retained.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Course was not unpublished.");
    } finally {
      setSaving(false);
    }
  }

  async function unpublishLesson() {
    if (!selectedCourse || !lessonId || !window.confirm("Unpublish this lesson? Student progress will be retained.")) return;
    setSaving(true);
    setError("");
    try {
      await courseApi.unpublishLesson(selectedCourse.id, lessonId);
      await loadCourses();
      setLessonId("");
      setMessage("Lesson unpublished. Its content and student progress were retained.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Lesson was not unpublished.");
    } finally {
      setSaving(false);
    }
  }

  function startNewCourse() {
    setCreatingCourse(true);
    setCourseId("");
    setLessonId("");
    setCourseDraft(emptyCourseDraft());
    setLessonDraft(emptyLessonDraft());
    setContentText(emptyLessonContent());
    setMessage("");
    setError("");
  }

  function startNewLesson() {
    setLessonId("");
    setLessonDraft({ ...emptyLessonDraft(), sortOrder: String(selectedCourse?.lessons.length ?? 0) });
    setContentText(emptyLessonContent());
    setMessage("");
    setError("");
  }

  return (
    <main className="course-page admin-courses-page">
      <header className="course-page-header">
        <Link className="course-back-link" to="/admin"><ArrowLeft size={17} /> Admin dashboard</Link>
        <span className="course-demo-label">Authorized course management</span>
      </header>
      <section className="course-intro">
        <div className="section-eyebrow">ADMINISTRATION</div>
        <h1>Manage learning courses</h1>
        <p>Write and publish original lessons. Unpublishing hides content from students but retains records and progress.</p>
      </section>
      {error && <div className="course-error-message" role="alert">{error}</div>}
      {message && <div className="course-offline-message" role="status">{message}</div>}
      {loading ? <div className="course-state">Loading managed courses…</div> : (
        <div className="admin-course-management">
          <section className="admin-course-panel">
            <div className="admin-course-panel-heading"><h2>Course details</h2><button className="button button-primary" type="button" onClick={startNewCourse}>New course</button></div>
            <label className="admin-course-field"><span>Select course</span><select value={creatingCourse ? "__new__" : courseId} onChange={(event) => { setCreatingCourse(false); setCourseId(event.target.value); setMessage(""); }}>
              {creatingCourse && <option value="__new__">New course</option>}
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}{course.isPublished ? "" : " (unpublished)"}</option>)}
            </select></label>
            <form className="admin-course-form" onSubmit={(event) => void submitCourse(event)}>
              {creatingCourse && <AdminField label="Course ID" value={courseDraft.id} onChange={(id) => setCourseDraft({ ...courseDraft, id })} required />}
              <AdminField label="Title" value={courseDraft.title} onChange={(title) => setCourseDraft({ ...courseDraft, title })} required />
              <AdminField label="Subject" value={courseDraft.subject} onChange={(subject) => setCourseDraft({ ...courseDraft, subject })} required />
              <AdminField label="Class or level" value={courseDraft.level} onChange={(level) => setCourseDraft({ ...courseDraft, level })} required />
              <AdminField label="Language" value={courseDraft.language} onChange={(language) => setCourseDraft({ ...courseDraft, language })} required />
              <AdminField label="Estimated minutes" type="number" value={courseDraft.estimatedMinutes} onChange={(estimatedMinutes) => setCourseDraft({ ...courseDraft, estimatedMinutes })} required />
              <AdminField label="Attribution source" value={courseDraft.sourceName} onChange={(sourceName) => setCourseDraft({ ...courseDraft, sourceName })} required />
              <AdminField label="Licence and permission information" value={courseDraft.licenseInfo} onChange={(licenseInfo) => setCourseDraft({ ...courseDraft, licenseInfo })} required />
              <label className="admin-course-field"><span>Description</span><textarea rows={3} value={courseDraft.description} onChange={(event) => setCourseDraft({ ...courseDraft, description: event.target.value })} required /></label>
              <label className="course-publish-control"><input type="checkbox" checked={courseDraft.isPublished} onChange={(event) => setCourseDraft({ ...courseDraft, isPublished: event.target.checked })} /> Published to students</label>
              <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : creatingCourse ? "Create course" : "Save course"}</button>
              {!creatingCourse && selectedCourse?.isPublished && <button className="course-bookmark-button" type="button" onClick={() => void unpublishCourse()} disabled={saving}>Unpublish course</button>}
            </form>
          </section>
          <section className="admin-course-panel">
            <div className="admin-course-panel-heading"><h2>Written lessons</h2><button className="course-bookmark-button" type="button" onClick={startNewLesson} disabled={!selectedCourse}>New lesson</button></div>
            {!selectedCourse ? <p className="course-state">Create a course before adding lessons.</p> : (
              <>
                <label className="admin-course-field"><span>Select lesson</span><select value={lessonId} onChange={(event) => { setLessonId(event.target.value); setMessage(""); }}>
                  <option value="">New lesson</option>
                  {selectedCourse.lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}{lesson.isPublished ? "" : " (unpublished)"}</option>)}
                </select></label>
                <form className="admin-course-form" onSubmit={(event) => void submitLesson(event)}>
                  <AdminField label="Lesson ID" value={lessonDraft.id} onChange={(id) => setLessonDraft({ ...lessonDraft, id })} required />
                  <AdminField label="Lesson title" value={lessonDraft.title} onChange={(title) => setLessonDraft({ ...lessonDraft, title })} required />
                  <div className="admin-course-inline-fields">
                    <AdminField label="Estimated minutes" type="number" value={lessonDraft.estimatedMinutes} onChange={(estimatedMinutes) => setLessonDraft({ ...lessonDraft, estimatedMinutes })} required />
                    <AdminField label="Display order" type="number" value={lessonDraft.sortOrder} onChange={(sortOrder) => setLessonDraft({ ...lessonDraft, sortOrder })} required />
                  </div>
                  <label className="admin-course-field"><span>Lesson content (JSON)</span><textarea className="admin-course-json" rows={18} value={contentText} onChange={(event) => setContentText(event.target.value)} spellCheck={false} required /></label>
                  <p className="admin-course-hint">Required JSON fields: objectives, sections, summary, and questions. Video and file attachments are not configured in this editor.</p>
                  <label className="course-publish-control"><input type="checkbox" checked={lessonDraft.isPublished} onChange={(event) => setLessonDraft({ ...lessonDraft, isPublished: event.target.checked })} /> Published to students</label>
                  <button className="button button-primary" type="submit" disabled={saving || !selectedCourse}>{saving ? "Saving…" : "Save lesson"}</button>
                  {lessonId && selectedCourse.lessons.some((lesson) => lesson.id === lessonId && lesson.isPublished) && <button className="course-bookmark-button" type="button" onClick={() => void unpublishLesson()} disabled={saving}>Unpublish lesson</button>}
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function AdminField({ label, value, onChange, required, type = "text" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return <label className="admin-course-field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} /></label>;
}

function emptyCourseDraft() {
  return {
    id: "",
    title: "",
    description: "",
    subject: "",
    level: "",
    language: "English",
    estimatedMinutes: "30",
    sourceName: "Original EduSphere lesson",
    licenseInfo: "Original demonstration content written for EduSphere.",
    isPublished: true,
  };
}

function emptyLessonDraft() {
  return { id: "", title: "", estimatedMinutes: "15", sortOrder: "0", isPublished: true };
}

function emptyLessonContent() {
  return JSON.stringify({
    objectives: ["Describe the main learning objective."],
    sections: [{ heading: "Lesson section", paragraphs: ["Write original lesson content here."] }],
    summary: ["Summarize the key idea."],
    questions: [],
  }, null, 2);
}

function mergeCourses(...groups: LearningCourse[][]) {
  const byId = new Map<string, LearningCourse>();
  for (const group of groups) for (const course of group) byId.set(course.id, course);
  return [...byId.values()];
}
