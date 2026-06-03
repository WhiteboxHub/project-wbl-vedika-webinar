import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession, generateInviteLink, startSession, endSession, getHostToken, getStoredAuth, Session } from '../lib/api';
import { ArrowLeft, Copy, Check, Play, Square, Users, Clock, Radio, Video, LogIn } from 'lucide-react';

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = getStoredAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) { navigate('/login'); return; }
    if (id) load(id);
  }, [id]);

  async function load(sessionId: string) {
    try {
      const data = await getSession(sessionId);
      setSession(data);
    } catch {
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!id) return;
    setActionLoading('invite');
    try {
      const link = await generateInviteLink(id);
      setInviteLink(link);
    } catch (err: any) { alert(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleCopy() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleStart() {
    if (!id) return;
    setActionLoading('start');
    try { await startSession(id); await load(id); }
    catch (err: any) { alert(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleEnd() {
    if (!id || !confirm('End this session for all participants?')) return;
    setActionLoading('end');
    try { await endSession(id); await load(id); }
    catch (err: any) { alert(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleJoinAsHost() {
    if (!id || !session) return;
    setActionLoading('host');
    try {
      const { livekitToken, roomName } = await getHostToken(id);
      // Route LiveKit signaling through Vite proxy → works both locally and via tunnel
      const livekitUrl = `${window.location.origin.replace(/^http/, 'ws')}/livekit`;
      navigate(`/class/${roomName}`, {
        state: { liveKitToken: livekitToken, livekitUrl, participantName: auth?.user?.name || 'Host', isHost: true, sessionId: id }
      });
    } catch (err: any) { alert(err.message); }
    finally { setActionLoading(null); }
  }

  if (loading) return <div className="flex-col flex-center" style={{ height: '100vh' }}><div style={{ width: '40px', height: '40px', border: '3px solid var(--border-color)', borderTopColor: 'var(--primary-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>;
  if (!session) return null;

  const isLive = session.status === 'live';
  const isScheduled = session.status === 'scheduled';

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px' }}>
      <div className="bg-orb" style={{ width: '400px', height: '400px', top: '-100px', right: '-100px', opacity: 0.3 }} />

      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginBottom: '32px', padding: '8px 16px', fontSize: '13px' }}>
          <ArrowLeft size={16} /> Dashboard
        </button>

        {/* Session header */}
        <div className="glass-panel fade-in" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{session.title}</h1>
                <span style={{
                  padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                  background: isLive ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.08)',
                  color: isLive ? '#10b981' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  {isLive ? <><Radio size={11} /> LIVE</> : <><Clock size={11} /> {session.status.toUpperCase()}</>}
                </span>
              </div>
              {session.description && <p className="text-muted" style={{ marginBottom: '12px' }}>{session.description}</p>}
              <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
                <span><Clock size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{new Date(session.scheduledAt).toLocaleString()}</span>
                <span><Users size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Up to {session.maxAttendees} attendees</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {isScheduled && (
                <button className="btn btn-primary" onClick={handleStart} disabled={!!actionLoading}>
                  <Play size={15} /> Start Session
                </button>
              )}
              {isLive && (
                <>
                  <button className="btn btn-primary" onClick={handleJoinAsHost} disabled={!!actionLoading}>
                    <LogIn size={15} /> Join as Host
                  </button>
                  <button className="btn" onClick={handleEnd} disabled={!!actionLoading}
                    style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--error-color)' }}>
                    <Square size={15} /> End Session
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Invite Links */}
        {(isScheduled || isLive) && (
          <div className="flex-col gap-4" style={{ marginBottom: '16px' }}>
            {/* Registration Link */}
            <div className="glass-panel fade-in">
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} color="var(--primary-color)" /> Public Registration Link
              </h3>
              <p className="text-muted" style={{ marginBottom: '16px', fontSize: '13px' }}>Share this link publicly. Attendees will need to enter their name and email to get their personal join link.</p>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '13px', wordBreak: 'break-all', color: 'var(--text-main)' }}>
                  {`${window.location.origin}/register/${id}`}
                </div>
                <button className="btn btn-secondary" onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/register/${id}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }} style={{ whiteSpace: 'nowrap' }}>
                  {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy</>}
                </button>
              </div>
            </div>

            {/* Direct Link */}
            <div className="glass-panel fade-in">
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Video size={16} color="var(--text-muted)" /> Direct Join Link (Bypass Registration)
              </h3>
              <p className="text-muted" style={{ marginBottom: '16px', fontSize: '13px' }}>Generate a direct link. Attendees will only be asked for their name.</p>
              
              {!inviteLink ? (
                <button className="btn btn-secondary" onClick={handleGenerate} disabled={actionLoading === 'invite'}>
                  Generate Direct Link
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '13px', wordBreak: 'break-all', color: 'var(--text-muted)' }}>
                    {inviteLink}
                  </div>
                  <button className="btn btn-secondary" onClick={handleCopy} style={{ whiteSpace: 'nowrap' }}>
                    <Copy size={15} /> Copy
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Room Info */}
        <div className="glass-panel fade-in">
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Technical Info</h3>
          <div className="flex-col" style={{ gap: '10px' }}>
            {[
              { label: 'Session ID', value: session.id },
              { label: 'LiveKit Room', value: session.liveKitRoomName },
              { label: 'Status', value: session.status },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{row.label}</span>
                <code style={{ fontSize: '12px', background: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: '6px' }}>{row.value}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
