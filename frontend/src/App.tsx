import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleHelp,
  Clock3,
  Code2,
  FileText,
  GraduationCap,
  Lightbulb,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Video,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { demoCourses, demoResources } from "./data/demo";
import { AuthProvider, useStudentAuth } from "./auth/AuthContext";
import { skills } from "./skills/skillCatalog";
import { listSkillProgress, type SkillProgressRecord } from "./skills/skillStorage";
import { assessmentApi, resourceApi, type AssessmentAttempt, type LearningResource } from "./auth/api";
import { listAssessmentAttempts } from "./assessments/assessmentStorage";
import { getPendingSyncCount, runSynchronization } from "./sync/syncEngine";
import { listOfflineProgress } from "./offline/offlineStorage";

const ForgotPasswordPage = lazy(() => import("./auth/Pages").then((pages) => ({ default: pages.ForgotPasswordPage })));
const LoginPage = lazy(() => import("./auth/Pages").then((pages) => ({ default: pages.LoginPage })));
const RegistrationPage = lazy(() => import("./auth/Pages").then((pages) => ({ default: pages.RegistrationPage })));
const ResetPasswordPage = lazy(() => import("./auth/Pages").then((pages) => ({ default: pages.ResetPasswordPage })));
const StudentProfilePage = lazy(() => import("./auth/Pages").then((pages) => ({ default: pages.StudentProfilePage })));
const DoubtSolverPage = lazy(() => import("./ai/DoubtSolver").then((module) => ({ default: module.DoubtSolverPage })));
const AdminResourcePage = lazy(() => import("./resources/Resources").then((module) => ({ default: module.AdminResourcePage })));
const OfflineResourcesPage = lazy(() => import("./resources/Resources").then((module) => ({ default: module.OfflineResourcesPage })));
const ResourceDetailPage = lazy(() => import("./resources/Resources").then((module) => ({ default: module.ResourceDetailPage })));
const ResourceLibraryPage = lazy(() => import("./resources/Resources").then((module) => ({ default: module.ResourceLibraryPage })));
const SkillDevelopmentPage = lazy(() => import("./skills/SkillDevelopment").then((module) => ({ default: module.SkillDevelopmentPage })));
const AssessmentsPage = lazy(() => import("./assessments/Assessments").then((module) => ({ default: module.AssessmentsPage })));
const AdminDashboardPage = lazy(() => import("./sync/SyncCenter").then((module) => ({ default: module.AdminDashboardPage })));
const SyncCenterPage = lazy(() => import("./sync/SyncCenter").then((module) => ({ default: module.SyncCenterPage })));
const CourseCatalogPage = lazy(() => import("./courses/Courses").then((module) => ({ default: module.CourseCatalogPage })));
const CoursePage = lazy(() => import("./courses/Courses").then((module) => ({ default: module.CoursePage })));
const AdminCoursesPage = lazy(() => import("./courses/Courses").then((module) => ({ default: module.AdminCoursesPage })));

type DialogContent = { title: string; description: string; action?: string } | null;

const modules = [
  {
    icon: Lightbulb,
    title: "Local AI Learning",
    description:
      "Get a little help understanding tricky topics, even when your connection drops.",
    label: "Learn at your pace",
    tone: "lavender",
  },
  {
    icon: Target,
    title: "Skill Development",
    description:
      "Build practical abilities through guided activities and hands-on practice.",
    label: "Practice by doing",
    tone: "mint",
  },
  {
    icon: Trophy,
    title: "Adaptive Assessments",
    description:
      "Check your understanding with quizzes shaped around your learning progress.",
    label: "See how you're growing",
    tone: "peach",
  },
  {
    icon: BookOpen,
    title: "Resource Library",
    description:
      "Keep useful reading, audio, video, and activities close at hand.",
    label: "Your materials, together",
    tone: "sky",
  },
  {
    icon: MessageCircle,
    title: "AI Doubt Solver",
    description:
      "Explore a question with learning support, with online help clearly marked.",
    label: "Questions welcome",
    tone: "rose",
  },
];

function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link aria-label="EduSphere home" className={`brand${light ? " brand-light" : ""}`} to="/">
      <span className="brand-mark">
        <GraduationCap size={21} strokeWidth={2.2} />
      </span>
      <span>edu<span>sphere</span></span>
    </Link>
  );
}

function DemoBadge() {
  return <span className="demo-badge"><span /> Demo data</span>;
}

function LandingPage() {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<DialogContent>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="landing-page">
      <header className="site-header">
        <div className="header-inner">
          <Logo />
          <nav className={`main-nav${mobileMenuOpen ? " mobile-nav-open" : ""}`} aria-label="Main navigation">
            <a className="active" href="#home" onClick={() => setMobileMenuOpen(false)}>Home</a>
            <a href="#about" onClick={() => setMobileMenuOpen(false)}>About</a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <Link to="/resources" onClick={() => setMobileMenuOpen(false)}>Resources</Link>
            <Link className="mobile-nav-login" to="/login" onClick={() => setMobileMenuOpen(false)}>Log in</Link>
          </nav>
          <button className="button button-dark header-login" onClick={() => navigate("/login")}>
            Log in <ArrowUpRight size={16} />
          </button>
          <button className="mobile-login" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileMenuOpen}>
            {mobileMenuOpen ? <X size={21} /> : <Menu size={23} />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero-section" id="home">
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> A little more access. A lot more possibility.</div>
              <h1>Learning<br />without <span>limits.</span></h1>
              <p className="hero-description">
                Good learning shouldn’t depend on a good signal. Explore lessons,
                build useful skills, and keep moving forward—even when you’re offline.
              </p>
              <div className="hero-actions">
                <button className="button button-primary" onClick={() => navigate("/register")}>
                  Get started <ArrowRight size={17} />
                </button>
                <Link className="button button-quiet" to="/resources">
                  <span className="play-circle"><Play size={12} fill="currentColor" /></span>
                  Explore resources
                </Link>
              </div>
              <div className="hero-proof">
                <div className="avatar-stack" aria-hidden="true">
                  <span className="avatar avatar-one">A</span>
                  <span className="avatar avatar-two">M</span>
                  <span className="avatar avatar-three">J</span>
                  <span className="avatar avatar-four">S</span>
                </div>
                <div><strong>Curious minds, growing every day</strong><small>Learning that meets you where you are.</small></div>
              </div>
            </div>

            <div className="hero-art" aria-label="Illustration of a student learning">
              <div className="art-glow" />
              <div className="art-sun"><Sparkles size={21} /></div>
              <div className="art-orbit orbit-one" />
              <div className="art-orbit orbit-two" />
              <div className="floating-note note-top"><span className="note-icon note-lilac"><BookOpen size={17} /></span><span><b>Your next chapter</b><small>is waiting for you</small></span></div>
              <div className="floating-note note-bottom"><span className="note-icon note-peach"><WifiOff size={17} /></span><span><b>No signal?</b><small>Keep right on learning.</small></span></div>
              <div className="art-card">
                <div className="art-card-top"><span className="mini-brand"><GraduationCap size={15} /> edu<span>sphere</span></span><MoreHorizontal size={19} /></div>
                <div className="illustration-scene">
                  <div className="scene-window"><div /><div /><div /></div>
                  <div className="scene-plant"><i /><i /><i /><b /></div>
                  <div className="scene-books"><i /><i /><i /></div>
                  <div className="scene-person">
                    <div className="person-hair" />
                    <div className="person-face" />
                    <div className="person-neck" />
                    <div className="person-body" />
                    <div className="person-arm" />
                  </div>
                  <div className="scene-laptop"><div><Code2 size={26} /></div><i /></div>
                  <div className="scene-desk" />
                  <span className="scene-spark spark-a">✦</span><span className="scene-spark spark-b">✳</span>
                </div>
                <div className="art-card-bottom">
                  <div><span className="art-kicker">TODAY'S LITTLE WIN</span><b>One step closer.</b></div>
                  <span className="streak-icon"><Sparkles size={18} /></span>
                </div>
              </div>
              <span className="hero-dot dot-purple" /><span className="hero-dot dot-yellow" />
            </div>
          </div>
          <a className="scroll-hint" href="#about"><span><ArrowDown size={15} /></span> Scroll to explore</a>
        </section>

        <section className="trust-strip" aria-label="EduSphere principles">
          <span>MADE FOR REAL-LIFE LEARNING</span><i /><b><WifiOff size={15} /> Offline in mind</b><i /><b><HeartIcon /> Student first</b><i /><b><Sparkles size={15} /> Progress, not pressure</b>
        </section>

        <section className="intro-section section-wrap" id="about">
          <div className="section-eyebrow">A different kind of learning space</div>
          <div className="intro-content">
            <h2>Because opportunity<br />shouldn't <span>buffer.</span></h2>
            <div><p>EduSphere brings lessons, practice, and learning resources into one welcoming space—designed for students whose internet connection isn’t always there.</p><a href="#features" className="text-link">Get to know us <ArrowRight size={16} /></a></div>
          </div>
          <div className="intro-stats">
            <div className="stat-item"><b>Learn</b><span>at your own rhythm</span></div>
            <div className="stat-item"><b>Save</b><span>resources for later</span></div>
            <div className="stat-item"><b>Grow</b><span>one small win at a time</span></div>
          </div>
        </section>

        <section className="features-section" id="features">
          <div className="section-wrap">
            <div className="section-heading">
              <div><div className="section-eyebrow">Your learning toolkit</div><h2>Everything to keep<br />you <span>moving forward.</span></h2><span className="planned-note">Five planned modules · preview only</span></div>
              <p>Five thoughtful tools, working together to make learning feel a little more possible—wherever you are.</p>
            </div>
            <div className="feature-grid">
              {modules.map((module, index) => {
                const Icon = module.icon;
                return (
                  <article className={`feature-card feature-${module.tone}${index === 0 ? " feature-featured" : ""}`} key={module.title}>
                    <div className="feature-card-top"><span className="feature-icon"><Icon size={21} /></span><span className="feature-number">0{index + 1}</span></div>
                    <div><h3>{module.title}</h3><p>{module.description}</p></div>
                    <span className="feature-label">{module.label} <ArrowUpRight size={14} /></span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="how-section section-wrap">
          <div className="how-copy"><div className="section-eyebrow">Small steps, real progress</div><h2>Learning that<br />fits <span>your world.</span></h2><p>No perfect setup needed. Start where you are, take what you need, and come back whenever you’re ready.</p><button className="button button-primary" onClick={() => navigate("/register")}>Take a look around <ArrowRight size={17} /></button></div>
          <div className="steps-list">
            {[["01", "Find what feels right", "Choose a course, pick a resource, or just follow a question."], ["02", "Learn at your own pace", "Explore lessons and activities when it works for you."], ["03", "Keep your momentum", "Pick up where you left off and celebrate the little wins."]].map(([number, title, description]) => <div className="step-item" key={number}><span className="step-number">{number}</span><div><h3>{title}</h3><p>{description}</p></div><ArrowUpRight size={17} /></div>)}
          </div>
        </section>

        <section className="resources-section" id="resources">
          <div className="resources-inner section-wrap">
            <div><div className="section-eyebrow">A library for wherever you are</div><h2>Good things to<br />learn, <span>keep & revisit.</span></h2><p>Guides, activities, and lessons—all in one place. In this demo, resources are examples to explore, not actual downloads.</p><button className="button button-light" onClick={() => navigate("/dashboard#resources")}>Browse demo library <ArrowRight size={17} /></button></div>
            <div className="resource-preview">
              {demoResources.map((resource, index) => <ResourceRow key={resource.title} resource={resource} onOpen={() => navigate("/resources")} compact={false} number={`0${index + 1}`} />)}
              <div className="preview-caption"><span><Sparkles size={15} /> A little something for your next study session</span><DemoBadge /></div>
            </div>
          </div>
        </section>

        <section className="closing-section section-wrap"><span className="closing-spark"><Sparkles size={22} /></span><div><div className="section-eyebrow">Your next chapter starts here</div><h2>Ready when <span>you are.</span></h2></div><button className="button button-primary" onClick={() => navigate("/register")}>Create your account <ArrowRight size={17} /></button></section>
      </main>
      <Footer />
      {dialog && <InfoDialog content={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

function HeartIcon() {
  return <span className="heart-icon">♡</span>;
}

function ResourceRow({ resource, onOpen, compact, number }: { resource: (typeof demoResources)[number]; onOpen: () => void; compact: boolean; number?: string }) {
  const Icon = resource.icon === "video" ? Video : resource.icon === "edit" ? FileText : FileText;
  return (
    <button className={`resource-row${compact ? " resource-row-compact" : ""}`} onClick={onOpen}>
      <span className={`resource-file-icon tone-${resource.color}`}><Icon size={19} /></span>
      <span className="resource-row-copy">{number && <span className="resource-number">{number}</span>}<b>{resource.title}</b><small>{resource.type} <i /> {resource.detail}</small></span>
      <span className={`resource-availability${resource.offline ? " available" : ""}`}>{resource.offline ? <><Check size={14} /> Demo saved</> : <><ArrowDownToLine size={14} /> Sample</>}</span>
    </button>
  );
}

function Footer() {
  return <footer className="site-footer"><div className="footer-main section-wrap"><div className="footer-about"><Logo light /><p>Making room for learning, wherever life takes you.</p><span className="footer-demo">A student project · Demo experience</span></div><div className="footer-links">  <div><b>Explore</b><a href="/#about">About</a><a href="/#features">Features</a><Link to="/resources">Resources</Link></div><div><b>Your space</b><Link to="/dashboard">Student dashboard</Link><a href="#home">Back to top</a></div><div><b>Built on</b><span>Curiosity</span><span>Access for all</span></div></div></div><div className="footer-bottom section-wrap"><span>© {new Date().getFullYear()} EduSphere. A learning project made with care.</span><span>Learning without limits <span className="footer-star">✳</span></span></div></footer>;
}

function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { student, logout } = useStudentAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogContent>(null);
  const [skillRecords, setSkillRecords] = useState<SkillProgressRecord[]>([]);
  const [latestAssessment, setLatestAssessment] = useState<AssessmentAttempt | null>(null);
  const [recentResources, setRecentResources] = useState<LearningResource[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date()).toUpperCase();

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!student?.id) return;
    listSkillProgress(student.id)
      .then((records) => { if (active) setSkillRecords(records); })
      .catch((storageError: unknown) => {
        if (active) {
          setDialog({
            title: "Skill progress unavailable",
            description: storageError instanceof Error ? storageError.message : "The saved skill progress could not be opened.",
            action: "Close",
          });
        }
      });
    return () => { active = false; };
  }, [student?.id]);

  useEffect(() => {
    let active = true;
    if (!student?.id) return;
    const studentId = student.id;
    async function loadRecentResources() {
      try {
        if (navigator.onLine && !student?.offline) {
          const activity = await resourceApi.activity();
          if (active) setRecentResources(activity.recent.slice(0, 3));
          return;
        }
      } catch {
        // Fall back to the device's saved progress below.
      }
      try {
        const progress = await listOfflineProgress(studentId);
        if (active) setRecentResources(progress.slice(0, 3).map((entry) => entry.resource));
      } catch (storageError) {
        if (active) {
          setDialog({
            title: "Recent learning activity unavailable",
            description: storageError instanceof Error ? storageError.message : "Saved resource activity could not be loaded.",
            action: "Close",
          });
        }
      }
    }
    void loadRecentResources();
    return () => { active = false; };
  }, [student?.id, student?.offline]);

  useEffect(() => {
    let active = true;
    if (!student?.id) return;
    async function loadAssessmentSummary() {
      try {
        const [localAttempts, remote] = await Promise.all([
          listAssessmentAttempts(student!.id),
          assessmentApi.list(),
        ]);
        const localResults = localAttempts
          .filter((attempt) => attempt.status === "submitted" && attempt.result)
          .map((attempt) => attempt.result!);
        const latest = [...remote.history, ...localResults]
          .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0] ?? null;
        if (active) setLatestAssessment(latest);
      } catch (requestError) {
        try {
          const localAttempts = await listAssessmentAttempts(student!.id);
          const latest = localAttempts
            .filter((attempt) => attempt.status === "submitted" && attempt.result)
            .map((attempt) => attempt.result!)
            .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0] ?? null;
          if (active) setLatestAssessment(latest);
        } catch (storageError) {
          if (active) setDialog({
            title: "Assessment history unavailable",
            description: storageError instanceof Error ? storageError.message : requestError instanceof Error ? requestError.message : "Assessment history could not be loaded.",
            action: "Close",
          });
        }
      }
    }
    void loadAssessmentSummary();
    return () => { active = false; };
  }, [student?.id]);

  useEffect(() => {
    if (location.hash === "#resources") {
      document.getElementById("dashboard-resources")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [location.hash]);

  const completedSkillItems = skillRecords.reduce(
    (total, record) => total + Object.keys(record.completedLessons).length + Object.keys(record.completedExercises).length,
    0,
  );
  const totalSkillItems = skills.reduce((total, skill) => total + skill.lessons.length * 2, 0);
  const skillProgress = totalSkillItems ? Math.round(completedSkillItems / totalSkillItems * 100) : 0;

  async function signOut() {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (requestError) {
      setDialog({
        title: "Could not sign out",
        description: requestError instanceof Error ? requestError.message : "The session could not be closed. Please try again.",
        action: "Close",
      });
    }
  }

  return (
    <div className="dashboard-page">
      <aside className={`sidebar${menuOpen ? " sidebar-open" : ""}`}>
        <div className="sidebar-brand"><Logo /><button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button></div>
        <div className="sidebar-label">YOUR SPACE</div>
        <nav className="sidebar-nav" aria-label="Student navigation">
          <a className="sidebar-link selected" href="#overview" onClick={() => setMenuOpen(false)}><span><GraduationCap size={18} /></span>Overview</a>
          <a className="sidebar-link" href="#courses" onClick={() => setMenuOpen(false)}><span><BookOpen size={18} /></span>My learning</a>
          <Link className="sidebar-link" to="/resources" onClick={() => setMenuOpen(false)}><span><FileText size={18} /></span>Resources</Link>
          <Link className="sidebar-link" to="/courses" onClick={() => setMenuOpen(false)}><span><BookOpen size={18} /></span>Learning courses</Link>
          <Link className="sidebar-link" to="/skills" onClick={() => setMenuOpen(false)}><span><Target size={18} /></span>Skill development</Link>
          <Link className="sidebar-link" to="/assessments" onClick={() => setMenuOpen(false)}><span><Trophy size={18} /></span>Assessments</Link>
          <Link className="sidebar-link" to="/sync" onClick={() => setMenuOpen(false)}><span><RefreshCw size={18} /></span>Sync center</Link>
          {student?.role === "admin" && <Link className="sidebar-link" to="/admin" onClick={() => setMenuOpen(false)}><span><ShieldCheck size={18} /></span>Admin dashboard</Link>}
          {student?.role === "admin" && <Link className="sidebar-link" to="/admin/courses" onClick={() => setMenuOpen(false)}><span><BookOpen size={18} /></span>Manage courses</Link>}
          <Link className="sidebar-link" to="/doubt-solver" onClick={() => setMenuOpen(false)}><span><CircleHelp size={18} /></span>Ask a question</Link>
          <Link className="sidebar-link" to="/profile" onClick={() => setMenuOpen(false)}><span><GraduationCap size={18} /></span>My profile</Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="offline-card"><span className={`connection-icon${online ? "" : " connection-off"}`}>{online ? <Wifi size={16} /> : <WifiOff size={16} />}</span><div><b>{online ? "Connection available" : "You're offline"}</b><small>{online ? "This only checks your device." : "Demo content stays visible."}</small></div></div>
          <Link className="sidebar-profile" to="/profile"><span className="profile-avatar">{student?.avatarUrl ? <img src={student.avatarUrl} alt="" /> : student?.name.charAt(0).toUpperCase()}</span><span><b>{student?.name}</b><small>{student?.email}</small></span><ArrowUpRight size={15} /></Link>
          <button className="sidebar-home sidebar-signout" onClick={signOut}><ArrowLeft size={16} /> Sign out</button>
          <button className="sidebar-home" onClick={() => navigate("/")}><ArrowLeft size={16} /> Back to home</button>
        </div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <main className="dashboard-main" id="overview">
        <header className="dashboard-topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button><div className="dashboard-crumb"><span>My space</span><span>/</span><b>Overview</b></div><div className="topbar-right"><DemoBadge /><Link className="topbar-avatar" to="/profile" aria-label="Open profile">{student?.avatarUrl ? <img src={student.avatarUrl} alt="" /> : student?.name.charAt(0).toUpperCase()}</Link></div></header>
        <div className="dashboard-content">
          <section className="dashboard-welcome"><div><div className="section-eyebrow">{todayLabel} <span className="welcome-spark">✳</span></div><h1>Hey, {student?.name.split(/\s+/)[0]} <span>☺</span></h1><p>A little progress goes a long way. Ready for your next step?</p></div><div className="welcome-illustration"><div className="welcome-orb"><Sparkles size={25} /></div><span className="welcome-star">✳</span><span className="welcome-book"><BookOpen size={29} /></span></div></section>
          <section className="dashboard-summary" aria-label="Recorded learning activity">
            <div className="summary-card summary-progress">
              <div className="summary-heading"><span className="summary-icon"><Target size={18} /></span><span>Recorded skill progress</span></div>
              <div className="summary-main"><strong>{skillProgress}<span>%</span></strong><span className="summary-change">{completedSkillItems} activities completed</span></div>
              <div className="progress-track dashboard-summary-track"><span style={{ width: `${skillProgress}%` }} /></div>
              <div className="summary-foot"><span>Based on your saved lessons and exercises</span></div>
            </div>
            <div className="summary-card summary-streak">
              <div className="summary-heading"><span className="summary-icon streak-icon-small"><Sparkles size={17} /></span><span>Skills started</span></div>
              <div className="streak-count"><strong>{skillRecords.length}</strong><span>{skillRecords.length === 1 ? "skill" : "skills"}<br />with activity</span></div>
              <div className="summary-foot"><span>Counted from recorded student actions</span></div>
            </div>
            <div className="summary-card summary-hours">
              <div className="summary-heading"><span className="summary-icon hours-icon"><Trophy size={17} /></span><span>Latest assessment</span></div>
              <div className="summary-main"><strong>{latestAssessment ? `${latestAssessment.accuracy}` : "—"}{latestAssessment && <span>%</span>}</strong><span className="summary-muted">{latestAssessment ? `${latestAssessment.score}/${latestAssessment.total} correct` : "No submitted attempt yet"}</span></div>
              <div className="hours-meter"><span style={{ width: `${latestAssessment?.accuracy ?? 0}%` }} /></div>
              <div className="summary-foot"><span>{latestAssessment ? new Date(latestAssessment.submittedAt).toLocaleDateString() : "Results appear after you submit a quiz"}</span></div>
            </div>
          </section>
          <div className="dashboard-section-heading" id="courses"><div><div className="section-eyebrow">DEMO LEARNING PATHS</div><h2>Explore learning modules</h2></div><Link className="text-link" to="/skills">Browse skills <ArrowRight size={15} /></Link></div>
          <section className="course-grid" aria-label="Demo course previews">
            {demoCourses.map((course) => <article className={`course-card course-${course.color}`} key={course.id}><div className="course-card-top"><span className="course-subject">Demo · {course.subject}</span></div><div className={`course-illustration illustration-${course.icon}`}><div className="course-art-shape"><IconForCourse icon={course.icon} /></div><span className="course-art-dot" /><span className="course-art-line" /></div><div className="course-content"><h3>{course.title}</h3><div className="course-meta"><span><BookOpen size={14} /> {course.lessons} sample lessons</span><span><Clock3 size={14} /> {course.duration}</span></div><p className="dashboard-course-note">Preview only; individual course progress is not tracked.</p><button className="course-action" onClick={() => navigate(course.id === "math-foundations" ? "/assessments" : "/skills")}>Explore available activities <ArrowRight size={15} /></button></div></article>)}
          </section>
          <Link className="panel-footer-link" to="/courses">Browse original written courses and lessons <ArrowRight size={15} /></Link>
          <section className="lower-grid" id="dashboard-resources">
            <div className="panel resource-panel"><div className="panel-heading"><div><div className="section-eyebrow">YOUR RECORDED ACTIVITY</div><h2>Recently opened</h2></div><button className="icon-button" aria-label="Open resource library" onClick={() => navigate("/resources")}><MoreHorizontal size={20} /></button></div>{recentResources.length ? <div className="dashboard-recent-resources">{recentResources.map((resource) => <Link className="dashboard-recent-resource" key={resource.id} to={`/resources/${encodeURIComponent(resource.id)}`}><span><FileText size={17} /></span><div><b>{resource.title}</b><small>{resource.subject} · {resource.completed ? "Completed" : "In progress"}</small></div><ArrowRight size={15} /></Link>)}</div> : <div className="dashboard-empty-state"><BookOpen size={20} /><p>No recently opened resources recorded yet.</p><Link to="/resources">Browse demo resources <ArrowRight size={14} /></Link></div>}<button className="panel-footer-link" onClick={() => navigate("/resources")}>Explore the resource library <ArrowRight size={15} /></button></div>
            <div className="panel skill-panel"><div className="panel-heading"><div><div className="section-eyebrow">GROWING YOUR TOOLKIT</div><h2>Skills in progress</h2></div><span className="skill-top-icon"><Sparkles size={18} /></span></div><p className="panel-description">{skillRecords.length ? "Progress shown here comes from activities you recorded." : "Choose a practical skill and start your first lesson."}</p>{skillRecords.slice(0, 2).map((record) => { const skill = skills.find((item) => item.id === record.skillId); if (!skill) return null; const done = Object.keys(record.completedLessons).length + Object.keys(record.completedExercises).length; const percent = Math.round(done / (skill.lessons.length * 2) * 100); return <div className="skill-row" key={record.skillId}><span className="skill-icon skill-code"><Code2 size={17} /></span><div className="skill-copy"><div><b>{skill.name}</b><span>{Object.keys(record.completedLessons).length} lessons · {Object.keys(record.completedExercises).length} exercises</span></div><div className="skill-track"><i style={{ width: `${percent}%` }} /></div></div><strong>{percent}%</strong></div>; })}<Link className="panel-footer-link" to="/skills">{skillRecords.length ? "Continue your skill journey" : "Explore skill development"} <ArrowRight size={15} /></Link></div>
          </section>
          <section className="assessment-banner"><div className="assessment-graphic"><span><Trophy size={21} /></span><i /><i /><i /></div><div><div className="section-eyebrow">A QUICK CHECK-IN</div><h2>{latestAssessment ? `Your latest score: ${latestAssessment.score}/${latestAssessment.total} (${latestAssessment.accuracy}%)` : "Ready for a little brain boost?"}</h2><p>{latestAssessment ? `Recorded ${new Date(latestAssessment.submittedAt).toLocaleDateString()}. Review explanations or try a new quiz.` : "Choose a demo quiz, answer at your own pace, and get explanations based on your responses."}</p></div><Link className="button button-primary" to={latestAssessment ? `/assessments/${latestAssessment.assessmentId}?attempt=${encodeURIComponent(latestAssessment.attemptId)}` : "/assessments"}>{latestAssessment ? "Review results" : "Explore assessments"} <ArrowRight size={16} /></Link></section>
          <section className="offline-note"><span className={`offline-note-icon${online ? "" : " is-offline"}`}>{online ? <Wifi size={17} /> : <WifiOff size={17} />}</span><div><b>{online ? "Connection available" : "You're offline right now"}</b><span>{online ? "Connection status reflects your device. Sync status is available in Sync center." : "Saved resource previews and learning progress on this device remain available offline."}</span></div><Link className="offline-demo-tag" to="/sync">SYNC CENTER</Link></section>
          <footer className="dashboard-footer"><span>EduSphere <span>·</span> A student project</span><span>Keep learning, one step at a time <span className="footer-star">✳</span></span></footer>
        </div>
      </main>
      {dialog && <InfoDialog content={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

function IconForCourse({ icon }: { icon: string }) {
  if (icon === "code") return <Code2 size={31} />;
  if (icon === "math") return <span className="math-symbol">÷</span>;
  return <Sparkles size={30} />;
}

function InfoDialog({ content, onClose, onAction }: { content: NonNullable<DialogContent>; onClose: () => void; onAction?: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="info-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="dialog-close" onClick={onClose} aria-label="Close dialog"><X size={19} /></button><span className="dialog-icon"><Sparkles size={21} /></span><div className="section-eyebrow">EDUSPHERE DEMO</div><h2 id="dialog-title">{content.title}</h2><p>{content.description}</p><button className="button button-primary" onClick={onAction ?? onClose}>{content.action ?? "Close"} <ArrowRight size={16} /></button></section></div>;
}

function AuthLoading() {
  return <main className="auth-loading" role="status"><span className="loading-spinner" />Checking your account…</main>;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { student, loading, error } = useStudentAuth();
  const location = useLocation();
  if (loading) return <AuthLoading />;
  if (error && !student) return <main className="auth-loading auth-load-error" role="alert">{error}<button className="button button-primary" onClick={() => window.location.reload()}>Try again</button></main>;
  if (!student) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { student, loading, error } = useStudentAuth();
  const location = useLocation();
  if (loading) return <AuthLoading />;
  if (error && !student) return <main className="auth-loading auth-load-error" role="alert">{error}<button className="button button-primary" onClick={() => window.location.reload()}>Try again</button></main>;
  if (!student) return <Navigate to="/login" replace state={{ from: location }} />;
  if (student.role !== "admin") return <Navigate to="/resources" replace />;
  return children;
}

function PublicAccountRoute({ children }: { children: ReactNode }) {
  const { student, loading } = useStudentAuth();
  if (loading) return <AuthLoading />;
  if (student) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<PublicAccountRoute><LoginPage /></PublicAccountRoute>} />
        <Route path="/register" element={<PublicAccountRoute><RegistrationPage /></PublicAccountRoute>} />
        <Route path="/forgot-password" element={<PublicAccountRoute><ForgotPasswordPage /></PublicAccountRoute>} />
        <Route path="/reset-password" element={<PublicAccountRoute><ResetPasswordPage /></PublicAccountRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><StudentProfilePage /></ProtectedRoute>} />
        <Route path="/resources" element={<ProtectedRoute><ResourceLibraryPage /></ProtectedRoute>} />
        <Route path="/courses" element={<ProtectedRoute><CourseCatalogPage /></ProtectedRoute>} />
        <Route path="/courses/:courseId/:lessonId?" element={<ProtectedRoute><CoursePage /></ProtectedRoute>} />
        <Route path="/admin/courses" element={<AdminRoute><AdminCoursesPage /></AdminRoute>} />
        <Route path="/resources/offline" element={<ProtectedRoute><OfflineResourcesPage /></ProtectedRoute>} />
        <Route path="/resources/:resourceId" element={<ProtectedRoute><ResourceDetailPage /></ProtectedRoute>} />
        <Route path="/admin/resources" element={<AdminRoute><AdminResourcePage /></AdminRoute>} />
        <Route path="/doubt-solver" element={<ProtectedRoute><DoubtSolverPage /></ProtectedRoute>} />
        <Route path="/skills" element={<ProtectedRoute><SkillDevelopmentPage /></ProtectedRoute>} />
        <Route path="/skills/:skillId" element={<ProtectedRoute><SkillDevelopmentPage /></ProtectedRoute>} />
        <Route path="/assessments" element={<ProtectedRoute><AssessmentsPage /></ProtectedRoute>} />
        <Route path="/assessments/:assessmentId" element={<ProtectedRoute><AssessmentsPage /></ProtectedRoute>} />
        <Route path="/sync" element={<ProtectedRoute><SyncCenterPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return <AuthProvider><AutoSync /><AppRoutes /></AuthProvider>;
}

function AutoSync() {
  const { student, refreshStudent } = useStudentAuth();
  useEffect(() => {
    if (!student?.id || student.offline) return;
    let active = true;
    let retryTimer: number | undefined;
    let retryDelay = 5_000;

    const synchronizeIfConnected = async () => {
      if (!active || !navigator.onLine) return;
      try {
        const result = await runSynchronization(student.id);
        if (result.failed === 0 && result.pending === 0) {
          retryDelay = 5_000;
          await refreshStudent().catch(() => undefined);
        }
        if (result.failed > 0) {
          retryTimer = window.setTimeout(() => void synchronizeIfConnected(), retryDelay);
          retryDelay = Math.min(retryDelay * 2, 5 * 60_000);
        }
      } catch {
        retryTimer = window.setTimeout(() => void synchronizeIfConnected(), retryDelay);
        retryDelay = Math.min(retryDelay * 2, 5 * 60_000);
      }
    };
    const onOnline = () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      retryDelay = 5_000;
      void synchronizeIfConnected();
    };

    void getPendingSyncCount(student.id)
      .then((count) => { if (count > 0) void synchronizeIfConnected(); })
      .catch(() => undefined);
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
    };
  }, [student?.id, student?.offline, refreshStudent]);
  return null;
}

export default App;
