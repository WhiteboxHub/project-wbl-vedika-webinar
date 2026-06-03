import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveInvite, joinSession, ResolveInviteResponse } from '../lib/api';
import { Loader2, Radio, Clock, Users, LogIn } from 'lucide-react';

export default function WaitingRoom() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<ResolveInviteResponse | null>(null);
  const [name, setName] = useState('');
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dots, setDots] = useState('');

  // Animated dots
  useEffect(() => {
    const interval = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 600);
    return () => clearInterval(interval);
  }, []);

  // Load session initially
  useEffect(() => {
    if (!token) { navigate('/'); return; }
    loadSession();
  }, [token]);

  // Poll every 5s for status change
  useEffect(() => {
    if (!token || !nameConfirmed) return;
    const interval = setInterval(async () => {
      try {
        const data = await resolveInvite(token);
        setSession(data);
        if (data.status === 'live') {
          clearInterval(interval);
          handleJoin();
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [token, nameConfirmed, name]);

  async function loadSession() {
    try {
      const data = await resolveInvite(token!);
      setSession(data);
      if (data.registeredName) {
        setName(data.registeredName);
        setNameConfirmed(true);
        if (data.status === 'live') {
          // Wrap in timeout to ensure state settles before calling handleJoin
          setTimeout(() => handleJoinRef(data.registeredName!), 0);
        }
      } else if (data.status === 'live' && nameConfirmed) {
        handleJoin();
      }
    } catch (err: any) {
      setError(err.message || 'Invalid invite link');
    }
  }

  async function handleJoinRef(joinName: string) {
    if (!token || !joinName.trim() || joining) return;
    setJoining(true);
    try {
      const liveKitData = await joinSession(token, joinName);
      // Route LiveKit through Vite proxy so it works locally AND via tunnel
      const livekitUrl = `${window.location.origin.replace(/^http/, 'ws')}/livekit`;
      navigate(`/class/${liveKitData.roomName}`, {
        state: { liveKitToken: liveKitData.livekitToken, livekitUrl, participantName: joinName, isHost: false }
      });
    } catch (err: any) {
      setError(err.message || 'Failed to join');
      setJoining(false);
    }
  }

  async function handleJoin() {
    return handleJoinRef(name);
  }

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setNameConfirmed(true);
    if (session?.status === 'live') handleJoin();
  }

  if (error) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh' }}>
        <div className="glass-panel flex-col flex-center fade-in" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
          <h2>Invalid Invite</h2>
          <p className="text-muted" style={{ margin: '12px 0 24px' }}>{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>Return Home</button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh' }}>
        <Loader2 size={40} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Step 1: Enter name
  if (!nameConfirmed) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh', padding: '20px' }}>
        <div className="bg-orb" style={{ width: '350px', height: '350px', top: '-80px', left: '-80px' }} />
        <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '440px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '22px', marginBottom: '6px' }}>{session.title}</h2>
            <p className="text-muted">Hosted by {session.instructorName}</p>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              marginTop: '12px', padding: '4px 14px', borderRadius: '20px', fontSize: '13px',
              background: session.status === 'live' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.08)',
              color: session.status === 'live' ? '#10b981' : 'var(--text-muted)',
            }}>
              {session.status === 'live' ? <><Radio size={12} /> LIVE</> : <><Clock size={12} /> {session.status.toUpperCase()}</>}
            </div>
          </div>

          <form onSubmit={handleNameSubmit} className="flex-col gap-6">
            <div className="flex-col" style={{ gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Display Name</label>
              <input
                type="text" className="input-field"
                placeholder="Enter your name"
                value={name} onChange={e => setName(e.target.value)}
                autoFocus required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()} style={{ width: '100%' }}>
              <LogIn size={16} />
              {session.status === 'live' ? 'Join Now' : 'Enter Waiting Room'}
            </button>
          </form>
        </div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Step 2: Waiting for host
  return (
    <div className="flex-col flex-center" style={{ height: '100vh', padding: '20px', textAlign: 'center' }}>
      <div className="bg-orb" style={{ width: '400px', height: '400px', top: '-100px', right: '-100px' }} />
      <div className="glass-panel fade-in" style={{ maxWidth: '480px', width: '100%' }}>
        {/* Pulsing live indicator */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%',
            background: 'rgba(124, 58, 237, 0.15)',
            border: '2px solid rgba(124, 58, 237, 0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            animation: 'pulse 2s ease-in-out infinite',
          }}>
            <Users size={32} color="var(--primary-color)" />
          </div>
          <h2 style={{ fontSize: '22px', marginBottom: '8px' }}>Waiting for host{dots}</h2>
          <p className="text-muted">The organizer hasn't started the session yet.</p>
          <p className="text-muted" style={{ fontSize: '13px', marginTop: '6px' }}>You'll automatically join when it begins.</p>
        </div>

        <div style={{
          padding: '16px', borderRadius: '12px',
          background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
          marginBottom: '24px',
        }}>
          <p style={{ fontWeight: 600, marginBottom: '4px' }}>{session.title}</p>
          <p className="text-muted" style={{ fontSize: '13px' }}>Hosted by {session.instructorName}</p>
          <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>
            Joining as: <strong style={{ color: 'var(--text-main)' }}>{name}</strong>
          </p>
        </div>

        <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ width: '100%' }}>
          Leave
        </button>
      </div>

      {joining && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel flex-col flex-center" style={{ padding: '48px' }}>
            <Loader2 size={48} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
            <p>Joining session...</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.08); opacity: 0.8; } }
      `}</style>
    </div>
  );
}
