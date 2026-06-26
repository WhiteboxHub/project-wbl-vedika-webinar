import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { registerForWebinar } from '../lib/api';
import { Loader2, Calendar, Clock, Video, Mail, CheckCircle } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BLOCKED_DOMAINS = ['attendee.local', 'localhost', 'example.com', 'test.com'];

function isValidEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return 'Please enter a valid email address.';
  const domain = normalized.split('@')[1];
  if (BLOCKED_DOMAINS.includes(domain)) return 'Please use a real email address (not a placeholder domain).';
  return null;
}

export default function Register() {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<{
    sessionId?: string;
    title?: string;
    description?: string;
    scheduledAt?: string;
    status?: string;
    instructorName?: string;
    maxAttendees?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      navigate('/');
      return;
    }

    fetch(`/api/classes/${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.statusCode) throw new Error(data.message);
        setSession({
          sessionId: data.id,
          title: data.title,
          description: data.description,
          scheduledAt: data.scheduledAt,
          status: data.status,
          instructorName: data.instructor?.name || 'Instructor',
          maxAttendees: data.maxAttendees,
        });
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to load webinar details');
        setLoading(false);
      });
  }, [sessionId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailErr = isValidEmail(email);
    if (emailErr) {
      setEmailError(emailErr);
      return;
    }
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);
    setEmailError(null);
    try {
      const { token } = await registerForWebinar(sessionId!, name.trim(), email.trim().toLowerCase());
      setRegistered(true);
      // Brief confirmation, then proceed to waiting room
      setTimeout(() => navigate(`/waiting/${token}`), 2500);
    } catch (err: any) {
      const msg = err.message || 'Registration failed';
      if (msg.toLowerCase().includes('email')) setEmailError(msg);
      else setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh' }}>
        <Loader2 size={40} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh', padding: '20px' }}>
        <div className="glass-panel text-center fade-in">
          <h2>Webinar Not Found</h2>
          <p className="text-muted mt-4">{error}</p>
          <button className="btn btn-primary mt-6" onClick={() => navigate('/')}>Return Home</button>
        </div>
      </div>
    );
  }

  if (registered) {
    return (
      <div className="flex-col flex-center" style={{ minHeight: '100vh', padding: '40px 20px' }}>
        <div className="glass-panel fade-in text-center" style={{ maxWidth: '440px', padding: '48px 36px' }}>
          <CheckCircle size={52} color="#22c55e" style={{ marginBottom: '20px' }} />
          <h2 style={{ marginBottom: '12px' }}>You're Registered!</h2>
          <p className="text-muted" style={{ lineHeight: 1.6, marginBottom: '16px' }}>
            Thank you for registering with <strong>Whitebox Learning</strong>.
            A confirmation email has been sent to <strong>{email}</strong>.
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            Redirecting you to the waiting room…
          </p>
          <Loader2 size={24} color="var(--primary-color)" style={{ marginTop: '20px', animation: 'spin 1s linear infinite' }} />
        </div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="flex-col flex-center" style={{ minHeight: '100vh', padding: '40px 20px' }}>
      <div className="bg-orb" style={{ top: '-100px', right: '-100px', width: '500px', height: '500px' }} />

      <div className="glass-panel fade-in" style={{ maxWidth: '480px', width: '100%', position: 'relative', zIndex: 1, padding: '40px' }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: 'rgba(124, 58, 237, 0.1)', color: 'var(--primary-color)', borderRadius: '20px', fontSize: '13px', fontWeight: 600, marginBottom: '20px' }}>
            <Video size={14} /> Whitebox Learning Webinar
          </div>
          <h1 style={{ fontSize: '32px', marginBottom: '12px', lineHeight: 1.2 }}>{session?.title}</h1>
          <p className="text-muted" style={{ fontSize: '15px', lineHeight: 1.6 }}>{session?.description}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px', padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-main)' }}>
            <Calendar size={18} color="var(--primary-color)" />
            <span style={{ fontSize: '14px', fontWeight: 500 }}>
              {new Date(session?.scheduledAt || '').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-main)' }}>
            <Clock size={18} color="var(--primary-color)" />
            <span style={{ fontSize: '14px', fontWeight: 500 }}>
              {new Date(session?.scheduledAt || '').toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-6">
          <div className="flex-col" style={{ gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Full Name</label>
            <input
              type="text" className="input-field"
              placeholder="John Doe"
              value={name} onChange={e => setName(e.target.value)}
              required disabled={submitting}
            />
          </div>
          <div className="flex-col" style={{ gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Address</label>
            <input
              type="email" className="input-field"
              placeholder="you@company.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailError(null); }}
              onBlur={() => { if (email) setEmailError(isValidEmail(email)); }}
              required disabled={submitting}
            />
            {emailError && (
              <p style={{ fontSize: '12px', color: 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail size={12} /> {emailError}
              </p>
            )}
          </div>

          {error && <div style={{ color: 'var(--error-color)', fontSize: '13px', padding: '12px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={submitting || !name || !email || !!emailError} style={{ width: '100%', padding: '16px', fontSize: '16px' }}>
            {submitting ? <Loader2 size={20} className="spin" /> : 'Register for Webinar'}
          </button>
        </form>
      </div>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
