import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession, generateInviteLink, startSession, endSession, getStoredAuth, Session } from '../lib/api';
import { saveWebinarSession } from '../lib/classroom-session';
import { ArrowLeft, Copy, Check, Play, Square, Users, Clock, Radio, Video, LogIn, Globe, AlertTriangle } from 'lucide-react';

// Persist tunnel URL across sessions
const TUNNEL_KEY = 'webinar_tunnel_url';

function getPublicOrigin(): string {
  const stored = localStorage.getItem(TUNNEL_KEY);
  if (stored) return stored.replace(/\/$/, '');
  return window.location.origin;
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = getStoredAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Tunnel URL management
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const [tunnelUrl, setTunnelUrl] = useState<string>(localStorage.getItem(TUNNEL_KEY) || '');
  const [tunnelInput, setTunnelInput] = useState<string>(localStorage.getItem(TUNNEL_KEY) || '');
  const [showTunnelInput, setShowTunnelInput] = useState(false);

  const publicOrigin = tunnelUrl ? tunnelUrl.replace(/\/$/, '') : window.location.origin;
  const registrationLink = `${publicOrigin}/register/${id}`;

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

  function saveTunnelUrl() {
    const cleaned = tunnelInput.trim().replace(/\/$/, '');
    localStorage.setItem(TUNNEL_KEY, cleaned);
    setTunnelUrl(cleaned);
    setShowTunnelInput(false);
  }

  function clearTunnelUrl() {
    localStorage.removeItem(TUNNEL_KEY);
    setTunnelUrl('');
    setTunnelInput('');
    setShowTunnelInput(false);
  }

  function copyLink(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleGenerate() {
    if (!id) return;
    setActionLoading('invite');
    try {
      const rawLink = await generateInviteLink(id);
      // Replace localhost origin with tunnel URL if set
      const url = new URL(rawLink);
      const link = tunnelUrl
        ? `${tunnelUrl.replace(/\/$/, '')}${url.pathname}`
        : rawLink;
      setInviteLink(link);
    } catch (err: any) { alert(err.message); }
    finally { setActionLoading(null); }
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
      const roomName = session.liveKitRoomName;
      const webinarData = {
        roomId: roomName,
        userId: auth?.user?.id || 'host',
        userName: auth?.user?.name || 'Host',
        isHost: true,
        sessionId: id,
      };
      saveWebinarSession(roomName, webinarData);
      navigate(`/webinar/${roomName}`, { state: webinarData });
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

        {/* ── Tunnel URL Banner ─────────────────────────────────────────── */}
        {isLocalhost && (
          <div style={{
            marginBottom: '16px', padding: '14px 18px',
            borderRadius: '12px', border: '1px solid rgba(234,179,8,0.35)',
            background: 'rgba(234,179,8,0.08)',
            display: 'flex', alignItems: 'flex-start', gap: '12px',
          }}>
            <AlertTriangle size={18} color="#eab308" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: '13px', color: '#eab308', marginBottom: '4px' }}>
                You're on localhost — links won't work for attendees
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: tunnelUrl ? '8px' : '12px' }}>
                {tunnelUrl
                  ? `Using tunnel: ${tunnelUrl}`
                  : 'Paste your Cloudflare tunnel URL so shareable links point to the right address.'}
              </p>
              {showTunnelInput ? (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    className="input-field"
                    placeholder="https://xxx.trycloudflare.com"
                    value={tunnelInput}
                    onChange={e => setTunnelInput(e.target.value)}
                    style={{ flex: 1, fontSize: '13px', padding: '8px 12px' }}
                    onKeyDown={e => e.key === 'Enter' && saveTunnelUrl()}
                    autoFocus
                  />
                  <button className="btn btn-primary" onClick={saveTunnelUrl} style={{ padding: '8px 16px', fontSize: '13px' }}>Save</button>
                  <button className="btn btn-secondary" onClick={() => setShowTunnelInput(false)} style={{ padding: '8px 12px', fontSize: '13px' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowTunnelInput(true)}
                    style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Globe size={13} /> {tunnelUrl ? 'Change Tunnel URL' : 'Set Tunnel URL'}
                  </button>
                  {tunnelUrl && (
                    <button className="btn btn-secondary" onClick={clearTunnelUrl} style={{ padding: '6px 14px', fontSize: '12px', color: 'var(--error-color)', borderColor: 'rgba(239,68,68,0.3)' }}>
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Session Header ────────────────────────────────────────────── */}
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

        {/* ── Invite Links ──────────────────────────────────────────────── */}
        {(isScheduled || isLive) && (
          <div className="flex-col gap-4" style={{ marginBottom: '16px' }}>

            {/* Registration Link */}
            <div className="glass-panel fade-in">
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} color="var(--primary-color)" /> Public Registration Link
              </h3>
              <p className="text-muted" style={{ marginBottom: '16px', fontSize: '13px' }}>
                Share this with attendees. They fill their name &amp; email → get automatically taken into the waiting room.
              </p>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{
                  flex: 1, padding: '12px 16px',
                  background: tunnelUrl ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.05)',
                  borderRadius: '10px',
                  border: `1px solid ${tunnelUrl ? 'rgba(16,185,129,0.25)' : 'var(--border-color)'}`,
                  fontSize: '13px', wordBreak: 'break-all', color: 'var(--text-main)',
                }}>
                  {registrationLink}
                </div>
                <button className="btn btn-secondary" onClick={() => copyLink(registrationLink, 'reg')} style={{ whiteSpace: 'nowrap' }}>
                  {copied === 'reg' ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy</>}
                </button>
              </div>

              {isLocalhost && !tunnelUrl && (
                <p style={{ marginTop: '10px', fontSize: '12px', color: '#eab308' }}>
                  ⚠️ Set your tunnel URL above so this link works for attendees outside your machine.
                </p>
              )}
            </div>

            {/* Direct Join Link */}
            <div className="glass-panel fade-in">
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Video size={16} color="var(--text-muted)" /> Direct Join Link (Bypass Registration)
              </h3>
              <p className="text-muted" style={{ marginBottom: '16px', fontSize: '13px' }}>
                Attendees only enter their display name — no email needed.
              </p>

              {!inviteLink ? (
                <button className="btn btn-secondary" onClick={handleGenerate} disabled={actionLoading === 'invite'}>
                  Generate Direct Link
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '13px', wordBreak: 'break-all', color: 'var(--text-muted)' }}>
                    {inviteLink}
                  </div>
                  <button className="btn btn-secondary" onClick={() => copyLink(inviteLink, 'direct')} style={{ whiteSpace: 'nowrap' }}>
                    {copied === 'direct' ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Technical Info */}
        <div className="glass-panel fade-in">
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Technical Info</h3>
          <div className="flex-col" style={{ gap: '10px' }}>
            {[
              { label: 'Session ID', value: session.id },
              { label: 'Room Name', value: session.liveKitRoomName },
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
