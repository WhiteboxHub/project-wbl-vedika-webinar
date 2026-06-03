import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveInvite, registerForWebinar, ResolveInviteResponse } from '../lib/api';
import { Loader2, Calendar, Clock, Video, CheckCircle, Copy } from 'lucide-react';

export default function Register() {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [session, setSession] = useState<ResolveInviteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const [successLink, setSuccessLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      navigate('/');
      return;
    }
    
    // We can use the resolveInvite endpoint with a dummy token or create a new endpoint.
    // Wait, resolveInvite requires a token. We need a way to fetch public session details.
    // Let's use the GET /classes/:id if it's public, or just pass a special public endpoint.
    // Actually, I'll fetch the session directly.
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
          maxAttendees: data.maxAttendees
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
    if (!name.trim() || !email.trim()) return;
    
    setSubmitting(true);
    try {
      const { inviteUrl } = await registerForWebinar(sessionId!, name, email);
      
      // Convert webinar://join?token=XYZ to http://domain/join/XYZ
      const url = new URL(inviteUrl);
      const token = url.searchParams.get('token');
      const publicLink = `${window.location.origin}/join/${token}`;
      
      setSuccessLink(publicLink);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (successLink) {
      navigator.clipboard.writeText(successLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  if (successLink) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh', padding: '20px' }}>
        <div className="bg-orb" style={{ top: '-100px', left: '-100px', width: '400px', height: '400px' }} />
        <div className="glass-panel fade-in text-center" style={{ maxWidth: '480px', width: '100%', position: 'relative', zIndex: 1 }}>
          <div style={{ width: '64px', height: '64px', background: 'rgba(16,185,129,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle size={32} color="var(--success-color)" />
          </div>
          <h2 style={{ fontSize: '28px', marginBottom: '8px' }}>You're Registered!</h2>
          <p className="text-muted">Save your personal join link below. You'll need this to enter the webinar.</p>
          
          <div style={{ marginTop: '32px', padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input 
              readOnly 
              value={successLink} 
              style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '13px', outline: 'none' }}
            />
            <button onClick={handleCopy} className="btn btn-secondary" style={{ padding: '8px 12px' }}>
              {copied ? <CheckCircle size={16} color="var(--success-color)" /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <button className="btn btn-primary mt-8" onClick={() => window.location.href = successLink} style={{ width: '100%' }}>
            Enter Webinar Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-col flex-center" style={{ minHeight: '100vh', padding: '40px 20px' }}>
      <div className="bg-orb" style={{ top: '-100px', right: '-100px', width: '500px', height: '500px' }} />
      
      <div className="glass-panel fade-in" style={{ maxWidth: '480px', width: '100%', position: 'relative', zIndex: 1, padding: '40px' }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: 'rgba(124, 58, 237, 0.1)', color: 'var(--primary-color)', borderRadius: '20px', fontSize: '13px', fontWeight: 600, marginBottom: '20px' }}>
            <Video size={14} /> Live Webinar
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
              placeholder="john@example.com"
              value={email} onChange={e => setEmail(e.target.value)}
              required disabled={submitting}
            />
          </div>

          {error && <div style={{ color: 'var(--error-color)', fontSize: '13px', padding: '12px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={submitting || !name || !email} style={{ width: '100%', padding: '16px', fontSize: '16px' }}>
            {submitting ? <Loader2 size={20} className="spin" /> : 'Register for Webinar'}
          </button>
        </form>
      </div>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
