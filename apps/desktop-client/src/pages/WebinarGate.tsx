import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  resolveSlug,
  joinBySlug,
  registerBySlug,
  SlugResolveResponse,
} from '../lib/api';
import { saveClassroomSession, getLiveKitUrl, getSignalServerUrl } from '../lib/classroom-session';
import {
  Clock,
  Users,
  CheckCircle,
  XCircle,
  ArrowRight,
  Calendar,
  Loader2,
  AlertCircle,
  Mail,
  User,
  RefreshCw,
} from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BLOCKED_DOMAINS = ['attendee.local', 'localhost', 'example.com', 'test.com'];

function isValidEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return 'Please enter a valid email address.';
  const domain = normalized.split('@')[1];
  if (BLOCKED_DOMAINS.includes(domain)) return 'Placeholder email domains are not allowed. Please use your real email address.';
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function computeCountdown(target: string): Countdown {
  const total = Math.max(0, new Date(target).getTime() - Date.now());
  return {
    days: Math.floor(total / 86_400_000),
    hours: Math.floor((total % 86_400_000) / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    seconds: Math.floor((total % 60_000) / 1000),
    total,
  };
}

function getRegistration(slug: string): { name: string; email: string; verified?: boolean } | null {
  try {
    const raw = localStorage.getItem(`webinar_registered_${slug}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveRegistration(slug: string, name: string, email: string, verified = false) {
  localStorage.setItem(`webinar_registered_${slug}`, JSON.stringify({ name, email, verified }));
}

// ─── Shared Styles ───────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    position: 'relative' as const,
  },
  card: {
    maxWidth: '520px',
    width: '100%',
    position: 'relative' as const,
    zIndex: 1,
  },
  glass: {
    background: 'rgba(20, 20, 30, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  input: {
    width: '100%',
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#e8eaf0',
    padding: '12px 16px',
    borderRadius: '8px',
    fontFamily: "'Inter', sans-serif",
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.18s, box-shadow 0.18s',
  },
  inputFocus: {
    borderColor: '#2563eb',
    boxShadow: '0 0 0 3px rgba(37,99,235,0.18)',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600 as const,
    color: '#7c8799',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  btnPrimary: {
    width: '100%',
    padding: '14px 24px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #a855f7, #6366f1)',
    color: '#fff',
    fontWeight: 600 as const,
    fontSize: '15px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.2s ease',
    fontFamily: "'Inter', sans-serif",
  },
  btnSecondary: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'transparent',
    color: '#e8eaf0',
    fontWeight: 600 as const,
    fontSize: '14px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.18s ease',
    fontFamily: "'Inter', sans-serif",
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 14px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600 as const,
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    color: '#7c8799',
  },
  errorBox: {
    padding: '12px 16px',
    borderRadius: '10px',
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#ef4444',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function CountdownDisplay({ targetDate }: { targetDate: string }) {
  const [cd, setCd] = useState<Countdown>(computeCountdown(targetDate));

  useEffect(() => {
    const timer = setInterval(() => setCd(computeCountdown(targetDate)), 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  if (cd.total <= 0) {
    return (
      <div style={{ textAlign: 'center', color: '#22c55e', fontSize: '14px', fontWeight: 600 }}>
        Starting any moment now…
      </div>
    );
  }

  const units = [
    { label: 'Days', value: cd.days },
    { label: 'Hours', value: cd.hours },
    { label: 'Min', value: cd.minutes },
    { label: 'Sec', value: cd.seconds },
  ];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
      {units.map((u) => (
        <div
          key={u.label}
          style={{
            textAlign: 'center',
            minWidth: '60px',
            padding: '12px 8px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: '#e8eaf0',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {String(u.value).padStart(2, '0')}
          </div>
          <div style={{ fontSize: '10px', color: '#7c8799', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>
            {u.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionInfo({ session }: { session: SlugResolveResponse }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div
        style={{
          ...styles.badge,
          background: 'rgba(37,99,235,0.1)',
          color: '#3b82f6',
          marginBottom: '16px',
        }}
      >
        <Calendar size={13} /> Whitebox Learning Webinar
      </div>
      <h1 style={{ fontSize: '26px', fontWeight: 700, lineHeight: 1.25, marginBottom: '10px', color: '#e8eaf0' }}>
        {session.title}
      </h1>
      {session.description && (
        <p style={{ fontSize: '14px', color: '#7c8799', lineHeight: 1.6, marginBottom: '16px' }}>
          {session.description}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={styles.infoRow}>
          <Calendar size={15} color="#2563eb" />
          <span>
            {new Date(session.scheduledAt).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
        </div>
        <div style={styles.infoRow}>
          <Clock size={15} color="#2563eb" />
          <span>
            {new Date(session.scheduledAt).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        </div>
        <div style={styles.infoRow}>
          <User size={15} color="#2563eb" />
          <span>Hosted by {session.instructorName}</span>
        </div>
        <div style={styles.infoRow}>
          <Users size={15} color="#2563eb" />
          <span>Up to {session.maxAttendees} attendees</span>
        </div>
      </div>
    </div>
  );
}

function FocusInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{
        ...styles.input,
        ...(focused ? styles.inputFocus : {}),
        ...(props.style || {}),
      }}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

// ─── Status Views ────────────────────────────────────────────────────────────

function ScheduledView({
  session,
  slug,
}: {
  session: SlugResolveResponse;
  slug: string;
}) {
  const reg = getRegistration(slug);
  const [isRegistered, setIsRegistered] = useState(!!reg);
  const [isVerified, setIsVerified] = useState(!!reg?.verified);
  const [name, setName] = useState(reg?.name || '');
  const [email, setEmail] = useState(reg?.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimName = name.trim();
    const trimEmail = email.trim().toLowerCase();
    if (!trimName) return;

    const emailErr = isValidEmail(trimEmail);
    if (emailErr) {
      setEmailError(emailErr);
      return;
    }

    setSubmitting(true);
    setError(null);
    setEmailError(null);
    try {
      const res = await registerBySlug(slug, trimName, trimEmail);
      saveRegistration(slug, trimName, trimEmail, res.verified);
      setIsRegistered(true);
      setIsVerified(res.verified);
    } catch (err: any) {
      const msg = err.message || 'Registration failed';
      if (msg.toLowerCase().includes('email')) setEmailError(msg);
      else setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const targetDate = session.scheduledStartAt || session.scheduledAt;

  return (
    <div style={styles.glass} className="fade-in">
      <SessionInfo session={session} />

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '24px 0' }} />

      {/* Countdown */}
      <div style={{ marginBottom: '28px' }}>
        <p style={{ textAlign: 'center', fontSize: '13px', color: '#7c8799', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Starts in
        </p>
        <CountdownDisplay targetDate={targetDate} />
      </div>

      {/* Registration or Registered message */}
      {isRegistered ? (
        !isVerified ? (
          <div
            style={{
              textAlign: 'center',
              padding: '24px',
              background: 'rgba(245,158,11,0.06)',
              borderRadius: '12px',
              border: '1px solid rgba(245,158,11,0.15)',
            }}
          >
            <Mail size={36} color="#f59e0b" style={{ marginBottom: '12px', animation: 'pulse 2s infinite' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px', color: '#e8eaf0' }}>
              Verification Required
            </h3>
            <p style={{ fontSize: '14px', color: '#7c8799', lineHeight: 1.5 }}>
              Please check your inbox at <strong style={{ color: '#e8eaf0' }}>{email}</strong> and click the link we sent to verify your email.
            </p>
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '24px',
              background: 'rgba(34,197,94,0.06)',
              borderRadius: '12px',
              border: '1px solid rgba(34,197,94,0.15)',
            }}
          >
            <CheckCircle size={36} color="#22c55e" style={{ marginBottom: '12px' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px', color: '#e8eaf0' }}>
              You're Registered!
            </h3>
            <p style={{ fontSize: '14px', color: '#7c8799' }}>
              Welcome back, <strong style={{ color: '#e8eaf0' }}>{name}</strong>. We'll notify you when the session goes live.
            </p>
          </div>
        )
      ) : (
        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={styles.label}>
              <User size={12} /> Full Name
            </label>
            <FocusInput
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <div>
            <label style={styles.label}>
              <Mail size={12} /> Email Address
            </label>
            <FocusInput
              type="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
              required
              disabled={submitting}
            />
            {emailError && (
              <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={12} /> {emailError}
              </p>
            )}
          </div>

          {error && <div style={styles.errorBox}><AlertCircle size={14} /> {error}</div>}
          <button
            type="submit"
            disabled={submitting || !name.trim() || !email.trim()}
            style={{
              ...styles.btnPrimary,
              opacity: submitting || !name.trim() || !email.trim() ? 0.5 : 1,
              cursor: submitting ? 'wait' : 'pointer',
            }}
          >
            {submitting ? (
              <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Registering…</>
            ) : (
              <>Register for Webinar <ArrowRight size={16} /></>
            )}
          </button>
        </form>
      )}
    </div>
  );
}

function LiveView({
  session,
  slug,
}: {
  session: SlugResolveResponse;
  slug: string;
}) {
  const navigate = useNavigate();
  const reg = getRegistration(slug);
  const [isRegistered, setIsRegistered] = useState(!!reg);
  const [isVerified, setIsVerified] = useState(!!reg?.verified);
  const [name, setName] = useState(reg?.name || '');
  const [email, setEmail] = useState(reg?.email || '');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleJoin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimName = name.trim();
    const trimEmail = email.trim().toLowerCase();
    if (!trimName) return;

    if (!isRegistered) {
      const emailErr = isValidEmail(trimEmail);
      if (emailErr) {
        setEmailError(emailErr);
        return;
      }
    }

    setJoining(true);
    setError(null);
    setEmailError(null);
    try {
      // First ensure they are registered on the backend
      if (!isRegistered) {
        const res = await registerBySlug(slug, trimName, trimEmail);
        saveRegistration(slug, trimName, trimEmail, res.verified);
        setIsRegistered(true);
        setIsVerified(res.verified);
        if (!res.verified) {
          setJoining(false);
          return;
        }
      }

      const activeEmail = reg?.email || trimEmail;
      const data = await joinBySlug(slug, trimName, activeEmail);
      const roomId = data.roomId || data.roomName;
      if (!roomId) throw new Error('No room ID returned');

      // Update registration storage to reflect verified state
      saveRegistration(slug, trimName, activeEmail, true);

      // Save classroom session data
      const classroomData = {
        participantName: trimName,
        isHost: false,
        sessionId: session.sessionId,
        liveKitToken: data.livekitToken!,
        signalToken: data.signalToken,
        livekitUrl: getLiveKitUrl(),
      };
      saveClassroomSession(roomId, classroomData);

      // Also backup to sessionStorage
      sessionStorage.setItem('webinar_join_data', JSON.stringify({
        roomId,
        sessionId: session.sessionId,
        sessionTitle: session.title,
        participantName: trimName,
      }));

      navigate(`/class/${roomId}`, { state: classroomData });
    } catch (err: any) {
      const msg = err.message || 'Failed to join session';
      if (msg.includes('EMAIL_VERIFICATION_REQUIRED')) {
        setIsVerified(false);
        // Sync local state to require verification next time
        if (isRegistered) {
          saveRegistration(slug, name, reg?.email || email, false);
        }
      } else {
        setError(msg);
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div style={styles.glass} className="fade-in">
      {/* LIVE badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <div
          style={{
            ...styles.badge,
            background: 'rgba(34,197,94,0.12)',
            color: '#22c55e',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#22c55e',
              animation: 'pulse 1.5s ease-in-out infinite',
              display: 'inline-block',
            }}
          />
          LIVE NOW
        </div>
      </div>

      <h1 style={{ fontSize: '26px', fontWeight: 700, lineHeight: 1.25, marginBottom: '8px', color: '#e8eaf0' }}>
        {session.title}
      </h1>
      <p style={{ fontSize: '14px', color: '#7c8799', marginBottom: '8px' }}>
        Hosted by {session.instructorName}
      </p>
      {session.description && (
        <p style={{ fontSize: '13px', color: '#7c8799', lineHeight: 1.6, marginBottom: '20px' }}>
          {session.description}
        </p>
      )}

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '20px 0' }} />

      {isRegistered && !isVerified ? (
        <div
          style={{
            textAlign: 'center',
            padding: '24px',
            background: 'rgba(245,158,11,0.06)',
            borderRadius: '12px',
            border: '1px solid rgba(245,158,11,0.15)',
          }}
        >
          <Mail size={36} color="#f59e0b" style={{ marginBottom: '12px', animation: 'pulse 2s infinite' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px', color: '#e8eaf0' }}>
            Email Verification Required
          </h3>
          <p style={{ fontSize: '14px', color: '#7c8799', lineHeight: 1.5 }}>
            Please check your inbox at <strong style={{ color: '#e8eaf0' }}>{reg?.email || email}</strong> and click the verification link before joining the live stream.
          </p>
        </div>
      ) : isRegistered ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '16px 20px',
              background: 'rgba(37,99,235,0.06)',
              borderRadius: '10px',
              border: '1px solid rgba(37,99,235,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <CheckCircle size={20} color="#2563eb" />
            <span style={{ fontSize: '14px', color: '#e8eaf0' }}>
              Welcome back, <strong>{name}</strong>!
            </span>
          </div>
          {error && <div style={styles.errorBox}><AlertCircle size={14} /> {error}</div>}
          <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              ...styles.btnPrimary,
              opacity: joining ? 0.6 : 1,
              cursor: joining ? 'wait' : 'pointer',
            }}
          >
            {joining ? (
              <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Joining…</>
            ) : (
              <>Join Now <ArrowRight size={16} /></>
            )}
          </button>
        </div>
      ) : (
        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={styles.label}>
              <User size={12} /> Your Name
            </label>
            <FocusInput
              type="text"
              placeholder="Enter your display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={joining}
              autoFocus
            />
          </div>

          <div>
            <label style={styles.label}>
              <Mail size={12} /> Email Address
            </label>
            <FocusInput
              type="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
              required
              disabled={joining}
            />
            {emailError && (
              <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={12} /> {emailError}
              </p>
            )}
          </div>

          {error && <div style={styles.errorBox}><AlertCircle size={14} /> {error}</div>}
          <button
            type="submit"
            disabled={joining || !name.trim() || !email.trim()}
            style={{
              ...styles.btnPrimary,
              opacity: joining || !name.trim() || !email.trim() ? 0.5 : 1,
              cursor: joining ? 'wait' : 'pointer',
            }}
          >
            {joining ? (
              <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Joining…</>
            ) : (
              <>Join Now <ArrowRight size={16} /></>
            )}
          </button>
        </form>
      )}
    </div>
  );
}

function EndedView({ session }: { session: SlugResolveResponse }) {
  return (
    <div style={styles.glass} className="fade-in">
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <Clock size={28} color="#7c8799" />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '10px', color: '#e8eaf0' }}>
          This Webinar Has Ended
        </h2>
        <p style={{ fontSize: '14px', color: '#7c8799', marginBottom: '6px' }}>
          {session.title}
        </p>
        <p style={{ fontSize: '13px', color: '#7c8799' }}>
          {new Date(session.scheduledAt).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>
    </div>
  );
}

function CancelledView({ session }: { session: SlugResolveResponse }) {
  return (
    <div style={styles.glass} className="fade-in">
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <XCircle size={28} color="#ef4444" />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '10px', color: '#e8eaf0' }}>
          Webinar Cancelled
        </h2>
        <p style={{ fontSize: '14px', color: '#7c8799', marginBottom: '6px' }}>
          {session.title}
        </p>
        <p style={{ fontSize: '13px', color: '#7c8799' }}>
          This webinar has been cancelled by the organizer.
        </p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={styles.glass}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px 0' }}>
        <Loader2 size={36} color="#2563eb" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: '14px', color: '#7c8799' }}>Loading webinar…</p>
      </div>
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={styles.glass} className="fade-in">
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <AlertCircle size={28} color="#ef4444" />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '10px', color: '#e8eaf0' }}>
          Something Went Wrong
        </h2>
        <p style={{ fontSize: '14px', color: '#7c8799', marginBottom: '24px' }}>
          {message}
        </p>
        <button onClick={onRetry} style={styles.btnSecondary}>
          <RefreshCw size={15} /> Try Again
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WebinarGate() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SlugResolveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadSession = useCallback(async () => {
    if (!slug) {
      navigate('/');
      return;
    }
    try {
      setError(null);
      const data = await resolveSlug(slug);
      setSession(data);
    } catch (err: any) {
      setError(err.message || 'Webinar not found');
    } finally {
      setLoading(false);
    }
  }, [slug, navigate]);

  // Initial load
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // WebSocket for live status updates
  useEffect(() => {
    if (!session?.sessionId) return;

    let ws: WebSocket | null = null;
    try {
      const signalUrl = getSignalServerUrl();
      ws = new WebSocket(signalUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'session-started' && msg.sessionId === session.sessionId) {
            setSession((prev) => prev ? { ...prev, status: 'live' } : prev);
          } else if (msg.type === 'session-ended' && msg.sessionId === session.sessionId) {
            setSession((prev) => prev ? { ...prev, status: 'ended' } : prev);
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onerror = () => {
        // Fallback to polling if WebSocket fails
        ws?.close();
      };
    } catch {
      // WebSocket not available, rely on polling
    }

    return () => {
      ws?.close();
      wsRef.current = null;
    };
  }, [session?.sessionId]);

  // Polling fallback: refresh session status every 10 seconds when scheduled
  useEffect(() => {
    if (!slug || !session) return;
    if (session.status !== 'scheduled') return;

    const poll = window.setInterval(async () => {
      try {
        const data = await resolveSlug(slug);
        setSession(data);
      } catch { /* ignore polling errors */ }
    }, 10_000);
    pollRef.current = poll;

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [slug, session?.status]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    loadSession();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  let content: React.ReactNode;

  if (loading) {
    content = <LoadingSkeleton />;
  } else if (error) {
    content = <ErrorView message={error} onRetry={handleRetry} />;
  } else if (!session) {
    content = <ErrorView message="Webinar not found" onRetry={handleRetry} />;
  } else {
    switch (session.status) {
      case 'scheduled':
        content = <ScheduledView session={session} slug={slug!} />;
        break;
      case 'live':
        content = <LiveView session={session} slug={slug!} />;
        break;
      case 'ended':
        content = <EndedView session={session} />;
        break;
      case 'cancelled':
        content = <CancelledView session={session} />;
        break;
      default:
        content = <ErrorView message={`Unknown status: ${session.status}`} onRetry={handleRetry} />;
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>{content}</div>
    </div>
  );
}
