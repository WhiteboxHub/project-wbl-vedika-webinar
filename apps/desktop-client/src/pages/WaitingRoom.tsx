import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveInvite, joinSession } from '../lib/api';
import { saveClassroomSession, getLiveKitUrl } from '../lib/classroom-session';
import { Loader2, Radio, Clock, Users, LogIn, CheckCircle, XCircle } from 'lucide-react';

type State = 'loading' | 'name-entry' | 'waiting' | 'joining' | 'error';

interface SessionInfo {
  title: string;
  description?: string;
  status: string;
  instructorName: string;
  scheduledAt?: string;
  registeredName?: string;
}

export default function WaitingRoom() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<State>('loading');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dots, setDots] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animated waiting dots
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 600);
    return () => clearInterval(t);
  }, []);

  const doJoin = useCallback(async (joinName: string) => {
    if (!token) return;
    setState('joining');
    try {
      const data = await joinSession(token, joinName);
      const roomName = data.roomName;
      saveClassroomSession(roomName, {
        participantName: joinName,
        isHost: false,
        sessionId: (data as any).sessionId || '',
        liveKitToken: data.livekitToken,
        livekitUrl: getLiveKitUrl(),
      });
      navigate(`/class/${roomName}`, {
        state: {
          participantName: joinName,
          isHost: false,
          sessionId: (data as any).sessionId || '',
          liveKitToken: data.livekitToken,
          livekitUrl: getLiveKitUrl(),
        },
      });
    } catch (err: any) {
      setState('error');
      setErrorMsg(err.message || 'Failed to join session');
    }
  }, [token, navigate]);

  useEffect(() => {
    if (!token) { navigate('/'); return; }
    resolveInvite(token)
      .then((data: any) => {
        setSession(data);
        if (data.registeredName) {
          setName(data.registeredName);
          if (data.status === 'live') doJoin(data.registeredName);
          else setState('waiting');
        } else {
          setState('name-entry');
        }
      })
      .catch((err: any) => { setState('error'); setErrorMsg(err.message || 'Invalid invite link'); });
  }, [token]);

  // Poll for session going live when waiting
  useEffect(() => {
    if (state !== 'waiting' || !token || !name) return;
    pollRef.current = setInterval(async () => {
      try {
        const data: any = await resolveInvite(token);
        if (data.status === 'live') {
          if (pollRef.current) clearInterval(pollRef.current);
          doJoin(name);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, token, name, doJoin]);

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || !session) return;
    if (session.status === 'live') doJoin(n);
    else setState('waiting');
  }

  // ── Error ──
  if (state === 'error') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="glass-panel" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '40px' }}>
          <XCircle size={48} color="var(--error-color)" style={{ marginBottom: '16px' }} />
          <h2 style={{ marginBottom: '10px' }}>Unable to Join</h2>
          <p className="text-muted" style={{ marginBottom: '24px' }}>{errorMsg}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ width: '100%' }}>Return Home</button>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (state === 'loading') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={38} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{100%{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Joining ──
  if (state === 'joining') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ padding: '48px 64px', textAlign: 'center' }}>
          <CheckCircle size={48} color="#10b981" style={{ marginBottom: '16px' }} />
          <h2 style={{ marginBottom: '8px' }}>Joining session…</h2>
          <p className="text-muted" style={{ marginBottom: '24px' }}>Setting up your connection</p>
          <Loader2 size={24} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <style>{`@keyframes spin{100%{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Name Entry ──
  if (state === 'name-entry' && session) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', position: 'relative', overflow: 'hidden' }}>
        <div className="bg-orb" style={{ width: '350px', height: '350px', top: '-80px', left: '-80px' }} />
        <div className="bg-orb" style={{ width: '280px', height: '280px', bottom: '-60px', right: '-60px', animationDelay: '1.5s' }} />

        <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '440px' }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '16px', background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Radio size={26} color="white" />
            </div>
            <h2 style={{ fontSize: '21px', marginBottom: '5px' }}>{session.title}</h2>
            <p className="text-muted" style={{ fontSize: '14px' }}>Hosted by {session.instructorName}</p>
            {session.scheduledAt && (
              <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>
                <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                {new Date(session.scheduledAt).toLocaleString()}
              </p>
            )}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '10px', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', background: session.status === 'live' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.08)', color: session.status === 'live' ? '#10b981' : 'var(--text-muted)' }}>
              {session.status === 'live' ? <><Radio size={11} /> LIVE</> : <><Clock size={11} /> {session.status.toUpperCase()}</>}
            </div>
          </div>

          <form onSubmit={handleNameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Display Name</label>
              <input type="text" className="input-field" placeholder="Enter your name" value={name} onChange={e => setName(e.target.value)} autoFocus required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <LogIn size={15} />
              {session.status === 'live' ? 'Join Now' : 'Enter Waiting Room'}
            </button>
          </form>
        </div>
        <style>{`@keyframes spin{100%{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Waiting ──
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', position: 'relative', overflow: 'hidden' }}>
      <div className="bg-orb" style={{ width: '400px', height: '400px', top: '-100px', right: '-100px' }} />
      <div className="bg-orb" style={{ width: '300px', height: '300px', bottom: '-60px', left: '-60px', animationDelay: '2s' }} />

      <div className="glass-panel fade-in" style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        <div style={{ marginBottom: '28px' }}>
          <div style={{ width: '76px', height: '76px', borderRadius: '50%', background: 'rgba(124,58,237,0.14)', border: '2px solid rgba(124,58,237,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', animation: 'waiting-pulse 2s ease-in-out infinite' }}>
            <Users size={30} color="var(--primary-color)" />
          </div>
          <h2 style={{ fontSize: '22px', marginBottom: '8px' }}>Waiting for host{dots}</h2>
          <p className="text-muted">The webinar hasn't started yet. You'll join automatically when it begins.</p>
        </div>

        {/* Progress steps */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
          {[{ label: 'Registered', done: true }, { label: 'Waiting', done: true }, { label: 'In Session', done: false }].map((step, i) => (
            <React.Fragment key={step.label}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: step.done ? 'linear-gradient(135deg,var(--primary-color),var(--secondary-color))' : 'rgba(255,255,255,0.08)', border: step.done ? 'none' : '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: step.done ? '#fff' : 'var(--text-muted)' }}>{i + 1}</div>
                <span style={{ fontSize: '10px', color: step.done ? 'var(--text-main)' : 'var(--text-muted)' }}>{step.label}</span>
              </div>
              {i < 2 && <div style={{ width: '28px', height: '1px', background: 'var(--border-color)', marginBottom: '14px' }} />}
            </React.Fragment>
          ))}
        </div>

        <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', marginBottom: '20px', textAlign: 'left' }}>
          <p style={{ fontWeight: 600, marginBottom: '4px', fontSize: '14px' }}>{session?.title}</p>
          <p className="text-muted" style={{ fontSize: '12px' }}>Hosted by {session?.instructorName}</p>
          <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>Joining as: <strong style={{ color: 'var(--text-main)' }}>{name}</strong></p>
        </div>

        <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ width: '100%' }}>Leave</button>
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes waiting-pulse { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.07); opacity:0.85; } }
      `}</style>
    </div>
  );
}
