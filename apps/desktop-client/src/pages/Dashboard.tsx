import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessions, startSession, endSession, generateInviteLink, clearAuth, getStoredAuth, Session } from '../lib/api';
import { Plus, LogOut, Video, Copy, Check, Play, Square, Clock, Radio, XCircle, Users, ChevronRight } from 'lucide-react';

const STATUS_CONFIG = {
  scheduled: { label: 'Scheduled', color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.08)', icon: <Clock size={12} /> },
  live:      { label: 'Live',      color: '#10b981',            bg: 'rgba(16,185,129,0.15)', icon: <Radio size={12} /> },
  ended:     { label: 'Ended',     color: 'var(--text-muted)',  bg: 'rgba(255,255,255,0.05)', icon: <XCircle size={12} /> },
  cancelled: { label: 'Cancelled', color: 'var(--error-color)', bg: 'rgba(239,68,68,0.1)',   icon: <XCircle size={12} /> },
};

type TabId = 'upcoming' | 'live' | 'past';

const TABS: { id: TabId; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'live',     label: 'Live Now' },
  { id: 'past',     label: 'Past' },
];

function filterByTab(sessions: Session[], tab: TabId): Session[] {
  const now = Date.now();
  switch (tab) {
    case 'upcoming':
      return sessions
        .filter(s => s.status === 'scheduled')
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    case 'live':
      return sessions
        .filter(s => s.status === 'live')
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
    case 'past':
      return sessions
        .filter(s => s.status === 'ended' || s.status === 'cancelled' ||
          (s.status === 'scheduled' && new Date(s.scheduledAt).getTime() < now))
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
    default:
      return sessions;
  }
}

function SessionCard({
  session, inviteLink, copiedId, actionLoading,
  onStart, onEnd, onGenerateInvite, onCopy, onDetails,
}: {
  session: Session;
  inviteLink?: string;
  copiedId: string | null;
  actionLoading: string | null;
  onStart: (id: string) => void;
  onEnd: (id: string) => void;
  onGenerateInvite: (id: string) => void;
  onCopy: (id: string, link: string) => void;
  onDetails: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.scheduled;
  return (
    <div className="glass-panel fade-in" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 600 }}>{session.title}</h3>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
              color: cfg.color, background: cfg.bg,
            }}>
              {cfg.icon} {cfg.label}
            </span>
          </div>
          {session.description && <p className="text-muted" style={{ fontSize: '14px', marginBottom: '8px' }}>{session.description}</p>}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-muted)' }}>
            <span><Clock size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />{new Date(session.scheduledAt).toLocaleString()}</span>
            <span><Users size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />Max {session.maxAttendees}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {session.status === 'scheduled' && (
            <button className="btn btn-primary" onClick={() => onStart(session.id)}
              disabled={actionLoading === session.id + '_start'}
              style={{ padding: '8px 16px', fontSize: '13px' }}>
              <Play size={14} /> Start
            </button>
          )}
          {session.status === 'live' && (
            <>
              <button className="btn btn-primary" onClick={() => onDetails(session.id)}
                style={{ padding: '8px 16px', fontSize: '13px' }}>
                <Video size={14} /> Join as Host
              </button>
              <button className="btn" onClick={() => onEnd(session.id)}
                disabled={actionLoading === session.id + '_end'}
                style={{ padding: '8px 16px', fontSize: '13px', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--error-color)' }}>
                <Square size={14} /> End
              </button>
            </>
          )}
          {(session.status === 'scheduled' || session.status === 'live') && !inviteLink && (
            <button className="btn btn-secondary" onClick={() => onGenerateInvite(session.id)}
              disabled={actionLoading === session.id + '_invite'}
              style={{ padding: '8px 16px', fontSize: '13px' }}>
              Generate Invite
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => onDetails(session.id)}
            style={{ padding: '8px 16px', fontSize: '13px' }}>
            Details <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {inviteLink && (
        <div style={{
          marginTop: '16px', padding: '12px 16px',
          background: 'rgba(124, 58, 237, 0.1)', borderRadius: '10px',
          border: '1px solid rgba(124, 58, 237, 0.3)',
          display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          <span style={{ flex: 1, fontSize: '13px', wordBreak: 'break-all', color: 'var(--text-muted)' }}>{inviteLink}</span>
          <button className="btn btn-secondary" onClick={() => onCopy(session.id, inviteLink)}
            style={{ padding: '6px 14px', fontSize: '12px', whiteSpace: 'nowrap' }}>
            {copiedId === session.id ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy Link</>}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const auth = getStoredAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('upcoming');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!auth) { navigate('/login'); return; }
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const data = await getSessions();
      setSessions(data);
      if (data.some(s => s.status === 'live')) setActiveTab('live');
    } catch {
      navigate('/login');
    } finally {
      setLoading(false);
    }
  }

  const tabCounts = useMemo(() => ({
    upcoming: filterByTab(sessions, 'upcoming').length,
    live: filterByTab(sessions, 'live').length,
    past: filterByTab(sessions, 'past').length,
  }), [sessions]);

  const visibleSessions = useMemo(
    () => filterByTab(sessions, activeTab),
    [sessions, activeTab],
  );

  async function handleGenerateInvite(sessionId: string) {
    setActionLoading(sessionId + '_invite');
    try {
      const link = await generateInviteLink(sessionId);
      setInviteLinks(prev => ({ ...prev, [sessionId]: link }));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCopy(sessionId: string, link: string) {
    await navigator.clipboard.writeText(link);
    setCopiedId(sessionId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleStart(sessionId: string) {
    setActionLoading(sessionId + '_start');
    try {
      await startSession(sessionId);
      await loadSessions();
      setActiveTab('live');
    } catch (err: any) { alert(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleEnd(sessionId: string) {
    if (!confirm('End this session? All participants will be disconnected.')) return;
    setActionLoading(sessionId + '_end');
    try {
      await endSession(sessionId);
      await loadSessions();
      setActiveTab('past');
    } catch (err: any) { alert(err.message); }
    finally { setActionLoading(null); }
  }

  const liveCount = tabCounts.live;
  const scheduledCount = tabCounts.upcoming;

  return (
    <div style={{ minHeight: '100vh', padding: '0' }}>
      <div className="bg-orb" style={{ width: '500px', height: '500px', top: '-150px', right: '-100px', opacity: 0.3 }} />

      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 40px',
        borderBottom: '1px solid var(--border-color)',
        backdropFilter: 'blur(20px)',
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(10,10,10,0.8)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Video size={18} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Whitebox Learning</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Webinar Organizer Dashboard</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{auth?.user?.email}</span>
          <button className="btn btn-secondary" onClick={() => { clearAuth(); navigate('/login'); }} style={{ padding: '8px 14px', fontSize: '13px' }}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '40px' }}>
          {[
            { label: 'Total Sessions', value: sessions.length, color: 'var(--text-main)' },
            { label: 'Live Now', value: liveCount, color: '#10b981' },
            { label: 'Upcoming', value: scheduledCount, color: 'var(--primary-color)' },
          ].map(stat => (
            <div key={stat.label} className="glass-panel fade-in" style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Your Webinars</h2>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard/new')}>
            <Plus size={16} /> Schedule Webinar
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '0' }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            const count = tabCounts[tab.id];
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: '10px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                background: 'none', border: 'none',
                color: active ? 'var(--primary-color)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid var(--primary-color)' : '2px solid transparent',
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                {tab.label}
                {count > 0 && (
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px',
                    background: active ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.08)',
                    color: active ? 'var(--primary-color)' : 'var(--text-muted)',
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex-col flex-center" style={{ padding: '80px' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-color)', borderTopColor: 'var(--primary-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : visibleSessions.length === 0 ? (
          <div className="glass-panel flex-col flex-center fade-in" style={{ padding: '60px', textAlign: 'center' }}>
            <Video size={40} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
            <h3 style={{ marginBottom: '8px' }}>
              {activeTab === 'upcoming' && 'No upcoming webinars'}
              {activeTab === 'live' && 'No live webinars right now'}
              {activeTab === 'past' && 'No past webinars yet'}
            </h3>
            <p className="text-muted" style={{ marginBottom: '20px' }}>
              {activeTab === 'upcoming'
                ? 'Schedule a webinar for your team or attendees.'
                : 'Sessions appear here once they are started or completed.'}
            </p>
            {activeTab === 'upcoming' && (
              <button className="btn btn-primary" onClick={() => navigate('/dashboard/new')}>
                <Plus size={16} /> Schedule Webinar
              </button>
            )}
          </div>
        ) : (
          <div className="flex-col" style={{ gap: '12px' }}>
            {visibleSessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                inviteLink={inviteLinks[session.id]}
                copiedId={copiedId}
                actionLoading={actionLoading}
                onStart={handleStart}
                onEnd={handleEnd}
                onGenerateInvite={handleGenerateInvite}
                onCopy={handleCopy}
                onDetails={(id) => navigate(`/dashboard/${id}`)}
              />
            ))}
          </div>
        )}
      </main>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
