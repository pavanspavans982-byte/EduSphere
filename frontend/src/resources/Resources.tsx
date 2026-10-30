import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  Clock3,
  Code2,
  FileText,
  Filter,
  GraduationCap,
  Headphones,
  Library,
  LoaderCircle,
  LogOut,
  Play,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Video,
  X,
  Download,
  Wifi,
  WifiOff,
  HardDrive,
  ExternalLink,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { resourceApi, resourceCategories, resourceTypeLabels, type LearningResource, type ResourceDetails } from "../auth/api";
import { useStudentAuth } from "../auth/AuthContext";
import { runSynchronization } from "../sync/syncEngine";
import {
  cacheResourceMetadata,
  createOfflinePreview,
  getCachedResource,
  getLocalBookmark,
  listCachedResources,
  listOfflineBookmarks,
  listOfflineProgress,
  removeOfflineResource,
  saveBookmarkLocally,
  saveProgressLocally,
  storeOfflineResource,
  type OfflineResource,
} from "../offline/offlineStorage";

type Activity = {
  saved: LearningResource[];
  recent: LearningResource[];
  continueLearning: LearningResource[];
};

const resourceTypes = Object.keys(resourceTypeLabels) as LearningResource["type"][];
const learningLevels = ["Beginner", "Intermediate", "Advanced"];
const emptyActivity: Activity = { saved: [], recent: [], continueLearning: [] };
const emptyForm: ResourceDetails = {
  title: "",
  description: "",
  subject: "Mathematics",
  level: "Beginner",
  type: "notes",
  estimatedMinutes: 10,
  preview: "",
  language: "English",
  classLevel: "Not specified",
  sourceName: "EduSphere",
  sourceUrl: "",
  licenseInfo: "Original EduSphere text; no third-party source file included.",
};

function ResourceIcon({ type, size = 20 }: { type: LearningResource["type"]; size?: number }) {
  if (type === "link") return <ExternalLink size={size} />;
  if (type === "video") return <Video size={size} />;
  if (type === "audio") return <Headphones size={size} />;
  if (type === "pdf") return <FileText size={size} />;
  if (type === "tutorial") return <Code2 size={size} />;
  if (type === "practice") return <Target size={size} />;
  return <BookOpen size={size} />;
}

function AccountHeader({ current, onLogout }: { current: string; onLogout: () => void }) {
  const { student } = useStudentAuth();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <header className="resource-site-header">
      <Link aria-label="EduSphere home" className="brand" to="/"><span className="brand-mark"><GraduationCap size={21} /></span><span>edu<span>sphere</span></span></Link>
      <nav aria-label="Student navigation" className="resource-nav">
        <Link className={current === "library" ? "resource-nav-active" : ""} to="/resources">Resource library</Link>
        <Link className={current === "offline" ? "resource-nav-active" : ""} to="/resources/offline"><HardDrive size={14} /> My Offline Resources</Link>
        <Link className={current === "doubt" ? "resource-nav-active" : ""} to="/doubt-solver">Ask a question</Link>
        <Link className={current === "saved" ? "resource-nav-active" : ""} to="/resources?saved=1">Saved</Link>
        <Link className={current === "sync" ? "resource-nav-active" : ""} to="/sync">Sync center</Link>
        {student?.role === "admin" && <Link className={current === "admin-dashboard" ? "resource-nav-active" : ""} to="/admin">Admin dashboard</Link>}
        {student?.role === "admin" && <Link className={current === "admin" ? "resource-nav-active" : ""} to="/admin/resources">Manage resources</Link>}
      </nav>
      <div className="resource-account-nav">
        <span className={`offline-network-pill${online ? "" : " offline"}`}>{online ? <Wifi size={13} /> : <WifiOff size={13} />} {online ? "Online" : "Offline"}</span>
        <Link className="resource-profile-link" to="/profile">
          <span className="resource-nav-avatar">{student?.avatarUrl ? <img src={student.avatarUrl} alt="" /> : student?.name.slice(0, 1).toUpperCase()}</span>
          <span>{student?.name}</span>
        </Link>
        <button aria-label="Sign out" className="resource-logout" onClick={onLogout} title="Sign out"><LogOut size={17} /></button>
      </div>
    </header>
  );
}

function ResourceShell({ current, children }: { current: string; children: React.ReactNode }) {
  const { logout } = useStudentAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState("");
  async function signOut() {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Could not sign out.");
    }
  }
  return <div className="resource-page"><AccountHeader current={current} onLogout={signOut} /><NetworkNotice />{logoutError && <div className="library-error resource-logout-error" role="alert">{logoutError}</div>}{children}<footer className="resource-footer"><span>EduSphere · A student learning project</span><span>External content links to its original provider; item-level permissions vary.</span></footer></div>;
}

function NetworkNotice() {
  const [online, setOnline] = useState(navigator.onLine);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setChanged(true);
      window.setTimeout(() => setChanged(false), 5000);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!changed && online) return null;
  return <div className={`network-notice${online ? " network-notice-online" : ""}`} role="status">
    {online ? <Wifi size={15} /> : <WifiOff size={15} />}
    <span>{online ? "Connection restored. Local changes will sync only when the server confirms them." : "You are offline. Saved previews and learning progress on this device remain available."}</span>
  </div>;
}

function uniqueResources(resources: LearningResource[]) {
  return [...new Map(resources.map((resource) => [resource.id, resource])).values()];
}

function filterCachedResources(resources: LearningResource[], query: string, subject: string, type: string, level: string, language: string, classLevel: string, sort: string) {
  const normalizedQuery = query.toLowerCase();
  return resources
    .filter((resource) => (!normalizedQuery || `${resource.title} ${resource.description} ${resource.subject} ${resource.sourceName || ""} ${resource.classLevel || ""} ${resource.language || ""}`.toLowerCase().includes(normalizedQuery))
      && (!subject || resource.subject === subject)
      && (!type || resource.type === type)
      && (!level || resource.level === level)
      && (!language || resource.language === language)
      && (!classLevel || resource.classLevel === classLevel))
    .sort((left, right) => sort === "title"
      ? left.title.localeCompare(right.title)
      : sort === "time"
        ? left.estimatedMinutes - right.estimatedMinutes
        : right.createdAt.localeCompare(left.createdAt));
}

function ResourceCard({
  resource,
  onBookmark,
  onOpen,
  onDownload,
  busy = false,
  downloaded = false,
  downloading = false,
}: {
  resource: LearningResource;
  onBookmark: (resource: LearningResource) => void;
  onOpen: (resource: LearningResource) => void;
  onDownload: (resource: LearningResource) => void;
  busy?: boolean;
  downloaded?: boolean;
  downloading?: boolean;
}) {
  return (
    <article className="library-resource-card">
      <button aria-label={`Open ${resource.title}`} className={`library-card-art art-${resource.type}`} onClick={() => onOpen(resource)} type="button">
        <span className="library-card-art-icon"><ResourceIcon type={resource.type} size={24} /></span>
        <span className="library-card-art-shape art-shape-one" /><span className="library-card-art-shape art-shape-two" />
        <span className="library-card-art-type">{resourceTypeLabels[resource.type]}</span>
      </button>
      <div className="library-resource-content">
        <div className="library-resource-tags"><span>{resource.subject}</span><span>{resource.classLevel || "Level not specified"}</span><span>{resource.level}</span><span>{resource.language || "Language not specified"}</span><span className="demo-resource-badge">{resource.sourceDirectory ? "Provider link" : resource.isDemo ? "EduSphere sample" : "Curated"}</span></div>
        <button className="library-card-title" onClick={() => onOpen(resource)} type="button">{resource.title}</button>
        <p>{resource.description}</p>
        <div className="library-card-meta"><span>{resource.estimatedMinutes ? <><Clock3 size={14} /> {resource.estimatedMinutes} min</> : <><ExternalLink size={14} /> External source</>}</span><span><ResourceIcon type={resource.type} size={14} /> {resourceTypeLabels[resource.type]}</span></div>
        <div className="resource-source-summary"><b>{resource.sourceName || "EduSphere"}</b><span>{resource.licenseInfo || "Review source terms before reuse."}</span></div>
        {resource.lastPositionSeconds > 0 && !resource.completed && <div className="card-reading-progress"><span style={{ width: `${Math.min(96, Math.round(resource.lastPositionSeconds / (resource.estimatedMinutes * 60) * 100))}%` }} /></div>}
        <div className="library-card-actions">
          <button className="resource-open-button" onClick={() => onOpen(resource)} type="button">{resource.lastPositionSeconds > 0 && !resource.completed ? "Continue" : "Preview"} <ArrowRight size={14} /></button>
          <button aria-label={resource.bookmarked ? `Remove ${resource.title} from saved resources` : `Save ${resource.title}`} className={`bookmark-button${resource.bookmarked ? " bookmarked" : ""}`} disabled={busy} onClick={() => onBookmark(resource)} type="button"><Bookmark size={17} fill={resource.bookmarked ? "currentColor" : "none"} /></button>
        </div>
        {resource.sourceUrl && <a className="resource-source-link" href={resource.sourceUrl} rel="noreferrer noopener" target="_blank">Open original source <ExternalLink size={14} /></a>}
        {resource.downloadAllowed && <button className={`offline-download-button${downloaded ? " offline-downloaded" : ""}`} disabled={downloading} onClick={() => onDownload(resource)} type="button">
          {downloading ? <><LoaderCircle size={14} /> Saving…</> : downloaded ? <><Check size={14} /> Saved on this device</> : <><Download size={14} /> Download permitted PDF</>}
        </button>}
      </div>
    </article>
  );
}

export function ResourceLibraryPage() {
  const { student } = useStudentAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const savedOnly = searchParams.get("saved") === "1";
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [activity, setActivity] = useState<Activity>(emptyActivity);
  const [query, setQuery] = useState("");
  const [searchText, setSearchText] = useState("");
  const [subject, setSubject] = useState(() => searchParams.get("subject") ?? "");
  const [type, setType] = useState("");
  const [level, setLevel] = useState("");
  const [language, setLanguage] = useState("");
  const [classLevel, setClassLevel] = useState("");
  const [sort, setSort] = useState("newest");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [bookmarkBusy, setBookmarkBusy] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const studentId = student?.id ?? "";

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchText.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    let active = true;
    async function loadResources() {
      setLoading(true);
      try {
        const [list, currentActivity] = await Promise.all([
          resourceApi.list({ q: query, subject, type, level, language, classLevel, sort }),
          resourceApi.activity(),
        ]);
        if (!studentId) throw new Error("Sign in to save resources for offline learning.");
        await cacheResourceMetadata(studentId, [...list.resources, ...currentActivity.saved, ...currentActivity.recent, ...currentActivity.continueLearning]);
        const [bookmarks, progress, cached] = await Promise.all([
          listOfflineBookmarks(studentId),
          listOfflineProgress(studentId),
          listCachedResources(studentId),
        ]);
        const cachedById = new Map(cached.map((entry) => [entry.resource.id, entry.resource]));
        const bookmarksById = new Map(bookmarks.map((entry) => [entry.resource.id, entry.resource]));
        if (active) {
          setResources(list.resources.map((resource) => {
          const bookmark = bookmarksById.get(resource.id);
          const cachedResource = cachedById.get(resource.id);
          const savedProgress = progress.find((entry) => entry.resource.id === resource.id);
          return {
            ...resource,
            bookmarked: bookmark ? true : cachedResource?.bookmarked ?? resource.bookmarked,
            lastPositionSeconds: savedProgress?.resource.lastPositionSeconds ?? resource.lastPositionSeconds,
            completed: savedProgress?.resource.completed ?? resource.completed,
            lastAccessedAt: savedProgress?.resource.lastAccessedAt ?? resource.lastAccessedAt,
          };
        }));
        setActivity({
          saved: uniqueResources([...currentActivity.saved, ...bookmarks.map((entry) => entry.resource)]),
          recent: uniqueResources([...progress.slice(0, 5).map((entry) => entry.resource), ...currentActivity.recent]).slice(0, 5),
          continueLearning: uniqueResources([...progress.filter((entry) => !entry.resource.completed).map((entry) => entry.resource), ...currentActivity.continueLearning]).slice(0, 5),
        });
          setDownloadedIds(new Set(cached.filter((entry) => entry.downloadBytes > 0).map((entry) => entry.resource.id)));
          setError("");
        }
      } catch (requestError) {
        if (!studentId) {
          if (active) setError("Sign in to use the resource library.");
          return;
        }
        try {
          const [cached, bookmarks, progress] = await Promise.all([
            listCachedResources(studentId),
            listOfflineBookmarks(studentId),
            listOfflineProgress(studentId),
          ]);
          if (active) {
            setResources(filterCachedResources(cached.map((entry) => entry.resource), query, subject, type, level, language, classLevel, sort));
            setActivity({
              saved: bookmarks.map((entry) => entry.resource),
              recent: progress.slice(0, 5).map((entry) => entry.resource),
              continueLearning: progress.filter((entry) => !entry.resource.completed).slice(0, 5).map((entry) => entry.resource),
            });
            setDownloadedIds(new Set(cached.filter((entry) => entry.downloadBytes > 0).map((entry) => entry.resource.id)));
            setError(navigator.onLine
              ? `The server could not be reached. Showing resources saved on this device. ${requestError instanceof Error ? requestError.message : ""}`.trim()
              : "Offline mode: showing resources saved on this device.");
          }
        } catch (storageError) {
          if (active) setError(storageError instanceof Error ? storageError.message : "The resource library and offline storage could not be loaded.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadResources();
    return () => { active = false; };
  }, [query, subject, type, level, language, classLevel, sort, studentId]);

  const displayResources = useMemo(() => {
    if (!savedOnly) return resources;
    const savedIds = new Set(activity.saved.map((resource) => resource.id));
    return resources.filter((resource) => savedIds.has(resource.id));
  }, [activity.saved, resources, savedOnly]);

  async function toggleBookmark(resource: LearningResource) {
    setBookmarkBusy(resource.id);
    setError("");
    try {
      if (!studentId) throw new Error("Sign in to save this resource.");
      const currentBookmark = await getLocalBookmark(studentId, resource.id);
      const isBookmarked = currentBookmark ?? resource.bookmarked;
      await saveBookmarkLocally(studentId, resource, !isBookmarked);
      setResources((items) => items.map((item) => item.id === resource.id ? { ...item, bookmarked: !isBookmarked } : item));
      setActivity((current) => ({
        ...current,
        saved: isBookmarked
          ? current.saved.filter((item) => item.id !== resource.id)
          : [{ ...resource, bookmarked: true }, ...current.saved.filter((item) => item.id !== resource.id)],
      }));
      if (navigator.onLine) {
        const syncResult = await runSynchronization(studentId);
        if (syncResult.error) setError(`Saved on this device. ${syncResult.error}`);
      }
    } catch (requestError) {
      setError(`Saved on this device. Server sync is pending. ${requestError instanceof Error ? requestError.message : ""}`.trim());
    } finally {
      setBookmarkBusy(null);
    }
  }

  async function downloadResource(resource: LearningResource) {
    if (!studentId) {
      setError("Sign in to save resources for offline learning.");
      return;
    }
    setDownloadBusy(resource.id);
    setError("");
    try {
      let latest = resource;
      if (navigator.onLine) {
        try {
          latest = (await resourceApi.detail(resource.id)).resource;
        } catch {
          const saved = await getCachedResource(studentId, resource.id);
          if (!saved) throw new Error("This resource is unavailable from the server and has not been saved on this device.");
          latest = saved.resource;
        }
      } else {
        const saved = await getCachedResource(studentId, resource.id);
        if (!saved) throw new Error("Connect to the internet once to prepare this demo preview for offline use.");
        latest = saved.resource;
      }
      let blob: Blob;
      let fileName: string;
      let contentLabel: string;
      if (latest.downloadAllowed) {
        blob = await resourceApi.fetchPdf(latest.id);
        if (blob.type !== "application/pdf") throw new Error("The source did not return a valid PDF download.");
        fileName = `${latest.title.replace(/[^\w.-]+/g, "-")}.pdf`;
        contentLabel = "Permission-approved source PDF";
      } else if (latest.isDemo && !latest.sourceDirectory) {
        const sample = await createOfflinePreview(latest);
        blob = sample.blob;
        fileName = sample.fileName;
        contentLabel = sample.contentLabel;
      } else {
        throw new Error("This item links to its original source. Download it there only when that source permits it; no copy is saved here.");
      }
      const entry: OfflineResource = {
        key: `${studentId}:${latest.id}`,
        studentId,
        resource: latest,
        cachedAt: new Date().toISOString(),
        download: blob,
        fileName,
        contentLabel,
        downloadBytes: blob.size,
      };
      await storeOfflineResource(entry);
      setDownloadedIds((current) => new Set(current).add(latest.id));
      setError(`Saved "${latest.title}" on this device: ${contentLabel}.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "The offline preview could not be saved.");
    } finally {
      setDownloadBusy(null);
    }
  }

  return (
    <ResourceShell current={savedOnly ? "saved" : "library"}>
      <main className="library-main">
        <section className="library-hero">
          <span className="library-hero-orb"><Library size={21} /></span>
          <div className="section-eyebrow">YOUR STUDY SPACE</div>
          <h1>{savedOnly ? "Your saved resources." : "A library for curious minds."}</h1>
          <p>{savedOnly ? "The learning materials you’ve bookmarked, together in one place." : "Find a guide, explore a topic, or pick up a lesson—at a pace that feels right."}</p>
          <span className="library-hero-demo"><Sparkles size={14} /> Official source directories link to providers; item-level permissions vary.</span>
        </section>

        <section className="library-activity-row">
          {!savedOnly && <ActivityShelf heading="Continue learning" subheading="Pick up where you left off" icon="continue" resources={activity.continueLearning} onOpen={(resource) => navigate(`/resources/${encodeURIComponent(resource.id)}`)} />}
          <ActivityShelf heading="Recently opened" subheading="Your latest visits" icon="recent" resources={activity.recent} onOpen={(resource) => navigate(`/resources/${encodeURIComponent(resource.id)}`)} />
        </section>

        {!savedOnly && activity.saved.length > 0 && <section className="library-saved-strip"><div><Bookmark size={16} /><b>Saved for later</b><span>{activity.saved.length} resource{activity.saved.length === 1 ? "" : "s"}</span></div><Link to="/resources?saved=1">See saved <ArrowRight size={14} /></Link></section>}

        <section className="library-browse" id="browse-resources">
          <div className="library-section-heading"><div><div className="section-eyebrow">{savedOnly ? "BOOKMARKS" : "FIND YOUR NEXT STEP"}</div><h2>{savedOnly ? "Saved resources" : "Explore resources"}</h2></div><span className="library-result-count">{displayResources.length} resource{displayResources.length === 1 ? "" : "s"}</span></div>
          {error && <div className="library-error" role="alert">{error}</div>}
          <div className="resource-filter-panel">
            <label className="resource-search"><Search size={18} /><input aria-label="Search resources" onChange={(event) => setSearchText(event.target.value)} placeholder="Search subjects, titles, or topics…" value={searchText} />{searchText && <button aria-label="Clear search" onClick={() => setSearchText("")} type="button"><X size={15} /></button>}</label>
            <div className="resource-filter-controls">
              <label><span><Filter size={14} /> Subject</span><select aria-label="Filter by subject" onChange={(event) => setSubject(event.target.value)} value={subject}><option value="">All subjects</option>{resourceCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label><span><BookOpen size={14} /> Resource type</span><select aria-label="Filter by resource type" onChange={(event) => setType(event.target.value)} value={type}><option value="">All types</option>{resourceTypes.map((resourceType) => <option key={resourceType} value={resourceType}>{resourceTypeLabels[resourceType]}</option>)}</select></label>
              <label><span>Difficulty</span><select aria-label="Filter by difficulty" onChange={(event) => setLevel(event.target.value)} value={level}><option value="">All levels</option>{learningLevels.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>Language</span><select aria-label="Filter by language" onChange={(event) => setLanguage(event.target.value)} value={language}><option value="">All languages</option>{[...new Set(resources.map((item) => item.language).filter(Boolean))].sort().map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>Class / course level</span><select aria-label="Filter by class or course level" onChange={(event) => setClassLevel(event.target.value)} value={classLevel}><option value="">All classes / levels</option>{[...new Set(resources.map((item) => item.classLevel).filter(Boolean))].sort().map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>Sort by</span><select aria-label="Sort resources" onChange={(event) => setSort(event.target.value)} value={sort}><option value="newest">Recently added</option><option value="title">Title A–Z</option><option value="time">Shortest first</option></select></label>
            </div>
          </div>

          {loading ? <LoadingResources /> : displayResources.length === 0 ? <EmptyResources savedOnly={savedOnly} onClear={() => { setSearchText(""); setSubject(""); setType(""); setLevel(""); setLanguage(""); setClassLevel(""); }} /> : <div className="library-resource-grid">{displayResources.map((resource) => <ResourceCard key={resource.id} busy={bookmarkBusy === resource.id} downloaded={downloadedIds.has(resource.id)} downloading={downloadBusy === resource.id} onBookmark={toggleBookmark} onDownload={downloadResource} onOpen={(selected) => navigate(`/resources/${encodeURIComponent(selected.id)}`)} resource={resource} />)}</div>}
        </section>
        {student?.role === "admin" && <div className="admin-library-prompt"><span><Sparkles size={16} /></span><div><b>Curating the learning library?</b><small>Add or update resources in the admin workspace.</small></div><Link to="/admin/resources">Manage resources <ArrowRight size={14} /></Link></div>}
      </main>
    </ResourceShell>
  );
}

function ActivityShelf({
  heading,
  subheading,
  icon,
  resources,
  onOpen,
}: {
  heading: string;
  subheading: string;
  icon: "continue" | "recent";
  resources: LearningResource[];
  onOpen: (resource: LearningResource) => void;
}) {
  return (
    <section className={`activity-shelf activity-${icon}`}>
      <div className="activity-shelf-heading"><span className={`activity-shelf-icon activity-icon-${icon}`}>{icon === "continue" ? <Play size={16} /> : <Clock3 size={16} />}</span><div><h2>{heading}</h2><p>{subheading}</p></div></div>
      {resources.length === 0 ? <p className="activity-empty">{icon === "continue" ? "Your learning journey starts when you open a resource." : "Open a resource to find it again here."}</p> : <div className="activity-resource-list">{resources.slice(0, 3).map((resource) => <button className="activity-resource" key={resource.id} onClick={() => onOpen(resource)} type="button"><span className={`activity-resource-icon art-${resource.type}`}><ResourceIcon type={resource.type} size={16} /></span><span><b>{resource.title}</b><small>{resource.subject} · {resource.lastPositionSeconds > 0 ? `Last position ${formatPosition(resource.lastPositionSeconds)}` : "Preview available"}</small></span><ArrowRight size={14} /></button>)}</div>}
    </section>
  );
}

function LoadingResources() {
  return <div className="resources-loading" role="status"><LoaderCircle size={20} /> Loading the resource library…</div>;
}

function EmptyResources({ savedOnly, onClear }: { savedOnly: boolean; onClear: () => void }) {
  return <div className="empty-resources"><span><BookOpen size={24} /></span><h3>{savedOnly ? "No saved resources yet." : "No resources match those filters."}</h3><p>{savedOnly ? "Bookmark a resource and it will be waiting here when you need it." : "Try another search or clear a filter to explore more topics."}</p>{!savedOnly && <button className="button button-outline" onClick={onClear} type="button">Clear filters</button>}</div>;
}

export function OfflineResourcesPage() {
  const { student } = useStudentAuth();
  const studentId = student?.id ?? "";
  const [resources, setResources] = useState<OfflineResource[]>([]);
  const [selected, setSelected] = useState<OfflineResource | null>(null);
  const [textPreview, setTextPreview] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refreshResources() {
    if (!studentId) return;
    try {
      const cached = await listCachedResources(studentId);
      setResources(cached.filter((entry) => entry.downloadBytes > 0));
    } catch (storageError) {
      setError(storageError instanceof Error ? storageError.message : "Offline resources could not be opened.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refreshResources(); }, [studentId]);

  useEffect(() => {
    let active = true;
    if (selected?.download.type.startsWith("text/plain")) {
      selected.download.text().then((text) => { if (active) setTextPreview(text); })
        .catch((readError: unknown) => setError(readError instanceof Error ? readError.message : "This saved preview could not be opened."));
    } else {
      setTextPreview("");
    }
    return () => { active = false; };
  }, [selected]);

  async function remove(resource: OfflineResource) {
    try {
      await removeOfflineResource(studentId, resource.resource.id);
      setResources((items) => items.filter((item) => item.resource.id !== resource.resource.id));
      if (selected?.resource.id === resource.resource.id) setSelected(null);
      setError("");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "The saved preview could not be removed.");
    }
  }

  const filtered = resources.filter((entry) => `${entry.resource.title} ${entry.resource.subject} ${entry.resource.description}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <ResourceShell current="offline">
      <main className="library-main offline-resources-main">
        <section className="library-hero">
          <span className="library-hero-orb"><HardDrive size={21} /></span>
          <div className="section-eyebrow">SAVED ON THIS DEVICE</div>
          <h1>My Offline Resources.</h1>
          <p>Open permission-approved PDFs and sample text saved in this browser. Original-source links need an internet connection.</p>
        </section>
        {error && <div className="library-error" role="status">{error}</div>}
        <section className="offline-resource-library">
          <label className="resource-search"><Search size={18} /><input aria-label="Search offline resources" onChange={(event) => setQuery(event.target.value)} placeholder="Search saved previews…" value={query} /></label>
          {loading ? <LoadingResources /> : filtered.length === 0 ? (
            <div className="empty-resources"><span><HardDrive size={24} /></span><h3>No saved resources yet.</h3><p>Save a permitted PDF or a clearly labelled sample text preview from the resource library.</p><Link className="button button-outline" to="/resources">Browse resources</Link></div>
          ) : (
            <div className="offline-resource-list">
              {filtered.map((entry) => (
                <article className="offline-resource-row" key={entry.resource.id}>
                  <span className={`offline-resource-icon art-${entry.resource.type}`}><ResourceIcon type={entry.resource.type} size={20} /></span>
                  <div className="offline-resource-copy"><b>{entry.resource.title}</b><span>{entry.resource.subject} · {entry.fileName}</span><small>{entry.contentLabel}</small></div>
                  <button className="resource-open-button" onClick={() => setSelected(entry)} type="button">Open <ArrowRight size={14} /></button>
                  <button aria-label={`Remove ${entry.resource.title} offline preview`} className="offline-remove-button" onClick={() => void remove(entry)} type="button"><Trash2 size={16} /></button>
                </article>
              ))}
            </div>
          )}
        </section>
        {selected && (
          <section aria-label={`Preview of ${selected.resource.title}`} className="offline-preview-panel">
            <div className="offline-preview-heading"><div><div className="section-eyebrow">LOCAL COPY</div><h2>{selected.resource.title}</h2><p>{selected.contentLabel}</p></div><button aria-label="Close preview" className="icon-button" onClick={() => setSelected(null)} type="button"><X size={18} /></button></div>
            {selected.download.type === "application/pdf"
              ? <iframe className="offline-document-frame" title={`${selected.resource.title} offline PDF preview`} src={URL.createObjectURL(selected.download)} />
              : <pre className="offline-text-preview">{textPreview || "Loading saved preview…"}</pre>}
          </section>
        )}
      </main>
    </ResourceShell>
  );
}

export function ResourceDetailPage() {
  const { resourceId = "" } = useParams();
  const { student } = useStudentAuth();
  const studentId = student?.id ?? "";
  const [resource, setResource] = useState<LearningResource | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadDetail() {
      if (!studentId) return;
      try {
        const { resource: opened } = await resourceApi.detail(resourceId);
        await cacheResourceMetadata(studentId, [opened]);
        const saved = await getCachedResource(studentId, resourceId);
        if (active) {
          setResource(opened);
          setDownloaded(Boolean(saved?.downloadBytes));
        }
      } catch (requestError) {
        try {
          const cached = await getCachedResource(studentId, resourceId);
          if (!cached) throw requestError;
          if (active) {
            setResource(cached.resource);
            setDownloaded(cached.downloadBytes > 0);
            setError(navigator.onLine ? "The server is unavailable. Showing the saved copy from this device." : "Offline mode: showing the saved copy from this device.");
          }
        } catch (cacheError) {
          if (active) setError(cacheError instanceof Error ? cacheError.message : "This resource is not available offline. Connect once and save its preview.");
        }
      }
    }
    void loadDetail();
    return () => { active = false; };
  }, [resourceId, studentId]);

  async function updateProgress(completed: boolean) {
    if (!resource || !studentId) return;
    setBusy(true);
    setError("");
    try {
      const nextPosition = completed
        ? resource.estimatedMinutes * 60
        : Math.min(resource.estimatedMinutes * 60, resource.lastPositionSeconds + 60);
      const isComplete = completed || nextPosition >= resource.estimatedMinutes * 60;
      await saveProgressLocally(studentId, resource, nextPosition, isComplete);
      let updated: LearningResource = { ...resource, lastPositionSeconds: nextPosition, completed: isComplete, lastAccessedAt: new Date().toISOString() };
      if (navigator.onLine && !student?.offline) {
        const syncResult = await runSynchronization(studentId);
        if (syncResult.pending > 0) throw new Error(syncResult.error || "The server has not confirmed this progress update yet.");
        const { resource: serverResource } = await resourceApi.detail(resource.id);
        updated = serverResource;
        if (syncResult.error) setError(syncResult.error);
      } else {
        setError("Progress saved on this device. It will sync after reconnecting to the EduSphere server.");
      }
      setResource(updated);
    } catch (requestError) {
      setError(`Progress is saved on this device, but server synchronization is pending. ${requestError instanceof Error ? requestError.message : ""}`.trim());
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookmark() {
    if (!resource || !studentId) return;
    setBusy(true);
    try {
      const currentBookmark = await getLocalBookmark(studentId, resource.id);
      const bookmarked = !(currentBookmark ?? resource.bookmarked);
      await saveBookmarkLocally(studentId, resource, bookmarked);
      setResource({ ...resource, bookmarked });
      if (navigator.onLine && !student?.offline) {
        const syncResult = await runSynchronization(studentId);
        if (syncResult.pending > 0) throw new Error(syncResult.error || "The server has not confirmed this bookmark yet.");
        if (syncResult.error) setError(syncResult.error);
      } else {
        setError("Bookmark saved on this device. It will sync after reconnecting to the EduSphere server.");
      }
    } catch (requestError) {
      setError(`Bookmark saved on this device. Server sync is pending. ${requestError instanceof Error ? requestError.message : ""}`.trim());
    } finally {
      setBusy(false);
    }
  }

  async function downloadResource() {
    if (!resource || !studentId) return;
    setBusy(true);
    try {
      let blob: Blob;
      let fileName: string;
      let contentLabel: string;
      if (resource.downloadAllowed) {
        blob = await resourceApi.fetchPdf(resource.id);
        if (blob.type !== "application/pdf") throw new Error("The source did not return a valid PDF download.");
        fileName = `${resource.title.replace(/[^\w.-]+/g, "-")}.pdf`;
        contentLabel = "Permission-approved source PDF";
      } else if (resource.isDemo && !resource.sourceDirectory) {
        const sample = await createOfflinePreview(resource);
        blob = sample.blob;
        fileName = sample.fileName;
        contentLabel = sample.contentLabel;
      } else {
        throw new Error("This item links to its original source. Download it there only when that source permits it; no copy is saved here.");
      }
      await storeOfflineResource({
        key: `${studentId}:${resource.id}`,
        studentId,
        resource,
        cachedAt: new Date().toISOString(),
        download: blob,
        fileName,
        contentLabel,
        downloadBytes: blob.size,
      });
      setDownloaded(true);
      setError(`Saved on this device: ${contentLabel}.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "The offline preview could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResourceShell current="library">
      <main className="resource-detail-main">
        <Link className="resource-back-link" to="/resources"><ArrowLeft size={16} /> Back to resource library</Link>
        {error && <div className="library-error" role="alert">{error}</div>}
        {!resource && !error ? <LoadingResources /> : resource && (
          <article className="resource-detail-card">
            <div className={`resource-detail-art art-${resource.type}`}><span><ResourceIcon type={resource.type} size={35} /></span><i /><i /><span>{resourceTypeLabels[resource.type]}</span></div>
            <div className="resource-detail-content">
              <div className="library-resource-tags"><span>{resource.subject}</span><span>{resource.classLevel || "Level not specified"}</span><span>{resource.level}</span><span>{resource.language || "Language not specified"}</span><span className="demo-resource-badge">{resource.sourceDirectory ? "Provider link" : resource.isDemo ? "EduSphere sample" : "Curated resource"}</span></div>
              <h1>{resource.title}</h1><p className="resource-detail-description">{resource.description}</p>
              <div className="resource-detail-meta"><span><ResourceIcon type={resource.type} size={16} /> {resourceTypeLabels[resource.type]}</span>{resource.estimatedMinutes > 0 && <span><Clock3 size={16} /> About {resource.estimatedMinutes} minutes</span>}<span><Sparkles size={16} /> {resource.level}</span></div>
              <section className="resource-source-details"><b>Original source: {resource.sourceName || "EduSphere"}</b>{resource.sourceUrl ? <a href={resource.sourceUrl} rel="noreferrer noopener" target="_blank">{resource.sourceUrl} <ExternalLink size={14} /></a> : <span>EduSphere original sample text</span>}<p><b>Licence / permission:</b> {resource.licenseInfo || "Review the original source's terms before reuse."}</p></section>
              <section className="resource-preview-box"><div className="resource-preview-heading"><span><BookOpen size={17} /> {resource.sourceDirectory ? "Source information" : "Learning preview"}</span><span className="demo-resource-badge">{resource.sourceDirectory ? "OFFICIAL LINK" : resource.isDemo ? "SAMPLE TEXT" : "PREVIEW"}</span></div><p>{resource.preview}</p><small>{resource.sourceDirectory ? "This directory entry links to the provider. It does not contain or redistribute provider materials." : resource.isDemo ? "This is original sample text for demonstration, not the original source file." : "Check the linked source and license before reusing this material."}</small></section>
              {resource.lastPositionSeconds > 0 && <div className="resource-reading-status"><span>Learning progress</span><b>{resource.completed ? "Completed" : `${formatPosition(resource.lastPositionSeconds)} explored`}</b></div>}
              {!resource.sourceDirectory && resource.type !== "link" && <div className="resource-progress-track"><span style={{ width: resource.completed ? "100%" : `${Math.min(96, Math.round(resource.lastPositionSeconds / (resource.estimatedMinutes * 60) * 100))}%` }} /></div>}
              <div className="resource-detail-actions">
                {!resource.sourceDirectory && resource.type !== "link" && <button className="button button-primary" disabled={busy || resource.completed} onClick={() => updateProgress(resource.lastPositionSeconds + 60 >= resource.estimatedMinutes * 60)} type="button">{resource.completed ? <><Check size={16} /> Completed</> : <><Play size={15} fill="currentColor" /> {resource.lastPositionSeconds > 0 ? "Continue learning" : "Start learning"}</>} {!resource.completed && <ArrowRight size={15} />}</button>}
                <button className={`detail-bookmark${resource.bookmarked ? " bookmarked" : ""}`} disabled={busy} onClick={toggleBookmark} type="button"><Bookmark size={16} fill={resource.bookmarked ? "currentColor" : "none"} /> {resource.bookmarked ? "Saved" : "Save for later"}</button>
                {resource.downloadAllowed && <button className="offline-download-button" disabled={busy} onClick={downloadResource} type="button">{downloaded ? <><Check size={14} /> Saved offline</> : <><Download size={14} /> Download permitted PDF</>}</button>}
                {resource.sourceUrl && <a className="resource-source-link" href={resource.sourceUrl} rel="noreferrer noopener" target="_blank">Visit original source <ExternalLink size={14} /></a>}
              </div>
              <p className="resource-detail-note"><Check size={14} /> {resource.sourceDirectory || resource.type === "link" ? "This entry links to the original provider; access its content and terms there." : "Your progress is saved on this device first. Server sync only occurs after the server acknowledges it."}</p>
              {student?.role === "admin" && <Link className="resource-admin-edit" to="/admin/resources">Manage this resource <ArrowRight size={14} /></Link>}
            </div>
          </article>
        )}
      </main>
    </ResourceShell>
  );
}

export function AdminResourcePage() {
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [form, setForm] = useState<ResourceDetails>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);

  async function refreshResources() {
    const result = await resourceApi.adminList();
    setResources(result.resources);
  }

  useEffect(() => {
    let active = true;
    resourceApi.adminList().then(({ resources: items }) => {
      if (active) setResources(items);
    }).catch((requestError: unknown) => {
      if (active) setError(requestError instanceof Error ? requestError.message : "Admin resource management could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  function editResource(resource: LearningResource) {
    setEditingId(resource.id);
    setForm({
      title: resource.title,
      description: resource.description,
      subject: resource.subject,
      level: resource.level,
      type: resource.type,
      estimatedMinutes: resource.estimatedMinutes,
      preview: resource.preview,
      language: resource.language || "English",
      classLevel: resource.classLevel || "Not specified",
      sourceName: resource.sourceName || "EduSphere",
      sourceUrl: resource.sourceUrl || "",
      licenseInfo: resource.licenseInfo || "",
    });
    setSelectedPdf(null);
    setPermissionConfirmed(false);
    setNotice("");
    setError("");
    document.getElementById("resource-admin-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    let resourceSaved = false;
    let savedResource: LearningResource | null = null;
    const creating = !editingId;
    try {
      if (selectedPdf && (selectedPdf.type !== "application/pdf" || selectedPdf.size > 10 * 1024 * 1024)) {
        throw new Error("Choose a PDF file no larger than 10 MB.");
      }
      if (selectedPdf && !permissionConfirmed) {
        throw new Error("Confirm that you have permission to store and distribute this PDF.");
      }
      if (editingId) {
        savedResource = (await resourceApi.update(editingId, form)).resource;
      } else {
        savedResource = (await resourceApi.create(form)).resource;
      }
      resourceSaved = true;
      if (selectedPdf && savedResource) savedResource = (await resourceApi.uploadPdf(savedResource.id, selectedPdf)).resource;
      await refreshResources();
      setNotice(editingId ? "Resource details updated." : "Resource added.");
      setEditingId(null);
      setForm(emptyForm);
      setSelectedPdf(null);
      setPermissionConfirmed(false);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "The resource could not be saved.";
      if (creating && resourceSaved && savedResource) setEditingId(savedResource.id);
      setError(resourceSaved ? `The resource details were saved, but the PDF upload failed. ${message}` : message);
    } finally {
      setSaving(false);
    }
  }

  async function removePdf(resource: LearningResource) {
    setError("");
    setNotice("");
    try {
      await resourceApi.removePdf(resource.id);
      await refreshResources();
      setNotice(`The stored PDF for "${resource.title}" was removed.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The PDF could not be removed.");
    }
  }

  async function deleteResource(resource: LearningResource) {
    setError("");
    setNotice("");
    try {
      await resourceApi.delete(resource.id);
      await refreshResources();
      setPendingDelete(null);
      setNotice("Resource deleted.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The resource could not be deleted.");
    }
  }

  return (
    <ResourceShell current="admin">
      <main className="admin-resource-main">
        <Link className="resource-back-link" to="/resources"><ArrowLeft size={16} /> Back to library</Link>
        <div className="admin-resource-title"><div><div className="section-eyebrow">CONTENT WORKSPACE</div><h1>Resource management</h1><p>Add original materials or trusted source links. Only upload PDFs you have explicit permission to store and distribute.</p></div><span className="admin-demo-badge"><Sparkles size={15} /> Admin workspace</span></div>
        {error && <div className="library-error" role="alert">{error}</div>}
        {notice && <div className="admin-success" role="status"><Check size={15} /> {notice}</div>}
        <div className="admin-resource-layout">
          <form className="profile-card admin-resource-form" id="resource-admin-form" onSubmit={submit}>
            <div className="profile-card-heading"><div><div className="section-eyebrow">{editingId ? "UPDATE RESOURCE" : "CREATE RESOURCE"}</div><h2>{editingId ? "Edit resource" : "Add a learning resource"}</h2></div>{editingId && <button className="resource-form-cancel" onClick={() => { setEditingId(null); setForm(emptyForm); setSelectedPdf(null); setPermissionConfirmed(false); }} type="button">Cancel edit</button>}</div>
            <label className="form-field"><span>Title</span><input className="text-input" maxLength={140} minLength={4} onChange={(event) => setForm({ ...form, title: event.target.value })} required value={form.title} /></label>
            <label className="form-field"><span>Description</span><textarea className="text-input admin-textarea" maxLength={600} minLength={4} onChange={(event) => setForm({ ...form, description: event.target.value })} required value={form.description} /></label>
            <div className="admin-form-row"><label className="form-field"><span>Subject category</span><select className="text-input" onChange={(event) => setForm({ ...form, subject: event.target.value })} value={form.subject}>{resourceCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="form-field"><span>Resource type</span><select className="text-input" onChange={(event) => setForm({ ...form, type: event.target.value as LearningResource["type"] })} value={form.type}>{resourceTypes.map((resourceType) => <option key={resourceType} value={resourceType}>{resourceTypeLabels[resourceType]}</option>)}</select></label></div>
            <div className="admin-form-row"><label className="form-field"><span>Learning level</span><select className="text-input" onChange={(event) => setForm({ ...form, level: event.target.value })} value={form.level}>{learningLevels.map((level) => <option key={level}>{level}</option>)}</select></label><label className="form-field"><span>Estimated minutes</span><input className="text-input" max={600} min={1} onChange={(event) => setForm({ ...form, estimatedMinutes: Number(event.target.value) })} required type="number" value={form.estimatedMinutes} /></label></div>
            <div className="admin-form-row"><label className="form-field"><span>Class / course level</span><input className="text-input" maxLength={60} minLength={4} onChange={(event) => setForm({ ...form, classLevel: event.target.value })} required value={form.classLevel} /></label><label className="form-field"><span>Language</span><input className="text-input" maxLength={40} minLength={2} onChange={(event) => setForm({ ...form, language: event.target.value })} required value={form.language} /></label></div>
            <label className="form-field"><span>Original source / provider</span><input className="text-input" maxLength={100} minLength={2} onChange={(event) => setForm({ ...form, sourceName: event.target.value })} required value={form.sourceName} /></label>
            <label className="form-field"><span>Original source URL (trusted HTTPS source)</span><input className="text-input" onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="https://... (optional unless External source)" type="url" value={form.sourceUrl} required={form.type === "link"} /><small className="readonly-hint">Links are restricted to NCERT/ePathshala, DIKSHA, SWAYAM, NPTEL, NDLI, and OpenStax domains.</small></label>
            <label className="form-field"><span>Licence / permission information</span><textarea className="text-input admin-textarea" maxLength={500} minLength={4} onChange={(event) => setForm({ ...form, licenseInfo: event.target.value })} required value={form.licenseInfo} /></label>
            <label className="form-field"><span>Preview or learning description</span><textarea className="text-input admin-textarea admin-preview-textarea" maxLength={5000} minLength={4} onChange={(event) => setForm({ ...form, preview: event.target.value })} required value={form.preview} /></label>
            <label className="form-field"><span>Upload permission-approved PDF (maximum 10 MB)</span><input accept="application/pdf,.pdf" className="text-input" onChange={(event) => setSelectedPdf(event.target.files?.[0] ?? null)} type="file" />{selectedPdf && <small>{selectedPdf.name} · {(selectedPdf.size / 1024 / 1024).toFixed(2)} MB</small>}</label>
            {selectedPdf && <label className="resource-permission-confirm"><input checked={permissionConfirmed} onChange={(event) => setPermissionConfirmed(event.target.checked)} required type="checkbox" /><span>I confirm I have permission to store and distribute this PDF.</span></label>}
            {editingId && resources.find((item) => item.id === editingId)?.hasFile && <button className="resource-form-cancel" onClick={() => { const current = resources.find((item) => item.id === editingId); if (current) void removePdf(current); }} type="button">Remove uploaded PDF</button>}
            <button className="button button-primary admin-save-button" disabled={saving} type="submit">{saving ? "Saving…" : editingId ? "Save resource changes" : "Add resource"} {editingId ? <Check size={15} /> : <Plus size={16} />}</button>
          </form>

          <section className="profile-card admin-resource-list"><div className="profile-card-heading"><div><div className="section-eyebrow">LIBRARY CONTENT</div><h2>{resources.length} resource{resources.length === 1 ? "" : "s"}</h2></div><Link className="admin-library-link" to="/resources">View library <ArrowRight size={14} /></Link></div>
            {loading ? <LoadingResources /> : resources.length === 0 ? <EmptyResources savedOnly={false} onClear={() => undefined} /> : <div className="admin-resource-items">{resources.map((resource) => <article className="admin-resource-item" key={resource.id}><span className={`admin-resource-item-icon art-${resource.type}`}><ResourceIcon type={resource.type} size={17} /></span><div><b>{resource.title}</b><small>{resource.subject} · {resourceTypeLabels[resource.type]} · {resource.sourceDirectory ? "Official directory" : resource.isDemo ? "Seed sample" : "Admin added"} · {resource.hasFile ? "Permission-approved PDF" : "Link/sample only"}</small></div>{resource.sourceDirectory ? <span className="seed-protected-label">Maintained</span> : <button aria-label={`Edit ${resource.title}`} className="admin-edit-button" onClick={() => editResource(resource)} type="button">Edit</button>}{resource.isDemo ? <span className="seed-protected-label">Seed</span> : <button aria-label={`Delete ${resource.title}`} className="admin-delete-button" onClick={() => setPendingDelete(resource.id)} type="button"><Trash2 size={16} /></button>}{pendingDelete === resource.id && <div className="admin-delete-confirm" role="group" aria-label={`Confirm deletion of ${resource.title}`}><span>Delete this resource?</span><button onClick={() => void deleteResource(resource)} type="button">Delete</button><button onClick={() => setPendingDelete(null)} type="button">Keep</button></div>}</article>)}</div>}
          </section>
        </div>
      </main>
    </ResourceShell>
  );
}

function formatPosition(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes ? `${minutes}m${remainingSeconds ? ` ${remainingSeconds}s` : ""}` : `${remainingSeconds}s`;
}
