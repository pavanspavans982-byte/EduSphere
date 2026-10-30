import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft, Check, Clock3, Database, Download, RefreshCw, ShieldCheck,
  TriangleAlert, Wifi, WifiOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useStudentAuth } from "../auth/AuthContext";
import { syncApi } from "../auth/api";
import { listChatMessages } from "../ai/chatStorage";
import type { ReactNode } from "react";
import { getSyncState } from "./syncStorage";
import { getPendingSyncCount, runSynchronization } from "./syncEngine";

type SyncCenterStatus = Awaited<ReturnType<typeof getSyncState>>;
type AdminOverview = Awaited<ReturnType<typeof syncApi.adminOverview>>;

export function SyncCenterPage() {
  const { student, refreshStudent } = useStudentAuth();
  const [syncState, setSyncState] = useState<SyncCenterStatus | null>(null);
  const [serverLastSync, setServerLastSync] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingQuestions, setPendingQuestions] = useState(0);
  const [serverQueuedQuestions, setServerQueuedQuestions] = useState(0);
  const [includeQuestions, setIncludeQuestions] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!student?.id) return;
    const [local, count, chats] = await Promise.all([
      getSyncState(student.id),
      getPendingSyncCount(student.id),
      listChatMessages(student.id),
    ]);
    setSyncState(local);
    setPendingCount(count);
    setPendingQuestions(chats.filter((message) =>
      message.role === "user" && message.status === "pending-online" && message.syncRequestStatus !== "queued",
    ).length);
    if (navigator.onLine && !student.offline) {
      try {
        const [status, doubts] = await Promise.all([syncApi.status(), syncApi.doubtRequests()]);
        setServerLastSync(status.lastSuccessfulSyncAt);
        setServerQueuedQuestions(doubts.requests.filter((item) => item.status === "queued").length);
      } catch {
        setServerLastSync(local.lastSuccessfulSyncAt);
      }
    } else {
      setServerLastSync(local.lastSuccessfulSyncAt);
    }
  }, [student?.id, student?.offline]);

  useEffect(() => {
    let active = true;
    const updateStatus = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    void refresh().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Local synchronization status could not be loaded.");
    });
    return () => {
      active = false;
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, [refresh]);

  async function synchronize() {
    if (!student?.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await runSynchronization(student.id, includeQuestions);
      setError(result.error);
      if (result.pending === 0 && result.failed === 0) {
        await refreshStudent();
      }
      await refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Synchronization failed. Local data has not been removed.");
    } finally {
      setBusy(false);
    }
  }

  const label = syncState?.status === "syncing" || busy
    ? "Syncing"
    : syncState?.status === "failed"
      ? "Sync Failed"
      : pendingCount > 0 || pendingQuestions > 0
        ? "Waiting to Sync"
        : syncState?.status === "synced"
          ? "Successfully Synced"
          : "Waiting to Sync";

  return (
    <SyncLayout>
      <main className="sync-main">
        <Link className="sync-back-link" to="/dashboard"><ArrowLeft size={15} /> Student dashboard</Link>
        <div className="sync-page-heading">
          <div><div className="section-eyebrow">YOUR DEVICE ↔ EDUSPHERE</div><h1>Sync center</h1><p>Offline changes stay on this device until the central server confirms they were saved.</p></div>
          <span className={`sync-connect-pill${online ? " online" : " offline"}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? "Online" : "Offline"}</span>
        </div>

        <section className={`sync-status-card sync-status-${syncState?.status ?? "waiting"}`}>
          <div className="sync-status-icon">{syncState?.status === "synced" ? <Check size={23} /> : syncState?.status === "failed" ? <TriangleAlert size={23} /> : syncState?.status === "syncing" ? <RefreshCw size={23} /> : <Clock3 size={23} />}</div>
          <div className="sync-status-copy"><span>Synchronization status</span><h2>{label}</h2><p>{syncState?.error || (pendingCount > 0 || pendingQuestions > 0 ? `${pendingCount + pendingQuestions} local item${pendingCount + pendingQuestions === 1 ? "" : "s"} need confirmation.` : "Your supported learning data is up to date on this device.")}</p></div>
          <button className="button button-primary sync-now-button" disabled={busy || !online || Boolean(student?.offline)} onClick={() => void synchronize()} type="button">{busy ? <><RefreshCw className="sync-spin" size={15} /> Syncing…</> : <><RefreshCw size={15} /> Sync Now</>}</button>
        </section>

        {!online && <div className="sync-message sync-warning" role="status"><WifiOff size={16} /><span>Offline. Your queued changes and downloads remain in local storage. Sync Now becomes available when the server can be reached.</span></div>}
        {error && <div className="sync-message sync-error" role="alert"><TriangleAlert size={16} /><span>{error}</span></div>}

        <section className="sync-last-success"><span><Check size={15} /> Last successful server sync</span><strong>{serverLastSync ? new Date(serverLastSync).toLocaleString() : "No successful sync recorded yet"}</strong></section>

        <section className="sync-data-grid" aria-label="Local synchronization queue">
          <SyncDataCard icon={<Database size={18} />} title="Learning activity" count="Resource progress, bookmarks, skill lessons" detail="Outbox items are removed only after server acknowledgment." />
          <SyncDataCard icon={<ShieldCheck size={18} />} title="Assessment results" count="Submitted quiz results and scores" detail="The central server validates and grades each attempt." />
          <SyncDataCard icon={<Download size={18} />} title="Offline resources" count="Downloads stay stored on this device" detail="Resource files are not uploaded during synchronization." />
        </section>

        {pendingQuestions > 0 && (
          <section className="sync-consent-card">
            <div><div className="section-eyebrow">OPTIONAL · PRIVATE BY DEFAULT</div><h2>{pendingQuestions} pending doubt question{pendingQuestions === 1 ? "" : "s"}</h2><p>Questions remain local unless you explicitly choose to upload them. If selected, the server queues them for follow-up; this does not produce an AI answer.</p></div>
            <label className="sync-consent-check"><input checked={includeQuestions} onChange={(event) => setIncludeQuestions(event.target.checked)} type="checkbox" /><span>I agree to upload these pending questions to the EduSphere server queue.</span></label>
          </section>
        )}
        {serverQueuedQuestions > 0 && <div className="sync-message sync-queued-message"><Check size={16} /><span>{serverQueuedQuestions} pending doubt request{serverQueuedQuestions === 1 ? "" : "s"} confirmed in the central queue. No AI response is implied.</span></div>}

        <section className="sync-info-card"><h2>How conflicts are handled</h2><p>Resource progress uses a last-updated-wins rule. If the server has newer progress, it keeps that version and reports the conflict. Profile updates use the server version captured when editing began; if another device changed the profile first, the update stays pending with an error so you can review it instead of overwriting newer information.</p></section>
      </main>
    </SyncLayout>
  );
}

export function AdminDashboardPage() {
  const { student, updateStudent } = useStudentAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [bootstrapping, setBootstrapping] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (student?.role !== "admin") {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    syncApi.adminOverview()
      .then((data) => { if (active) setOverview(data); })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "The admin activity summary could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [student?.role]);

  async function bootstrapAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBootstrapping(true);
    try {
      const result = await syncApi.bootstrapAdmin(bootstrapToken);
      await updateStudent(result.student);
      setBootstrapToken("");
      setNotice("Administrator access was granted by the EduSphere server.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Administrator setup could not be completed.");
    } finally {
      setBootstrapping(false);
    }
  }

  if (student?.role !== "admin") {
    return (
      <SyncLayout>
        <main className="sync-main admin-sync-main">
          <div className="sync-page-heading"><div><div className="section-eyebrow">RESTRICTED SETUP</div><h1>Administrator access</h1><p>Only accounts explicitly allowlisted by the server operator can be set up as administrators.</p></div></div>
          {error && <div className="sync-message sync-error" role="alert"><TriangleAlert size={16} /><span>{error}</span></div>}
          {notice && <div className="sync-message" role="status"><Check size={16} /><span>{notice}</span></div>}
          <form className="sync-info-card" onSubmit={(event) => void bootstrapAdmin(event)}>
            <label className="form-field"><span>Server-provided setup token</span><input autoComplete="off" className="text-input" onChange={(event) => setBootstrapToken(event.target.value)} required type="password" value={bootstrapToken} /></label>
            <p>The token is checked by the server and is never stored in the account profile. Ask the server operator for setup access; do not share the token.</p>
            <button className="button button-primary" disabled={bootstrapping} type="submit">{bootstrapping ? "Verifying access…" : "Verify and enable administrator access"}</button>
          </form>
        </main>
      </SyncLayout>
    );
  }

  const summary = overview?.summary;
  const metrics = [
    ["Registered students", summary?.students ?? 0],
    ["Learning resources", summary?.resources ?? 0],
    ["Assessment attempts", summary?.assessmentAttempts ?? 0],
    ["Recorded completed lessons", summary?.skillActions ?? 0],
    ["Acknowledged sync operations", summary?.acknowledgedSyncOperations ?? 0],
    ["Failed sync operations", summary?.failedSyncOperations ?? 0],
    ["Queued doubt requests", summary?.queuedDoubtRequests ?? 0],
    ["Completed resource records", summary?.completedResources ?? 0],
  ] as const;

  return (
    <SyncLayout>
      <main className="sync-main admin-sync-main">
        <div className="sync-page-heading"><div><div className="section-eyebrow">RESTRICTED · {student?.email}</div><h1>Central activity dashboard</h1><p>Server-side counts and recent synchronization outcomes. Student content and credentials are not exposed here.</p></div><div className="admin-dashboard-actions"><Link className="button button-outline" to="/admin/courses">Manage courses</Link><Link className="button button-outline" to="/admin/resources">Manage resources</Link></div></div>
        {error && <div className="sync-message sync-error" role="alert"><TriangleAlert size={16} /><span>{error}</span></div>}
        {loading ? <p className="sync-loading">Loading central activity…</p> : overview && <>
          <section className="admin-sync-metrics">{metrics.map(([label, value]) => <article className="admin-sync-metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
          <section className="sync-info-card admin-recent-sync"><div className="sync-admin-section-heading"><div><div className="section-eyebrow">SERVER ACKNOWLEDGMENTS AND FAILURES</div><h2>Recent sync operations</h2></div><Link to="/sync">Open sync center <ArrowLeft size={14} /></Link></div>
            {overview.recentSync.length ? <div className="admin-sync-list">{overview.recentSync.map((item, index) => <article className="admin-sync-row" key={`${item.processedAt}-${index}`}><span className={`admin-sync-result ${item.status}`}>{item.status === "acknowledged" ? "Acknowledged" : "Failed"}</span><b>{item.type}</b><time>{new Date(item.processedAt).toLocaleString()}</time>{item.error && <small>{item.error}</small>}</article>)}</div> : <p>No sync operations have been received yet.</p>}
          </section>
        </>}
      </main>
    </SyncLayout>
  );
}

function SyncDataCard({ icon, title, count, detail }: { icon: ReactNode; title: string; count: string; detail: string }) {
  return <article className="sync-data-card"><span>{icon}</span><div><h3>{title}</h3><b>{count}</b><p>{detail}</p></div></article>;
}

function SyncLayout({ children }: { children: ReactNode }) {
  return <div className="sync-page"><header className="sync-header"><Link aria-label="EduSphere home" className="brand" to="/"><span className="brand-mark"><Database size={19} /></span><span>edu<span>sphere</span></span></Link><nav aria-label="Synchronization navigation"><Link to="/dashboard">Dashboard</Link><Link to="/resources">Resources</Link><Link to="/skills">Skills</Link><Link to="/assessments">Assessments</Link><Link className="sync-nav-current" to="/sync">Sync center</Link></nav><Link className="sync-dashboard-link" to="/profile">My profile</Link></header>{children}</div>;
}
