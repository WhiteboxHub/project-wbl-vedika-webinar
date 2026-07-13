import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestMagicLink, verifyMagicLink, storeAuth } from '../lib/api';
import { Mail, ArrowRight, KeyRound, Loader2, Video, CheckCircle2, ArrowLeft, RefreshCw } from 'lucide-react';

type Step = 'email' | 'verify' | 'success';

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  /* ─── Step 1: Request magic link ─────────────────────────────────────────── */
  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setDevHint(null);
    try {
      const { message, devToken } = await requestMagicLink(email.trim().toLowerCase());
      setDevHint(message);
      // Dev mode: auto-fill the token field so the user just clicks "Verify"
      if (devToken) {
        setToken(devToken);
      }
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Failed to send link. Try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ─── Step 2: Verify token ────────────────────────────────────────────────── */
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await verifyMagicLink(token.trim());
      storeAuth(data);
      setStep('success');
      setTimeout(() => navigate('/dashboard', { replace: true }), 300);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired token. Request a new link.');
    } finally {
      setLoading(false);
    }
  };

  /* ─── Resend ──────────────────────────────────────────────────────────────── */
  const handleResend = async () => {
    setResending(true);
    setError(null);
    setToken('');
    try {
      const { message, devToken } = await requestMagicLink(email.trim().toLowerCase());
      setDevHint(message);
      if (devToken) setToken(devToken);
    } catch (err: any) {
      setError(err.message || 'Failed to resend.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background orbs */}
      <div className="bg-orb" style={{ width: '420px', height: '420px', top: '-120px', left: '-120px' }} />
      <div className="bg-orb" style={{ width: '320px', height: '320px', bottom: '-90px', right: '-90px', animationDelay: '2s' }} />

      <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '20px',
            background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(124, 58, 237, 0.4)',
          }}>
            <Video size={30} color="white" />
          </div>
          <h1 style={{ fontSize: '26px', marginBottom: '6px' }}>Organizer Portal</h1>
          <p className="text-muted">
            {step === 'email' && 'Sign in with your email'}
            {step === 'verify' && 'Enter your verification code'}
            {step === 'success' && 'Signed in!'}
          </p>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
          {(['email', 'verify'] as Step[]).map((s, i) => (
            <div
              key={s}
              style={{
                width: step === s ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: (step === s || (step === 'success' && i === 1))
                  ? 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))'
                  : 'rgba(255,255,255,0.15)',
                transition: 'width 0.3s ease, background 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* ── Step: Email ── */}
        {step === 'email' && (
          <form onSubmit={handleRequestLink} className="flex-col gap-6">
            <div className="flex-col" style={{ gap: '8px' }}>
              <label
                htmlFor="email"
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Email address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  id="email"
                  type="email"
                  className="input-field"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  disabled={loading}
                  style={{ paddingLeft: '40px' }}
                />
              </div>
            </div>

            {error && <ErrorBox message={error} />}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !email.trim()}
              style={{ width: '100%', padding: '14px', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {loading
                ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Sending link…</>
                : <><span>Send magic link</span><ArrowRight size={18} /></>
              }
            </button>
          </form>
        )}

        {/* ── Step: Verify ── */}
        {step === 'verify' && (
          <form onSubmit={handleVerify} className="flex-col gap-6">
            {/* Dev hint */}
            {devHint && (
              <div style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(37,99,235,0.1)',
                border: '1px solid rgba(37,99,235,0.25)',
                fontSize: '13px',
                color: '#93c5fd',
                lineHeight: 1.5,
              }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>📬 Link sent</strong>
                {devHint}
                <br />
                <span style={{ color: 'var(--text-muted)' }}>In dev, copy the token from the API server logs.</span>
              </div>
            )}

            <div className="flex-col" style={{ gap: '8px' }}>
              <label
                htmlFor="token"
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Verification token
              </label>
              <div style={{ position: 'relative' }}>
                <KeyRound size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  id="token"
                  type="text"
                  className="input-field"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="Paste token from your email or server logs"
                  required
                  autoFocus
                  disabled={loading}
                  style={{ paddingLeft: '40px', fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Check your inbox at <strong style={{ color: 'var(--text-secondary)' }}>{email}</strong>
              </p>
            </div>

            {error && <ErrorBox message={error} />}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !token.trim()}
              style={{ width: '100%', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {loading
                ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Verifying…</>
                : <><KeyRound size={18} /><span>Verify &amp; Sign in</span></>
              }
            </button>

            {/* Resend / back row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => { setStep('email'); setError(null); setToken(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
              >
                {resending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
                Resend link
              </button>
            </div>
          </form>
        )}

        {/* ── Step: Success ── */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#10b981' }}>Signed in successfully!</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>Redirecting to dashboard…</p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: '10px',
      background: 'rgba(239, 68, 68, 0.12)',
      border: '1px solid rgba(239, 68, 68, 0.35)',
      color: 'var(--error-color)',
      fontSize: '13px',
      lineHeight: 1.5,
    }}>
      {message}
    </div>
  );
}
