import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession, generateInviteLink, startSession, endSession, getStoredAuth, Session, getHostToken } from '../lib/api';
import { saveClassroomSession, saveWebinarSession, getLiveKitUrl } from '../lib/classroom-session';

const USE_NATIVE_WEBRTC = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_USE_NATIVE_WEBRTC === 'true';
import { ArrowLeft, Copy, Check, Square, Users, Clock, Radio, Video, Globe, Loader2 } from 'lucide-react';

// ─── Public URL hook ─────────────────────────────────────────────────────────
//
// The single source of truth for what domain to use in shareable links.
// Reads from:
//   1. GET /api/config  → PUBLIC_APP_URL set in the server's .env
//   2. VITE_PUBLIC_URL  → build-time override
//   3. window.location.origin → last-resort fallback (works for LAN access)
//
// To change the domain for all links, simply update PUBLIC_APP_URL in .env
// and restart the API. No UI config needed.

function usePublicOrigin() {
  // Try build-time env var first (fastest, zero network)
  const buildTimeUrl = (import.meta as any).env?.VITE_PUBLIC_URL as string | undefined;

  const [publicOrigin, setPublicOrigin] = useState<string>(
    buildTimeUrl?.replace(/\/$/, '') ?? window.location.origin,
  );
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // If a build-time URL was provided, use it directly — no API call needed
    if (buildTimeUrl) { setChecked(true); return; }

    fetch('/api/config')
      .then(r => r.ok ? r.json() : null)
      .then((data: { publicUrl: string } | null) => {
        if (data?.publicUrl) setPublicOrigin(data.publicUrl.replace(/\/$/, ''));
      })
      .catch(() => { /* silently fall back to window.location.origin */ })
      .finally(() => setChecked(true));
  }, []);

  return { publicOrigin, checked };
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

  const { publicOrigin } = usePublicOrigin();

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
      // Replace origin with publicOrigin so the link works from any device
      const url = new URL(rawLink);
      const link = `${publicOrigin}${url.pathname}`;
      setInviteLink(link);
    } catch (err: any) { alert(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleEnd() {
    if (!id || !confirm('End this session for all participants?')) return;
    setActionLoading('end');
    try { await endSession(id); await load(id); }
    catch (err: any) { alert(err.message); }
    finally { setActionLoading(null); }
  }

  /**
   * Atomically starts the session (if not already live) and joins as host.
   */
  async function handleStartAndJoin() {
    if (!id || !session) return;
    setActionLoading('host');
    try {
      if (session.status === 'scheduled') {
        await startSession(id);
      }
      const data = await getHostToken(id);
      const roomId = data.roomId || data.roomName;

      if (USE_NATIVE_WEBRTC && data.participantId) {
        const webinarData = {
          roomId: roomId!,
          participantId: data.participantId,
          isHost: true,
          sessionId: id,
          grant: data,
        };
        saveWebinarSession(roomId!, webinarData);
        navigate(`/class/${roomId}`, { state: webinarData });
      } else {
        const classroomData = {
          participantName: auth?.user?.name || 'Host',
          isHost: true,
          sessionId: id,
          liveKitToken: data.livekitToken!,
          signalToken: data.signalToken,
          livekitUrl: getLiveKitUrl(),
        };
        saveClassroomSession(roomId!, classroomData);
        navigate(`/class/${roomId}`, { state: classroomData });
      }
    } catch (err: any) {
      alert(`Failed to join: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return <div className="flex-col flex-center" style={{ height: '100vh' }}><div style={{ width: '40px', height: '40px', border: '3px solid var(--border-color)', borderTopColor: 'var(--primary-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>;
  if (!session) return null;

  const isLive = session.status === 'live';
  const isScheduled = session.status === 'scheduled';
  const slugLink = session.slug ? `${publicOrigin}/w/${session.slug}` : null;

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px' }}>
      <div className="bg-orb" style={{ width: '400px', height: '400px', top: '-100px', right: '-100px', opacity: 0.3 }} />

      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginBottom: '32px', padding: '8px 16px', fontSize: '13px' }}>
          <ArrowLeft size={16} /> Dashboard
        </button>

        {/* ── Session Header ─────────────────────────────────────────── */}
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
              {(isScheduled || isLive) && (
                <button className="btn btn-primary" onClick={handleStartAndJoin} disabled={!!actionLoading}
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                  {actionLoading === 'host'
                    ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Joining...</>
                    : <><Video size={15} /> {isLive ? 'Re-join as Host' : 'Start & Join as Host'}</>
                  }
                </button>
              )}
              {isLive && (
                <button className="btn" onClick={handleEnd} disabled={!!actionLoading}
                  style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--error-color)' }}>
                  <Square size={15} /> End Session
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Permanent Slug URL ─────────────────────────────────────── */}
        {slugLink && (isScheduled || isLive) && (
          <div className="glass-panel fade-in" style={{ marginBottom: '16px', border: '1px solid rgba(37,99,235,0.25)', background: 'rgba(37,99,235,0.04)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={16} color="var(--primary-color)" /> Permanent Webinar Link
            </h3>
            <p className="text-muted" style={{ marginBottom: '16px', fontSize: '13px' }}>
              Share this link with attendees — it works before, during, and after the session. No expiry.
            </p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                flex: 1, padding: '14px 18px',
                background: 'rgba(37,99,235,0.08)',
                borderRadius: '10px',
                border: '1px solid rgba(37,99,235,0.2)',
                fontSize: '14px', fontWeight: 500, wordBreak: 'break-all', color: 'var(--text-main)',
              }}>
                {slugLink}
              </div>
              <button className="btn btn-primary" onClick={() => copyLink(slugLink, 'slug')} style={{ whiteSpace: 'nowrap' }}>
                {copied === 'slug' ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Link</>}
              </button>
            </div>
          </div>
        )}

        {/* ── Invite Links ───────────────────────────────────────────── */}
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
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  fontSize: '13px', wordBreak: 'break-all', color: 'var(--text-main)',
                }}>
                  {registrationLink}
                </div>
                <button className="btn btn-secondary" onClick={() => copyLink(registrationLink, 'reg')} style={{ whiteSpace: 'nowrap' }}>
                  {copied === 'reg' ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy</>}
                </button>
              </div>
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
              ...(session.slug ? [{ label: 'Slug', value: session.slug }] : []),
              { label: 'Status', value: session.status },
              { label: 'Public Domain', value: publicOrigin },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{row.label}</span>
                <code style={{ fontSize: '12px', background: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: '6px' }}>{row.value}</code>
              </div>
            ))}
          </div>
          <p style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            To change the public domain for all links, update <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '4px' }}>PUBLIC_APP_URL</code> in your <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '4px' }}>.env</code> and restart the API.
          </p>
        </div>
      </div>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
