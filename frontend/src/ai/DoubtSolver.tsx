import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  GraduationCap,
  Lightbulb,
  LoaderCircle,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { aiApi, type AiQuestion, type AiServiceStatus } from "../auth/api";
import { useStudentAuth } from "../auth/AuthContext";
import {
  clearChatMessages,
  listChatMessages,
  saveChatMessage,
  updateChatMessage,
  type ChatMessage,
} from "./chatStorage";

const suggestedQuestions = [
  { subject: "Mathematics", question: "Can you explain why 1/2 is the same as 2/4?" },
  { subject: "Science", question: "What happens to water when it evaporates?" },
  { subject: "Computer Science", question: "What is an algorithm? Could you show a simple example?" },
  { subject: "English", question: "What is the difference between a main idea and a supporting detail?" },
];

const subjects = ["Mathematics", "Science", "Computer Science", "English", "General"];

function makeMessage(studentId: string, values: Omit<ChatMessage, "id" | "studentId" | "createdAt">): ChatMessage {
  return {
    ...values,
    id: crypto.randomUUID(),
    studentId,
    createdAt: new Date().toISOString(),
  };
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function ChatHeader({
  isOnline,
  status,
  statusError,
  onClear,
  onReviewPending,
  pendingCount,
}: {
  isOnline: boolean;
  status: AiServiceStatus | null;
  statusError: string;
  onClear: () => void;
  onReviewPending: () => void;
  pendingCount: number;
}) {
  return (
    <>
      <header className="doubt-header">
        <div className="doubt-header-brand">
          <Link aria-label="EduSphere home" className="brand" to="/"><span className="brand-mark"><GraduationCap size={21} /></span><span>edu<span>sphere</span></span></Link>
          <span className="doubt-header-divider" />
          <Link className="doubt-header-back" to="/dashboard"><ArrowLeft size={15} /> Dashboard</Link>
        </div>
        <div className="doubt-header-actions">
          <span className={`doubt-network-chip${isOnline ? "" : " network-offline"}`}>{isOnline ? <Wifi size={14} /> : <WifiOff size={14} />} {isOnline ? "Network appears connected" : "Device is offline"}</span>
          <Link aria-label="Student profile" className="doubt-profile-link" to="/profile"><GraduationCap size={17} /></Link>
        </div>
      </header>
      <div className="ai-readiness-bar">
        <div className="ai-readiness-model"><span className={`ai-status-dot${status?.local.available ? " ai-ready" : ""}`} /><span><b>Local AI</b> {status?.local.available ? `ready · ${status.local.model}` : status ? `${status.local.runtime} model not available` : statusError ? "status unavailable" : "checking…"}</span></div>
        <span className="ai-readiness-separator" />
        <div className="ai-readiness-model"><span className={`ai-status-dot${status?.online.configured ? " ai-configured" : ""}`} /><span><b>Online AI</b> {status?.online.configured ? "configured · ask before sending" : status ? "not configured" : statusError ? "status unavailable" : "checking…"}</span></div>
        <button className="clear-conversation-button" onClick={onClear} type="button"><Trash2 size={14} /> Clear conversation</button>
      </div>
      {statusError && <div className="ai-status-notice" role="status">{statusError} Your saved conversation is still available in this browser.</div>}
      {!isOnline && <div className="ai-offline-notice"><WifiOff size={15} /> Questions are saved on this device. Local answers are only available if Ollama can still be reached on the EduSphere host.</div>}
      {isOnline && pendingCount > 0 && <div className="ai-pending-notice"><span><Clock3 size={15} /> {pendingCount} question{pendingCount === 1 ? "" : "s"} waiting for online assistance</span><button onClick={onReviewPending} type="button">Review &amp; send <ArrowRight size={14} /></button></div>}
    </>
  );
}

function ProviderTag({ provider }: { provider: ChatMessage["source"] }) {
  if (provider === "local") return <span className="chat-provider-tag provider-local"><Lightbulb size={12} /> Local AI · Ollama</span>;
  if (provider === "online") return <span className="chat-provider-tag provider-online"><Sparkles size={12} /> Online AI</span>;
  return null;
}

function MessageBubble({
  message,
  studentName,
  canAskLocal,
  canAskOnline,
  busy,
  onRetryLocal,
  onAskOnline,
}: {
  message: ChatMessage;
  studentName: string;
  canAskLocal: boolean;
  canAskOnline: boolean;
  busy: boolean;
  onRetryLocal: (message: ChatMessage) => void;
  onAskOnline: (message: ChatMessage) => void;
}) {
  const isStudent = message.role === "user";
  const isSystem = message.source === "system";
  const waiting = isStudent && message.status === "pending-online";
  const answering = isStudent && message.status === "answering";

  return (
    <article className={`chat-message-row${isStudent ? " chat-message-student" : ""}${isSystem ? " chat-message-system" : ""}`} data-message-id={message.id}>
      {!isStudent && <span className={`chat-message-avatar${isSystem ? " system-message-avatar" : ""}`}>{isSystem ? <CircleHelp size={15} /> : <Sparkles size={15} />}</span>}
      <div className="chat-message-column">
        <div className="chat-message-meta">{isStudent ? <b>{studentName}</b> : <b>{isSystem ? "Status update" : "EduSphere tutor"}</b>}{!isStudent && !isSystem && <ProviderTag provider={message.source} />}<time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time></div>
        <div className={`chat-bubble${isStudent ? " student-bubble" : ""}${isSystem ? " system-bubble" : ""}`}>
          <p>{message.content}</p>
          {answering && <span className="queued-state"><LoaderCircle size={13} /> Getting a local explanation…</span>}
          {waiting && <div className="queued-state"><Clock3 size={13} /> Saved on this device · awaiting your choice</div>}
          {!isStudent && !isSystem && message.source === "local" && <button className="follow-online-button" disabled={busy || !canAskOnline} onClick={() => onAskOnline(message)} type="button"><Sparkles size={13} /> {canAskOnline ? "Ask online AI for another explanation" : "Online AI is not configured"}</button>}
        </div>
        {isStudent && waiting && <div className="pending-message-actions"><button disabled={busy || !canAskLocal} onClick={() => onRetryLocal(message)} type="button"><Lightbulb size={13} /> Try local AI again</button><button disabled={busy || !canAskOnline} onClick={() => onAskOnline(message)} type="button"><Sparkles size={13} /> {canAskOnline ? "Ask online AI" : "Online AI unavailable"}</button></div>}
      </div>
      {isStudent && <span className="chat-message-avatar student-message-avatar">{studentName.slice(0, 1).toUpperCase()}</span>}
    </article>
  );
}

function ConsentDialog({
  questions,
  onConfirm,
  onCancel,
  sending,
}: {
  questions: ChatMessage[];
  onConfirm: () => void;
  onCancel: () => void;
  sending: boolean;
}) {
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !sending) onCancel(); }} role="presentation">
      <section aria-labelledby="online-consent-title" aria-modal="true" className="info-dialog online-consent-dialog" role="dialog">
        <button aria-label="Close dialog" className="dialog-close" disabled={sending} onClick={onCancel} type="button"><X size={19} /></button>
        <span className="dialog-icon"><ShieldCheck size={21} /></span>
        <div className="section-eyebrow">YOUR CHOICE, EVERY TIME</div>
        <h2 id="online-consent-title">Send {questions.length} saved question{questions.length === 1 ? "" : "s"} online?</h2>
        <p>These question{questions.length === 1 ? "" : "s"} and recent chat context will be sent to the configured online AI service. Do not send personal or sensitive information. Nothing will be sent unless you confirm.</p>
        <div className="consent-question-list">{questions.map((question) => <p key={question.id}>“{question.content}”</p>)}</div>
        <div className="consent-actions"><button className="button button-outline" disabled={sending} onClick={onCancel} type="button">Not now</button><button className="button button-primary" disabled={sending} onClick={onConfirm} type="button">{sending ? "Sending…" : "Send selected questions"} <ArrowRight size={15} /></button></div>
      </section>
    </div>
  );
}

export function DoubtSolverPage() {
  const { student, logout } = useStudentAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [subject, setSubject] = useState("General");
  const [mode, setMode] = useState<AiQuestion["mode"]>("step-by-step");
  const [status, setStatus] = useState<AiServiceStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentQuestions, setConsentQuestions] = useState<ChatMessage[]>([]);
  const [pendingNetworkNotice, setPendingNetworkNotice] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const activeQuestion = useRef<string | null>(null);

  const studentMessages = useMemo(() => messages.filter((message) => message.role === "user"), [messages]);
  const pendingMessages = useMemo(() => studentMessages.filter((message) => message.status === "pending-online"), [studentMessages]);
  const pendingCount = pendingMessages.length;
  const suggested = messages.length === 0;
  const canSend = messageText.trim().length > 0 && !sending && !storageError;
  const canAskOnline = Boolean(status?.online.configured);
  const canAskLocal = Boolean(status?.local.available);

  const refreshStatus = useCallback(async () => {
    try {
      const currentStatus = await aiApi.status();
      setStatus(currentStatus);
      setStatusError("");
    } catch (error) {
      setStatus(null);
      setStatusError(error instanceof Error ? error.message : "AI service status could not be checked.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (!student) return;
    Promise.all([listChatMessages(student.id), aiApi.status()])
      .then(async ([savedMessages, serviceStatus]) => {
        if (active) {
          const recoveredMessages = savedMessages.map((message) =>
            message.role === "user" && message.status === "answering"
              ? { ...message, status: "pending-online" as const }
              : message,
          );
          await Promise.all(recoveredMessages
            .filter((message, index) => message !== savedMessages[index])
            .map((message) => updateChatMessage(message.id, student.id, { status: message.status })));
          setMessages(recoveredMessages);
          setStatus(serviceStatus);
          setLoadError("");
          setStorageError("");
          setStatusError("");
        }
      })
      .catch(async (error: unknown) => {
        if (!active) return;
        try {
          const savedMessages = await listChatMessages(student.id);
          if (active) {
            setMessages(savedMessages);
            setStatusError(error instanceof Error ? error.message : "AI service status could not be checked.");
            setLoadError("");
          }
        } catch (storageFailure) {
          if (active) {
            setLoadError(storageFailure instanceof Error ? storageFailure.message : "The saved chat could not be opened.");
            setStorageError(storageFailure instanceof Error ? storageFailure.message : "Local chat storage is unavailable.");
          }
        }
      });
    return () => { active = false; };
  }, [student]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setPendingNetworkNotice(true);
      void refreshStatus();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshStatus]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function persistNewMessage(message: ChatMessage) {
    if (!student) throw new Error("Please sign in again to continue your conversation.");
    await saveChatMessage(message);
    setMessages((current) => [...current, message]);
  }

  async function persistMessageUpdate(messageId: string, update: Partial<ChatMessage>) {
    if (!student) return;
    await updateChatMessage(messageId, student.id, update);
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, ...update } : message));
  }

  async function recordSystemMessage(questionId: string, content: string) {
    if (!student) return;
    const response = makeMessage(student.id, { role: "assistant", source: "system", content, replyToId: questionId });
    await persistNewMessage(response);
  }

  function getContext(excludeMessageId: string) {
    return messages
      .filter((message) => message.id !== excludeMessageId && (message.role === "user" || message.role === "assistant") && message.source !== "system")
      .filter((message) => message.source !== "system")
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }));
  }

  async function askLocal(questionMessage: ChatMessage) {
    if (!student) return;
    activeQuestion.current = questionMessage.id;
    await persistMessageUpdate(questionMessage.id, { status: "answering", error: undefined });
    try {
      const result = await aiApi.askLocal({
        question: questionMessage.content,
        subject,
        mode,
        context: getContext(questionMessage.id),
      });
      if (result.provider !== "local" || !result.answer.trim()) {
        throw new Error("The local AI service returned no usable answer.");
      }
      await persistMessageUpdate(questionMessage.id, { status: "answered-local", error: undefined });
      await persistNewMessage(makeMessage(student.id, {
        role: "assistant",
        source: "local",
        content: result.answer,
        replyToId: questionMessage.id,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local AI could not answer this question.";
      await persistMessageUpdate(questionMessage.id, { status: "pending-online", error: message });
      await recordSystemMessage(
        questionMessage.id,
        `${message} Your question has been kept in this browser. You can try local AI again or, when online assistance is configured, explicitly choose to send it online.`,
      );
    } finally {
      activeQuestion.current = null;
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = messageText.trim();
    if (!student || !question || sending || storageError) return;

    setSending(true);
    setLoadError("");
    const userMessage = makeMessage(student.id, { role: "user", source: "student", content: question, status: "answering" });
    try {
      await persistNewMessage(userMessage);
      setMessageText("");
      await askLocal(userMessage);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Your message could not be safely stored on this device.");
      setLoadError(error instanceof Error ? error.message : "Your message could not be safely stored on this device.");
    } finally {
      setSending(false);
    }
  }

  function startOnlineConsent(questions: ChatMessage[]) {
    if (!isOnline) {
      setPendingNetworkNotice(true);
      return;
    }
    if (!canAskOnline) {
      setLoadError("Online AI is not configured. Your question remains saved on this device.");
      return;
    }
    setConsentQuestions(questions);
    setConsentOpen(true);
  }

  async function confirmOnlineConsent() {
    setConsentOpen(false);
    setSending(true);
    try {
      for (const question of consentQuestions) {
        if (question.status !== "pending-online") continue;
        await askOnlineSequential(question);
      }
    } finally {
      setSending(false);
      setConsentQuestions([]);
    }
  }

  async function askOnlineSequential(questionMessage: ChatMessage) {
    if (!student) return;
    try {
      await persistMessageUpdate(questionMessage.id, { status: "answering", error: undefined });
      const result = await aiApi.askOnline({
        question: questionMessage.content,
        subject,
        mode,
        context: getContext(questionMessage.id),
      });
      if (result.provider !== "online" || !result.answer.trim()) throw new Error("Online AI returned no usable answer.");
      await persistMessageUpdate(questionMessage.id, { status: "answered-online", error: undefined });
      await persistNewMessage(makeMessage(student.id, {
        role: "assistant", source: "online", content: result.answer, replyToId: questionMessage.id,
      }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Online AI could not answer this question.";
      await persistMessageUpdate(questionMessage.id, { status: "pending-online", error: detail });
      await recordSystemMessage(questionMessage.id, `${detail} Your question is still saved.`);
    }
  }

  async function clearConversation() {
    if (!student) return;
    if (!window.confirm("Clear all saved messages in this browser for your account? This cannot be undone.")) return;
    try {
      await clearChatMessages(student.id);
      setMessages([]);
      setStorageError("");
      setLoadError("");
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "The conversation could not be cleared.");
    }
  }

  async function signOut() {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  if (!student) return null;

  return (
    <main className="doubt-page">
      <ChatHeader
        isOnline={isOnline}
        onClear={clearConversation}
        onReviewPending={() => startOnlineConsent(pendingMessages)}
        pendingCount={pendingCount}
        status={status}
        statusError={statusError}
      />
      <div className="doubt-content">
        <aside className="doubt-sidebar">
          <div className="doubt-sidebar-top">
            <div className="doubt-assistant-mark"><Sparkles size={22} /></div>
            <div><b>Your study buddy</b><span>Here to help you think it through.</span></div>
          </div>
          <div className="doubt-sidebar-heading"><span>LEARNING MODE</span></div>
          <div className="explanation-mode-switch" role="group" aria-label="Explanation style">
            <button aria-pressed={mode === "step-by-step"} className={mode === "step-by-step" ? "mode-selected" : ""} onClick={() => setMode("step-by-step")} type="button"><BookOpen size={15} /><span><b>Step by step</b><small>Show how to work it out</small></span><span className="mode-radio" /></button>
            <button aria-pressed={mode === "simple"} className={mode === "simple" ? "mode-selected" : ""} onClick={() => setMode("simple")} type="button"><Lightbulb size={15} /><span><b>Keep it simple</b><small>Start with the big idea</small></span><span className="mode-radio" /></button>
          </div>
          <div className="doubt-sidebar-heading subject-heading"><span>ASK ABOUT</span></div>
          <label className="doubt-subject-select"><span className="sr-only">Choose a subject</span><select onChange={(event) => setSubject(event.target.value)} value={subject}>{subjects.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15} /></label>
          <div className="local-ai-card">
            <span className={`local-ai-card-icon${status?.local.available ? " local-model-ready" : ""}`}>{status?.local.available ? <Check size={17} /> : <Lightbulb size={17} />}</span>
            <div><b>{status?.local.available ? "Local model is ready" : "Local model not connected"}</b><span>{status?.local.available ? `${status.local.runtime} · ${status.local.model}` : `Ollama on the EduSphere host · ${status?.local.model ?? "checking model"}`}</span><small>Local answers stay on the EduSphere host.</small></div>
          </div>
          <div className="doubt-sidebar-bottom">
            <span className="doubt-safe-note"><ShieldCheck size={14} /> Avoid sharing personal information.</span>
            <Link to="/resources"><BookOpen size={15} /> Browse learning resources <ArrowRight size={14} /></Link>
            <Link to="/profile"><GraduationCap size={15} /> {student.name}</Link>
            <button onClick={signOut} type="button"><LogOutIcon /> Sign out</button>
          </div>
        </aside>

        <section aria-label="AI doubt solver chat" className="doubt-chat">
          <div className="doubt-chat-heading"><div><div className="section-eyebrow">A SAFE PLACE TO ASK</div><h1>What are you wondering about?</h1><p>Ask a question, explore the steps, and learn at your pace.</p></div><span className="chat-demo-label"><Sparkles size={13} /> AI answers are clearly labelled</span></div>
          {loadError && <div className="chat-inline-alert" role="alert">{loadError}</div>}
          {storageError && <div className="chat-inline-alert storage-inline-alert" role="alert">Your message was not sent because local chat storage is unavailable. Try another browser or check its storage settings.</div>}
          {pendingNetworkNotice && pendingCount > 0 && <div className="network-return-notice"><Wifi size={15} /><span>Connection restored. Your pending questions are still private until you choose to send them.</span><button onClick={() => startOnlineConsent(pendingMessages)} type="button">Review <ArrowRight size={13} /></button></div>}
          <div aria-live="polite" aria-relevant="additions text" className={`doubt-messages${messages.length === 0 ? " doubt-messages-empty" : ""}`}>
            {loadError && messages.length === 0 ? <div className="chat-storage-error"><CircleHelp size={25} /><b>Saved chat couldn’t be opened</b><span>{loadError}</span><button className="button button-outline" onClick={() => window.location.reload()} type="button">Try again</button></div> : null}
            {suggested && !loadError && <div className="chat-welcome">
              <span className="chat-welcome-icon"><MessageCircle size={24} /></span>
              <h2>Every good question is a good place to start.</h2>
              <p>Choose an example or type what you’re curious about. AI answers are only shown when a configured model actually responds.</p>
              <div className="suggested-questions"><span>TRY ASKING</span>{suggestedQuestions.map((item) => <button key={item.question} onClick={() => { setSubject(item.subject); setMessageText(item.question); }} type="button"><span>{item.subject}</span><span>{item.question}</span><ArrowRight size={15} /></button>)}</div>
            </div>}
            {messages.map((message) => <MessageBubble
              busy={sending}
              canAskLocal={canAskLocal}
              canAskOnline={canAskOnline && isOnline}
              key={message.id}
              message={message}
              onAskOnline={(selected) => startOnlineConsent([selected])}
              onRetryLocal={(selected) => { setSending(true); void askLocal(selected).finally(() => setSending(false)); }}
              studentName={student.name}
            />)}
            {sending && activeQuestion.current && <div className="chat-working-indicator"><LoaderCircle size={15} /> Waiting for the configured AI service…</div>}
            <div ref={messagesEnd} />
          </div>
          <div className="doubt-composer-area">
            <form className="doubt-composer" onSubmit={submitQuestion}>
              <textarea aria-label="Ask a learning question" disabled={Boolean(storageError)} maxLength={2000} onChange={(event) => setMessageText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={storageError ? "Local chat storage is unavailable" : "Ask a question about something you’re learning…"} rows={2} value={messageText} />
              <div className="composer-bottom"><span><ShieldCheck size={13} /> Saved in this browser before contacting AI · Enter to send</span><span className="composer-actions"><small>{messageText.length}/2000</small><button aria-label="Send question" className="send-question-button" disabled={!canSend} type="submit">{sending ? <LoaderCircle size={17} /> : <Send size={17} />}</button></span></div>
            </form>
            <p className="doubt-disclaimer">AI can make mistakes. Please check important information with your teacher or a trusted source.</p>
          </div>
        </section>
      </div>
      {consentOpen && <ConsentDialog onCancel={() => { setConsentOpen(false); setConsentQuestions([]); }} onConfirm={confirmOnlineConsent} questions={consentQuestions} sending={sending} />}
    </main>
  );
}

function LogOutIcon() {
  return <ArrowLeft size={15} />;
}
