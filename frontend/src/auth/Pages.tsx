import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, authApi, learningInterestLabels, type FieldErrors } from "./api";
import { useStudentAuth } from "./AuthContext";
import { clearQueuedProfileUpdates, queueProfileUpdate } from "../sync/syncStorage";

type AuthRouteState = { from?: { pathname?: string }; message?: string };

function AuthenticationLayout({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="account-page">
      <header className="account-header">
        <Link aria-label="Back to EduSphere home" className="brand" to="/">
          <span className="brand-mark"><GraduationCap size={21} strokeWidth={2.2} /></span>
          <span>edu<span>sphere</span></span>
        </Link>
        <Link className="account-home-link" to="/"><ArrowLeft size={15} /> Back to home</Link>
      </header>
      <div className="account-layout">
        <section className="account-form-column">
          <div className="account-card">
            <div className="account-card-badge"><LockKeyhole size={15} /> YOUR LEARNING SPACE</div>
            <div className="section-eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            <p className="account-intro">{description}</p>
            {children}
            <div className="account-security-note"><ShieldCheck size={15} /> Your password is protected and never saved in your browser.</div>
          </div>
        </section>
        <aside className="account-story">
          <span className="story-glow" />
          <div className="story-decoration story-decoration-one"><BookOpen size={22} /></div>
          <div className="story-decoration story-decoration-two"><Sparkles size={20} /></div>
          <span className="story-quote-mark">“</span>
          <blockquote>Every learner deserves a place to begin, a reason to keep going, and room to grow.</blockquote>
          <div className="story-credit"><span className="story-credit-icon"><GraduationCap size={19} /></span><span><b>Learning without limits</b><small>One step at a time.</small></span></div>
          <span className="story-circles" aria-hidden="true"><i /><i /><i /><i /></span>
        </aside>
      </div>
      <footer className="account-footer"><span>EduSphere · A student learning project</span><span>Learn at your own pace <span>✳</span></span></footer>
    </main>
  );
}

function FormAlert({ message, success = false }: { message: string; success?: boolean }) {
  return <div className={`form-alert${success ? " form-alert-success" : ""}`} role={success ? "status" : "alert"}>{success && <Check size={15} />}{message}</div>;
}

function PasswordField({
  label,
  name = "password",
  value,
  onChange,
  error,
  autoComplete = "new-password",
}: {
  label: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="form-field">
      <span>{label}</span>
      <span className={`input-shell${error ? " input-error" : ""}`}>
        <LockKeyhole size={17} />
        <input
          autoComplete={autoComplete}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          className="password-visibility"
          onClick={() => setVisible((shown) => !shown)}
          type="button"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as AuthRouteState | null;
  const { login } = useStudentAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      navigate(routeState?.from?.pathname ?? "/dashboard", { replace: true });
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setError(requestError.message);
        setFieldErrors(requestError.fieldErrors);
      } else {
        setError("Sign in could not be completed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticationLayout eyebrow="WELCOME BACK" title="Good to see you." description="Sign in to pick up where you left off.">
      {routeState?.message && <FormAlert message={routeState.message} success />}
      {error && <FormAlert message={error} />}
      <form className="account-form" onSubmit={submit}>
        <label className="form-field">
          <span>Email address</span>
          <span className={`input-shell${fieldErrors.email ? " input-error" : ""}`}><Mail size={17} /><input autoComplete="email" autoCapitalize="none" name="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></span>
          {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
        </label>
        <PasswordField autoComplete="current-password" error={fieldErrors.password} label="Password" onChange={setPassword} value={password} />
        <div className="form-between"><span>Welcome back to your learning journey.</span><Link to="/forgot-password">Forgot password?</Link></div>
        <button className="button button-primary account-submit" disabled={submitting} type="submit">{submitting ? "Signing you in…" : "Sign in"} <ArrowRight size={16} /></button>
      </form>
      <p className="account-switch">New to EduSphere? <Link to="/register">Create your account</Link></p>
    </AuthenticationLayout>
  );
}

export function RegistrationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as AuthRouteState | null;
  const { register } = useStudentAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: "Your passwords do not match." });
      return;
    }
    setSubmitting(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
      navigate(routeState?.from?.pathname ?? "/dashboard", { replace: true });
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setError(requestError.message);
        setFieldErrors(requestError.fieldErrors);
      } else {
        setError("Your account could not be created. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticationLayout eyebrow="A FRESH START" title="Make room to grow." description="Create your free student account and make this learning space yours.">
      {error && <FormAlert message={error} />}
      <form className="account-form" onSubmit={submit}>
        <label className="form-field">
          <span>Student name</span>
          <span className={`input-shell${fieldErrors.name ? " input-error" : ""}`}><span className="input-initial">Aa</span><input autoComplete="name" name="name" onChange={(event) => setName(event.target.value)} required type="text" value={name} /></span>
          {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
        </label>
        <label className="form-field">
          <span>Email address</span>
          <span className={`input-shell${fieldErrors.email ? " input-error" : ""}`}><Mail size={17} /><input autoComplete="email" autoCapitalize="none" name="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></span>
          {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
        </label>
        <PasswordField error={fieldErrors.password} label="Password" onChange={setPassword} value={password} />
        <PasswordField error={fieldErrors.confirmPassword} label="Confirm password" name="confirmPassword" onChange={setConfirmPassword} value={confirmPassword} />
        <p className="password-hint">Use at least 8 characters. Your password is securely hashed on the server.</p>
        <button className="button button-primary account-submit" disabled={submitting} type="submit">{submitting ? "Creating your account…" : "Create account"} <ArrowRight size={16} /></button>
      </form>
      <p className="account-switch">Already have an account? <Link to="/login">Sign in</Link></p>
    </AuthenticationLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);
    try {
      const result = await authApi.forgotPassword(email.trim());
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The reset request could not be sent.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticationLayout eyebrow="ACCOUNT RECOVERY" title="A fresh password." description="Enter the email address on your account. We’ll send you a secure link to reset your password.">
      {error && <FormAlert message={error} />}
      {message && <FormAlert message={message} success />}
      <form className="account-form" onSubmit={submit}>
        <label className="form-field">
          <span>Email address</span>
          <span className="input-shell"><Mail size={17} /><input autoComplete="email" autoCapitalize="none" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></span>
        </label>
        <button className="button button-primary account-submit" disabled={submitting} type="submit">{submitting ? "Sending request…" : "Send reset link"} <ArrowRight size={16} /></button>
      </form>
      <p className="account-switch"><Link to="/login">Back to sign in</Link></p>
      <p className="reset-setup-note">Password reset requires an administrator-configured email service. No reset link is shown in this browser.</p>
    </AuthenticationLayout>
  );
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!token) {
      setError("This reset link is missing its token. Request a new reset email.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await authApi.resetPassword(token, password);
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The password could not be updated.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticationLayout eyebrow="SECURE PASSWORD RESET" title="Choose a new password." description="Reset links are one-time use and expire after 30 minutes.">
      {error && <FormAlert message={error} />}
      {message && <FormAlert message={message} success />}
      {message ? (
        <button className="button button-primary account-submit" onClick={() => navigate("/login", { replace: true, state: { message } })} type="button">Continue to sign in <ArrowRight size={16} /></button>
      ) : (
        <form className="account-form" onSubmit={submit}>
          <PasswordField label="New password" onChange={setPassword} value={password} />
          <PasswordField label="Confirm new password" name="confirmPassword" onChange={setConfirmPassword} value={confirmPassword} />
          <button className="button button-primary account-submit" disabled={submitting} type="submit">{submitting ? "Updating password…" : "Update password"} <ArrowRight size={16} /></button>
        </form>
      )}
      <p className="account-switch"><Link to="/login">Back to sign in</Link></p>
    </AuthenticationLayout>
  );
}

export function StudentProfilePage() {
  const { student, updateStudent, logout } = useStudentAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(student?.name ?? "");
  const [college, setCollege] = useState(student?.college ?? "");
  const [course, setCourse] = useState(student?.course ?? "");
  const [branch, setBranch] = useState(student?.branch ?? "");
  const [yearOfStudy, setYearOfStudy] = useState(student?.yearOfStudy ?? "");
  const [interests, setInterests] = useState<string[]>(student?.interests ?? []);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  function applyUpdatedStudent(updated: NonNullable<typeof student>) {
    updateStudent(updated);
    setName(updated.name);
    setCollege(updated.college);
    setCourse(updated.course);
    setBranch(updated.branch);
    setYearOfStudy(updated.yearOfStudy);
    setInterests(updated.interests);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setFieldErrors({});
    setSaving(true);
    try {
      const profile = { name: name.trim(), college: college.trim(), course: course.trim(), branch: branch.trim(), yearOfStudy, interests };
      try {
        const result = await authApi.updateProfile(profile);
        applyUpdatedStudent(result.student);
        if (student) await clearQueuedProfileUpdates(student.id);
        setNotice("Your profile has been saved by the EduSphere server.");
      } catch (requestError) {
        if (!(requestError instanceof ApiError && requestError.status === 0) || !student) throw requestError;
        const occurredAt = new Date().toISOString();
        await queueProfileUpdate(student.id, profile, student.updatedAt ?? student.createdAt);
        const updatedStudent = { ...student, ...profile, updatedAt: occurredAt };
        await applyUpdatedStudent(updatedStudent);
        setNotice("Profile saved on this device. It will sync after reconnecting to EduSphere.");
      }
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setError(requestError.message);
        setFieldErrors(requestError.fieldErrors);
      } else {
        setError("Your profile could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setAvatarError("");
    setNotice("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setAvatarError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Choose an image smaller than 2 MB.");
      return;
    }

    setAvatarSaving(true);
    try {
      const result = await authApi.uploadAvatar(file);
      updateStudent(result.student);
      setNotice("Your profile picture has been updated.");
    } catch (requestError) {
      setAvatarError(requestError instanceof Error ? requestError.message : "The profile picture could not be saved.");
    } finally {
      setAvatarSaving(false);
    }
  }

  async function removeAvatar() {
    setAvatarSaving(true);
    setAvatarError("");
    try {
      const result = await authApi.deleteAvatar();
      updateStudent(result.student);
      setNotice("Your profile picture has been removed.");
    } catch (requestError) {
      setAvatarError(requestError instanceof Error ? requestError.message : "The profile picture could not be removed.");
    } finally {
      setAvatarSaving(false);
    }
  }

  async function signOut() {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "You could not be signed out.");
    }
  }

  if (!student) return null;

  return (
    <main className="profile-page">
      <header className="profile-header">
        <Link aria-label="EduSphere home" className="brand" to="/"><span className="brand-mark"><GraduationCap size={21} /></span><span>edu<span>sphere</span></span></Link>
        <nav className="profile-header-actions"><Link className="profile-dashboard-link" to="/dashboard"><ArrowLeft size={15} /> Dashboard</Link><button className="button button-dark profile-logout" onClick={signOut}>Sign out</button></nav>
      </header>
      <div className="profile-content">
        <div className="profile-title"><div className="section-eyebrow">YOUR ACCOUNT</div><h1>Your profile</h1><p>A little about you helps make this learning space feel like yours.</p></div>
        {error && <FormAlert message={error} />}
        {notice && <FormAlert message={notice} success />}
        <section className="profile-card profile-photo-card">
          <div><div className="section-eyebrow">A FRIENDLY FACE</div><h2>Profile picture</h2><p>Choose an image under 2 MB. It is resized and stored with your account.</p></div>
          <div className="avatar-editor">
            <span className="profile-photo-preview">{student.avatarUrl ? <img src={student.avatarUrl} alt="Your profile" /> : <span>{student.name.charAt(0).toUpperCase()}</span>}</span>
            <div className="avatar-actions"><label className="button button-outline avatar-upload-button"><Camera size={15} /> {avatarSaving ? "Saving…" : "Upload picture"}<input accept="image/png,image/jpeg,image/webp" disabled={avatarSaving} onChange={uploadAvatar} type="file" /></label>{student.avatarUrl && <button className="avatar-remove" disabled={avatarSaving} onClick={removeAvatar} type="button">Remove</button>}<small>PNG, JPG, or WebP · Max 2 MB</small></div>
          </div>
          {avatarError && <div className="avatar-error" role="alert">{avatarError}</div>}
        </section>
        <form className="profile-card profile-form" onSubmit={saveProfile}>
          <div className="profile-card-heading"><div><div className="section-eyebrow">PERSONAL DETAILS</div><h2>About you</h2></div><span className="profile-lock"><LockKeyhole size={15} /> Private to your account</span></div>
          <div className="profile-fields">
            <label className="form-field"><span>Student name</span><input className={`text-input${fieldErrors.name ? " input-error" : ""}`} autoComplete="name" maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} />{fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}</label>
            <label className="form-field"><span>Email address</span><input className="text-input input-readonly" readOnly type="email" value={student.email} /><small className="readonly-hint">Email changes are not available in this phase.</small></label>
          </div>
          <div className="profile-card-heading education-heading"><div><div className="section-eyebrow">YOUR LEARNING CONTEXT</div><h2>Education</h2></div></div>
          <div className="profile-fields profile-fields-two">
            <label className="form-field"><span>College or school <small>(optional)</small></span><input className={`text-input${fieldErrors.college ? " input-error" : ""}`} maxLength={120} onChange={(event) => setCollege(event.target.value)} value={college} /></label>
            <label className="form-field"><span>Course <small>(optional)</small></span><input className={`text-input${fieldErrors.course ? " input-error" : ""}`} maxLength={120} onChange={(event) => setCourse(event.target.value)} value={course} /></label>
            <label className="form-field"><span>Branch or subject <small>(optional)</small></span><input className={`text-input${fieldErrors.branch ? " input-error" : ""}`} maxLength={120} onChange={(event) => setBranch(event.target.value)} value={branch} /></label>
            <label className="form-field"><span>Year of study</span><select className={`text-input${fieldErrors.yearOfStudy ? " input-error" : ""}`} onChange={(event) => setYearOfStudy(event.target.value)} value={yearOfStudy}><option value="">Select a year</option>{["1", "2", "3", "4", "5", "6", "7", "8"].map((year) => <option key={year} value={year}>Year {year}</option>)}<option value="other">Other</option></select></label>
          </div>
          <div className="profile-card-heading interests-heading"><div><div className="section-eyebrow">FOLLOW YOUR CURIOSITY</div><h2>Learning interests</h2></div></div>
          <p className="interest-help">Choose the topics you’re most interested in exploring.</p>
          <div className="interest-options">{learningInterestLabels.map(({ value, label }) => <label className={`interest-option${interests.includes(value) ? " interest-selected" : ""}`} key={value}><input checked={interests.includes(value)} onChange={(event) => setInterests((current) => event.target.checked ? [...current, value] : current.filter((interest) => interest !== value))} type="checkbox" /><span>{label}</span><Check size={14} /></label>)}</div>
          {fieldErrors.interests && <small className="field-error">{fieldErrors.interests}</small>}
          <div className="profile-save-row"><span>Your learning progress is stored separately from your profile.</span><button className="button button-primary" disabled={saving} type="submit">{saving ? "Saving profile…" : "Save changes"} <Check size={16} /></button></div>
        </form>
        <section className="profile-card profile-progress-card"><div><div className="section-eyebrow">YOUR LEARNING JOURNEY</div><h2>Progress at a glance</h2><p>This is sample learning progress from your demo dashboard, not saved assessment data.</p></div><div className="profile-progress-meter"><strong>68<span>%</span></strong><div><span style={{ width: "68%" }} /></div><small>Demo data · Learning progress</small></div></section>
      </div>
      <footer className="account-footer profile-footer"><span>EduSphere · A student learning project</span><span>Learn at your own pace <span>✳</span></span></footer>
    </main>
  );
}
