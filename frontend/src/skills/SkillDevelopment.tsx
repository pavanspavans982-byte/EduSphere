import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, BookOpen, Check, Clock3, Code2, Compass, Lightbulb,
  Search, Sparkles, Target, WifiOff,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStudentAuth } from "../auth/AuthContext";
import { getSkill, recommendationReason, skillCategories, skills, type Skill, type SkillCategory, type SkillLesson } from "./skillCatalog";
import { listSkillProgress, recordSkillAction, type SkillProgressRecord } from "./skillStorage";
import { runSynchronization } from "../sync/syncEngine";

const categoryIcons: Record<SkillCategory, typeof Code2> = {
  Programming: Code2,
  "Web Development": Compass,
  "Computer Skills": BookOpen,
  "Communication Skills": Sparkles,
  "Problem-Solving Skills": Lightbulb,
  "Digital Literacy": WifiOff,
  "Basic Mathematics": Target,
  "Science and Technology": Compass,
};

function skillProgress(record: SkillProgressRecord | undefined, skill: Skill) {
  const completedLessons = Object.keys(record?.completedLessons ?? {}).length;
  const completedExercises = Object.keys(record?.completedExercises ?? {}).length;
  const totalActions = skill.lessons.length * 2;
  return {
    completedLessons,
    completedExercises,
    percent: Math.round((completedLessons + completedExercises) / totalActions * 100),
    started: Boolean(record),
    complete: completedLessons === skill.lessons.length && completedExercises === skill.lessons.length,
    currentLevel: skill.lessons.find((lesson) => !record?.completedLessons[lesson.id])?.level ?? "All levels completed",
  };
}

export function SkillDevelopmentPage() {
  const { skillId } = useParams();
  const navigate = useNavigate();
  const { student } = useStudentAuth();
  const [records, setRecords] = useState<SkillProgressRecord[]>([]);
  const [category, setCategory] = useState<SkillCategory | "All skills">("All skills");
  const [query, setQuery] = useState("");
  const [activeLesson, setActiveLesson] = useState<SkillLesson | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  const selectedSkill = skillId ? getSkill(skillId) : null;
  const recordBySkill = useMemo(() => new Map(records.map((record) => [record.skillId, record])), [records]);
  const profile = {
    course: student?.course ?? "",
    branch: student?.branch ?? "",
    interests: student?.interests ?? [],
  };
  const recommendations = skills
    .map((skill) => ({ skill, reason: recommendationReason(skill, profile) }))
    .filter((entry): entry is { skill: Skill; reason: string } => Boolean(entry.reason))
    .slice(0, 4);
  const visibleSkills = skills.filter((skill) =>
    (category === "All skills" || skill.category === category)
    && (!query.trim() || `${skill.name} ${skill.category} ${skill.description}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const startedCount = records.filter((record) => skills.some((skill) => skill.id === record.skillId && skillProgress(record, skill).started)).length;
  const completedCount = records.filter((record) => {
    const skill = getSkill(record.skillId);
    return skill ? skillProgress(record, skill).complete : false;
  }).length;
  const completedExerciseCount = records.reduce((total, record) => total + Object.keys(record.completedExercises).length, 0);

  useEffect(() => {
    let active = true;
    if (!student?.id) return;
    listSkillProgress(student.id)
      .then((loaded) => {
        if (active) {
          setRecords(loaded);
          setError("");
        }
      })
      .catch((storageError: unknown) => {
        if (active) setError(storageError instanceof Error ? storageError.message : "Your saved skill progress could not be opened.");
      });
    return () => { active = false; };
  }, [student?.id]);

  useEffect(() => {
    setActiveLesson(null);
    setNotice("");
  }, [skillId]);

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  async function recordAction(lesson: SkillLesson, type: "lesson-started" | "lesson-completed" | "exercise-completed") {
    if (!student?.id || !selectedSkill) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await recordSkillAction(student.id, selectedSkill.id, lesson.id, type);
      setRecords(await listSkillProgress(student.id));
      if (navigator.onLine && !student.offline) {
        const syncResult = await runSynchronization(student.id);
        setNotice(syncResult.failed > 0
          ? "Your skill activity is saved on this device and is waiting to sync."
          : type === "lesson-started"
            ? "Lesson opened. The server confirmed your activity."
            : type === "lesson-completed"
              ? "Lesson completion was recorded by the server."
              : "Exercise completion was recorded by the server.");
        if (syncResult.error) setError(syncResult.error);
      } else {
        setNotice(type === "lesson-started"
          ? "Lesson opened. Your activity is saved on this device and waiting to sync."
          : type === "lesson-completed"
            ? "Lesson completion saved on this device and waiting to sync."
            : "Exercise completion saved on this device and waiting to sync.");
      }
    } catch (storageError) {
      setError(storageError instanceof Error ? storageError.message : "Your skill activity could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function openLesson(lesson: SkillLesson) {
    setActiveLesson(lesson);
    void recordAction(lesson, "lesson-started");
  }

  if (skillId && !selectedSkill) {
    return <SkillLayout><div className="skill-not-found"><h1>Skill not found</h1><p>This skill may have been removed from the demo catalog.</p><Link className="button button-primary" to="/skills">Browse skills</Link></div></SkillLayout>;
  }

  return (
    <SkillLayout>
      <main className="skills-content">
        <div className="skills-page-top">
          <div className="section-eyebrow">LEARN BY DOING · DEMO LESSONS</div>
          <h1>{selectedSkill ? selectedSkill.name : "Skill Development"}</h1>
          <p>{selectedSkill ? selectedSkill.description : "Build practical abilities at your pace. Your progress reflects actions you record—not assumed mastery."}</p>
        </div>
        <div className="skill-storage-status" role="status">
          <span className={online ? "skill-status-online" : "skill-status-offline"}>{online ? "ONLINE" : "OFFLINE"}</span>
          <span>{online ? "Skill actions sync to EduSphere when the server confirms receipt." : "Offline learning is available. Skill progress is saved on this device and queued for synchronization."}</span>
        </div>

        {error && <div className="skills-alert" role="alert">{error}</div>}
        {notice && <div className="skills-notice" role="status">{notice}</div>}

        {selectedSkill ? (
          <>
            <div className="skills-detail-actions">
              <button className="skills-back-button" onClick={() => navigate("/skills")} type="button"><ArrowLeft size={16} /> All skills</button>
              <Link className="skills-resource-link" to={`/resources?subject=${encodeURIComponent(selectedSkill.resourceSubjects[0])}`}>
                Related learning resources <ArrowRight size={15} />
              </Link>
            </div>
            <section className="skill-detail-card">
              <div className="skill-detail-top">
                <span className="skill-detail-category">{selectedSkill.category}</span>
                <span className="skill-time"><Clock3 size={15} /> About {selectedSkill.estimatedHours} hours</span>
              </div>
              <h2>Three learning levels</h2>
              <p>Complete a lesson and its practical exercise to record all evidence for that level. Progress is stored locally on this device.</p>
              <div className="skill-detail-progress">
                <div><span>RECORDED PROGRESS</span><strong>{skillProgress(recordBySkill.get(selectedSkill.id), selectedSkill).percent}%</strong></div>
                <div className="skill-progress-track"><i style={{ width: `${skillProgress(recordBySkill.get(selectedSkill.id), selectedSkill).percent}%` }} /></div>
              </div>
              {recordBySkill.get(selectedSkill.id) && (
                <button className="skill-continue-button" onClick={() => {
                  const lastLesson = selectedSkill.lessons.find((lesson) => lesson.id === recordBySkill.get(selectedSkill.id)?.lastLessonId);
                  if (lastLesson) openLesson(lastLesson);
                }} type="button"><ArrowRight size={14} /> Continue your last lesson</button>
              )}
              {(() => {
                const nextLesson = selectedSkill.lessons.find((lesson) => !recordBySkill.get(selectedSkill.id)?.completedLessons[lesson.id]);
                return nextLesson && <button className="skill-continue-button" onClick={() => openLesson(nextLesson)} type="button"><Target size={14} /> Recommended next lesson: {nextLesson.title}</button>;
              })()}
            </section>
            <section className="skill-lessons" aria-label={`${selectedSkill.name} lessons`}>
              {selectedSkill.lessons.map((lesson, index) => {
                const activity = recordBySkill.get(selectedSkill.id);
                const lessonDone = Boolean(activity?.completedLessons[lesson.id]);
                const exerciseDone = Boolean(activity?.completedExercises[lesson.id]);
                const Icon = index === 0 ? BookOpen : index === 1 ? Target : Sparkles;
                return (
                  <article className={`skill-lesson-card${lessonDone ? " lesson-completed" : ""}`} key={lesson.id}>
                    <div className="skill-lesson-level"><span className="skill-lesson-icon"><Icon size={18} /></span><span>{lesson.level}</span><small>{lesson.estimatedMinutes} min</small></div>
                    <h3>{lesson.title}</h3>
                    <p>{lesson.outcome}</p>
                    <div className="skill-lesson-checks"><span className={lessonDone ? "check-complete" : ""}>{lessonDone && <Check size={13} />} Lesson {lessonDone ? "completed" : "not completed"}</span><span className={exerciseDone ? "check-complete" : ""}>{exerciseDone && <Check size={13} />} Exercise {exerciseDone ? "completed" : "not completed"}</span></div>
                    <button className="skill-lesson-open" disabled={busy} onClick={() => openLesson(lesson)} type="button">{lessonDone ? "Review lesson" : "Start lesson"} <ArrowRight size={14} /></button>
                  </article>
                );
              })}
            </section>
            {activeLesson && (
              <section className="skill-activity-panel" aria-live="polite">
                <div className="skill-activity-heading"><div><div className="section-eyebrow">{activeLesson.level.toUpperCase()} LESSON</div><h2>{activeLesson.title}</h2></div><button className="skills-back-button" onClick={() => setActiveLesson(null)} type="button">Close</button></div>
                <p>{activeLesson.outcome}</p>
                <ol className="skill-step-list">{activeLesson.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
                <div className="skill-exercise-box"><span className="section-eyebrow">PRACTICAL EXERCISE</span><h3>{activeLesson.exerciseTitle}</h3><p>{activeLesson.exercisePrompt}</p><small>This is a self-reported completion record; EduSphere does not automatically grade this exercise.</small></div>
                <div className="skill-activity-buttons">
                  <button className="button button-primary" disabled={busy || Boolean(recordBySkill.get(selectedSkill.id)?.completedLessons[activeLesson.id])} onClick={() => void recordAction(activeLesson, "lesson-completed")} type="button">
                    <Check size={16} /> {recordBySkill.get(selectedSkill.id)?.completedLessons[activeLesson.id] ? "Lesson completion recorded" : "Mark lesson complete"}
                  </button>
                  <button className="button button-soft" disabled={busy || !recordBySkill.get(selectedSkill.id)?.completedLessons[activeLesson.id] || Boolean(recordBySkill.get(selectedSkill.id)?.completedExercises[activeLesson.id])} onClick={() => void recordAction(activeLesson, "exercise-completed")} type="button">
                    <Target size={16} /> {recordBySkill.get(selectedSkill.id)?.completedExercises[activeLesson.id] ? "Exercise completion recorded" : "I completed the exercise"}
                  </button>
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            <section className="skill-metrics" aria-label="Recorded skill progress">
              <Metric icon={<BookOpen size={18} />} label="Skills started" value={startedCount} />
              <Metric icon={<Check size={18} />} label="Skills completed" value={completedCount} />
              <Metric icon={<Target size={18} />} label="Exercises completed" value={completedExerciseCount} />
            </section>
            {records.length > 0 && (
              <section className="skill-recent-section">
                <div className="skill-section-heading"><div><div className="section-eyebrow">PICK UP WHERE YOU LEFT OFF</div><h2>Recently accessed lessons</h2></div></div>
                <div className="skill-recent-list">{records.slice(0, 3).map((record) => {
                  const skill = getSkill(record.skillId);
                  const lesson = skill?.lessons.find((item) => item.id === record.lastLessonId);
                  if (!skill || !lesson) return null;
                  return <Link className="skill-recent-item" key={record.id} to={`/skills/${skill.id}`}><span className="skill-recent-icon"><BookOpen size={16} /></span><span><b>{lesson.title}</b><small>{skill.name} · {new Date(record.lastAccessedAt).toLocaleDateString()}</small></span><ArrowRight size={15} /></Link>;
                })}</div>
              </section>
            )}
            {recommendations.length > 0 ? (
              <section className="skill-recommendations">
                <div className="skill-section-heading"><div><div className="section-eyebrow">BASED ON YOUR PROFILE</div><h2>Recommended for you</h2></div><Link to="/profile">Edit interests <ArrowRight size={14} /></Link></div>
                <div className="skill-recommendation-grid">{recommendations.map(({ skill, reason }) => <SkillCard key={skill.id} skill={skill} record={recordBySkill.get(skill.id)} reason={reason} />)}</div>
              </section>
            ) : (
              <div className="skill-profile-prompt"><Sparkles size={18} /><span>Add learning interests to your profile for personalized skill suggestions.</span><Link to="/profile">Update profile <ArrowRight size={14} /></Link></div>
            )}
            <section className="skill-catalog-section">
              <div className="skill-section-heading"><div><div className="section-eyebrow">PRACTICE AT YOUR PACE</div><h2>Explore all skills</h2></div><span className="skill-demo-label">Sample lessons</span></div>
              <label className="skill-search"><Search size={17} /><input aria-label="Search skills" onChange={(event) => setQuery(event.target.value)} placeholder="Search skills or categories" value={query} /></label>
              <div className="skill-category-filters" aria-label="Filter by skill category">
                {(["All skills", ...skillCategories] as const).map((item) => <button aria-pressed={category === item} className={category === item ? "category-selected" : ""} key={item} onClick={() => setCategory(item)} type="button">{item}</button>)}
              </div>
              <div className="skill-card-grid">
                {visibleSkills.map((skill) => <SkillCard key={skill.id} skill={skill} record={recordBySkill.get(skill.id)} />)}
              </div>
              {visibleSkills.length === 0 && <p className="skill-empty-state">No skills match this search. Try another word or category.</p>}
            </section>
          </>
        )}
      </main>
    </SkillLayout>
  );
}

function SkillCard({ skill, record, reason }: { skill: Skill; record?: SkillProgressRecord; reason?: string }) {
  const Icon = categoryIcons[skill.category];
  const progress = skillProgress(record, skill);
  return (
    <article className="skill-catalog-card">
      <div className={`skill-card-icon skill-tone-${skillCategories.indexOf(skill.category) % 4}`}><Icon size={20} /></div>
      <div className="skill-card-tags"><span>{skill.category}</span>{reason && <span className="skill-reason">{reason}</span>}</div>
      <h3>{skill.name}</h3>
      <p>{skill.description}</p>
      <div className="skill-card-meta"><span><BookOpen size={14} /> 3 levels</span><span><Clock3 size={14} /> ~{skill.estimatedHours} hr</span></div>
      <div className="skill-card-progress-label"><span>{progress.started ? `Current: ${progress.currentLevel} · ${progress.completedLessons}/3 lessons · ${progress.completedExercises}/3 exercises` : "Not started"}</span><strong>{progress.percent}%</strong></div>
      <div className="skill-progress-track"><i style={{ width: `${progress.percent}%` }} /></div>
      <Link className="skill-card-link" to={`/skills/${skill.id}`}>{progress.started ? "Continue learning" : "Explore skill"} <ArrowRight size={14} /></Link>
    </article>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="skill-metric-card"><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>;
}

function SkillLayout({ children }: { children: ReactNode }) {
  return (
    <div className="skills-page">
      <header className="skills-header">
        <Link aria-label="EduSphere home" className="brand" to="/"><span className="brand-mark"><BookOpen size={20} /></span><span>edu<span>sphere</span></span></Link>
        <nav aria-label="Skill development navigation"><Link to="/dashboard">Dashboard</Link><Link to="/resources">Resources</Link><Link className="skills-nav-active" to="/skills">Skills</Link><Link to="/sync">Sync center</Link></nav>
        <Link className="skills-dashboard-link" to="/dashboard"><ArrowLeft size={15} /> My dashboard</Link>
      </header>
      {children}
    </div>
  );
}
