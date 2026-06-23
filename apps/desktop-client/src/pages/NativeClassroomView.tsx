import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PeerState, type JoinGrant } from '@webinar/shared';
import { RoomManager } from '../lib/webrtc/RoomManager';
import { runPreJoinDiagnostics } from '../lib/webrtc/Diagnostics';
import { clearWebinarSession } from '../lib/classroom-session';
import { promoteParticipant } from '../lib/api';
import {
  Loader2, Monitor, StopCircle, Square, MessageSquare,
  AlertCircle, Hand, RotateCcw, Users, BarChart2, HelpCircle,
  Mic, MicOff, ShieldPlus, X,
} from 'lucide-react';
import PollPanel, { PollData, PollResult } from './classroom/PollPanel';
import QAPanel, { QuestionData } from './classroom/QAPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props { grant: JoinGrant; isHost: boolean; }
type SideTab = 'chat' | 'participants' | 'polls' | 'qa';
type AudioState = 'none' | 'pending' | 'approved' | 'denied';

const BLUE   = '#2563eb';
const RED    = '#ef4444';
const GREEN  = '#22c55e';
const AMBER  = '#f59e0b';
const BG     = 'rgba(6,6,14,0.99)';
const BORDER = 'rgba(255,255,255,0.08)';
const SURF   = 'rgba(255,255,255,0.05)';

// ─── Icon Strip ───────────────────────────────────────────────────────────────

const STRIP_TABS: { id: SideTab; label: string; icon: React.ReactNode }[] = [
  { id: 'chat',         label: 'Chat',   icon: <MessageSquare size={16} /> },
  { id: 'participants', label: 'People', icon: <Users size={16} /> },
  { id: 'polls',        label: 'Polls',  icon: <BarChart2 size={16} /> },
  { id: 'qa',           label: 'Q&A',    icon: <HelpCircle size={16} /> },
];

function IconStrip({
  activeTab, sidebarOpen, onTabClick, unreadChat, audioRequestCount,
}: {
  activeTab: SideTab; sidebarOpen: boolean;
  onTabClick: (t: SideTab) => void;
  unreadChat: number; audioRequestCount: number;
}) {
  return (
    <div style={{
      width: 52, flexShrink: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 10, gap: 4,
      background: BG, borderLeft: `1px solid ${BORDER}`,
    }}>
      {STRIP_TABS.map(tab => {
        const isActive = sidebarOpen && activeTab === tab.id;
        const badge =
          tab.id === 'chat' && unreadChat > 0 ? Math.min(unreadChat, 99) :
          tab.id === 'participants' && audioRequestCount > 0 ? audioRequestCount : 0;
        return (
          <button
            key={tab.id} title={tab.label}
            onClick={() => onTabClick(tab.id)}
            style={{
              width: 42, height: 42, borderRadius: 10,
              background: isActive ? 'rgba(37,99,235,0.18)' : 'transparent',
              border: isActive ? `1px solid rgba(37,99,235,0.4)` : '1px solid transparent',
              color: isActive ? BLUE : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              position: 'relative', transition: 'all 0.15s', outline: 'none',
            }}
          >
            {tab.icon}
            <span style={{ fontSize: 9, lineHeight: 1, fontWeight: 600 }}>{tab.label}</span>
            {badge > 0 && (
              <div style={{
                position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7,
                background: tab.id === 'participants' ? AMBER : RED,
                fontSize: 9, fontWeight: 700, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
              }}>{badge}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({ messages, onSend }: { messages: any[]; onSend: (m: string) => void }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim()); setInput('');
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {messages.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>No messages yet</p>}
        {messages.map((m, i) => (
          <div key={m.id || i} style={{ padding: '8px 10px', borderRadius: 8, background: SURF }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: BLUE }}>{m.userName}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.4 }}>{m.message}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} style={{ borderTop: '1px solid var(--border-color)', padding: 10, display: 'flex', gap: 7 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message…"
          style={{ flex: 1, padding: '8px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontSize: 13, outline: 'none' }}
        />
        <button type="submit" style={{ padding: '8px 13px', borderRadius: 8, border: 'none', background: BLUE, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Send</button>
      </form>
    </div>
  );
}

// ─── Native People Panel ──────────────────────────────────────────────────────

function PeoplePanel({
  participants, raisedHands, audioRequests, isHost, canModerate,
  sessionId, myId, onApproveAudio, onDenyAudio, onForceMute, onPromote,
}: {
  participants: any[]; raisedHands: Set<string>; audioRequests: any[];
  isHost: boolean; canModerate: boolean; sessionId: string; myId: string;
  onApproveAudio: (uid: string) => void; onDenyAudio: (uid: string) => void;
  onForceMute: (uid: string, muted: boolean) => void; onPromote: (uid: string, role: string) => void;
}) {
  const [promoting, setPromoting] = useState<string | null>(null);
  async function handlePromote(uid: string, role: string) {
    setPromoting(uid);
    try { await promoteParticipant(sessionId, uid, role); onPromote(uid, role); } finally { setPromoting(null); }
  }
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Participants ({participants.length})
      </p>

      {/* Audio requests */}
      {canModerate && audioRequests.length > 0 && (
        <div style={{ marginBottom: 12, background: 'rgba(245,158,11,0.07)', border: `1px solid rgba(245,158,11,0.22)`, borderRadius: 8, padding: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: AMBER, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Mic Requests ({audioRequests.length})</p>
          {audioRequests.map((req: any) => (
            <div key={req.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{req.userName}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => onApproveAudio(req.userId)} style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.15)', color: '#10b981', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Approve</button>
                <button onClick={() => onDenyAudio(req.userId)} style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Deny</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {participants.map((p: any) => {
        const isMe = p.userId === myId;
        const handUp = raisedHands.has(p.userId);
        const isMod = p.role === 'host' || p.role === 'organizer' || p.role === 'co_organizer' || p.role === 'moderator';
        return (
          <div key={p.userId} style={{ padding: 9, borderRadius: 10, marginBottom: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%',
                background: BLUE,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {(p.userName || '?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{p.userName}</span>
                  {handUp && <span style={{ fontSize: 10, fontWeight: 600, color: AMBER,
                    background: 'rgba(245,158,11,0.12)', padding: '1px 5px', borderRadius: 6 }}>Hand Up</span>}
                  {isMe && <span style={{ fontSize: 9, background: 'rgba(37,99,235,0.18)',
                    color: BLUE, padding: '1px 5px', borderRadius: 6 }}>You</span>}
                  {isMod && <span style={{ fontSize: 9, background: 'rgba(37,99,235,0.15)',
                    color: BLUE, padding: '1px 5px', borderRadius: 6 }}>Host</span>}
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{p.role}</p>
              </div>
            </div>
            {canModerate && !isMe && (
              <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                <button title="Mute/Unmute" onClick={() => onForceMute(p.userId, true)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                  <MicOff size={10} />
                </button>
                {isHost && !isMod && (
                  <button title="Make Co-organizer" disabled={promoting === p.userId}
                  onClick={() => handlePromote(p.userId, 'co_organizer')}
                  style={{ width: 26, height: 26, borderRadius: 6,
                    border: `1px solid rgba(37,99,235,0.35)`, background: 'rgba(37,99,235,0.1)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: BLUE,
                    opacity: promoting === p.userId ? 0.5 : 1 }}>
                    {promoting === p.userId ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldPlus size={10} />}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Sidebar header ────────────────────────────────────────────────────────────

function SidebarHeader({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div style={{ flexShrink: 0, padding: '10px 12px', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <button onClick={onClose}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 5 }}>
        <X size={13}/>
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function NativeClassroomView({ grant, isHost }: Props) {
  const navigate = useNavigate();
  const roomRef  = useRef<RoomManager | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Core state
  const [state, setState]           = useState<PeerState>(PeerState.IDLE);
  const [sharing, setSharing]       = useState(false);
  const [diagDone, setDiagDone]     = useState(false);
  const [diagError, setDiagError]   = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  // UI layout
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab]     = useState<SideTab>('chat');
  const [unreadChat, setUnreadChat]   = useState(0);

  // Closure-safe refs
  const sidebarOpenRef = useRef(false);
  const activeTabRef   = useRef<SideTab>('chat');
  useEffect(() => { sidebarOpenRef.current = sidebarOpen; }, [sidebarOpen]);
  useEffect(() => { activeTabRef.current   = activeTab; },   [activeTab]);

  // Hand / participants
  const [handRaised, setHandRaised]       = useState(false);
  const [raisedHands, setRaisedHands]     = useState<Set<string>>(new Set());
  const [participants, setParticipants]   = useState<any[]>([]);
  const [audioRequests, setAudioRequests] = useState<any[]>([]);

  // Audio (attendee)
  const initialAudio: AudioState = isHost ? 'approved' : 'none';
  const [audioState, setAudioState] = useState<AudioState>(initialAudio);
  const [micMuted, setMicMuted]     = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<any[]>([]);

  // Q&A
  const [questions, setQuestions] = useState<QuestionData[]>([]);

  // Polls
  const [activePoll, setActivePoll]           = useState<PollData | null>(null);
  const [pollResult, setPollResult]           = useState<PollResult | null>(null);
  const [userVotedOptionId, setUserVotedOptionId] = useState<string | null>(null);

  const canModerate = isHost;

  const handleLeave = useCallback(() => {
    roomRef.current?.leave();
    clearWebinarSession(grant.roomId);
    navigate(isHost ? '/dashboard' : '/');
  }, [grant.roomId, isHost, navigate]);

  // ── Audio helpers ─────────────────────────────────────────────────────────
  const handlePublishAudio = useCallback(async () => {
    const rm = roomRef.current;
    if (!rm) return;
    const ok = await rm.publishAudio();
    if (!ok) { setAudioState('none'); alert('Microphone access denied or unavailable.'); }
  }, []);

  const handleRequestAudio = useCallback(() => {
    roomRef.current?.getSignalClient().requestAudio();
    setAudioState('pending');
  }, []);

  const handleToggleMic = useCallback(() => {
    const rm = roomRef.current;
    if (!rm) return;
    const next = !micMuted;
    rm.muteAudio(next);
    setMicMuted(next);
  }, [micMuted]);

  const handleForceMute = useCallback((uid: string, muted: boolean) => {
    roomRef.current?.getSignalClient().forceMute(uid, muted);
  }, []);

  // ── Join / setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function start() {
      const diag = await runPreJoinDiagnostics(grant.iceServers, { requireMic: isHost });
      if (cancelled) return;
      if (diag.overall === 'fail') { setDiagError('Pre-join checks failed. Check network and signal server.'); return; }
      setDiagDone(true);

      const rm = new RoomManager({
        grant, isHost,
        onStateChange: (s) => { setState(s); setReconnecting(s === PeerState.RECONNECTING); },
        onRemoteStream: (stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => {});
          }
        },
        onSessionEnded: () => { clearWebinarSession(grant.roomId); navigate(isHost ? '/dashboard' : '/'); },
        onSignalChat: (id, userId, userName, message, timestamp) => {
          setChatMessages(prev => [...prev, { id, userId, userName, message, timestamp }]);
          if (!sidebarOpenRef.current || activeTabRef.current !== 'chat') {
            setUnreadChat(c => c + 1);
          }
        },
      });

      const sig = rm.getSignalClient();

      sig.onRoomState = (d) => {
        if (d?.history)   setChatMessages(d.history);
        if (d?.presence)  setParticipants(d.presence);
        if (d?.activePoll) { setActivePoll(d.activePoll); setPollResult(null); setUserVotedOptionId(null); }
        if (d?.raisedHands) {
          const hs = new Set<string>((d.raisedHands as any[]).map((h: any) => h.userId));
          setRaisedHands(hs);
          setHandRaised(hs.has(grant.participantId));
        }
        if (d?.audioRequests) {
          setAudioRequests((d.audioRequests as any[]).filter((r: any) => r.status === 'pending'));
        }
        if (isHost && d?.presence) {
          for (const p of d.presence) {
            if (p.userId !== grant.participantId && p.role !== 'host') {
              void rm.connectToAttendee(p.userId);
            }
          }
        }
      };

      sig.onParticipantJoined = (userId, userName, role) => {
        setParticipants(prev => {
          const without = prev.filter(p => p.userId !== userId);
          return [...without, { userId, userName, role, online: true }];
        });
        if (isHost && userId !== grant.participantId) void rm.connectToAttendee(userId);
      };
      sig.onParticipantLeft = (userId) => {
        setParticipants(prev => prev.filter(p => p.userId !== userId));
        setRaisedHands(prev => { const n = new Set(prev); n.delete(userId); return n; });
      };

      sig.onHandRaised = (userId, _name, raised) => {
        setRaisedHands(prev => { const n = new Set(prev); raised ? n.add(userId) : n.delete(userId); return n; });
        if (userId === grant.participantId) setHandRaised(raised);
      };

      sig.onAudioRequested = (req) => {
        if (canModerate) setAudioRequests(prev => [...prev.filter(r => r.userId !== req.userId), req]);
      };
      sig.onAudioApproved = ({ userId }) => {
        if (userId === grant.participantId) {
          setAudioState('approved');
          void handlePublishAudio();
        }
        setAudioRequests(prev => prev.filter(r => r.userId !== userId));
      };
      sig.onAudioDenied = ({ userId }) => {
        if (userId === grant.participantId) setAudioState('denied');
        setAudioRequests(prev => prev.filter(r => r.userId !== userId));
      };

      // Force mute from host
      sig.onForceMuted = ({ userId, muted }) => {
        if (userId === grant.participantId) {
          rm.muteAudio(muted);
          setMicMuted(muted);
        }
      };

      sig.onRoleChanged = (data: any) => {
        if (data?.userId) {
          setParticipants(prev => prev.map(p => p.userId === data.userId ? { ...p, role: data.role } : p));
        }
      };

      // Polls
      sig.onPollCreated = (p) => { setActivePoll(p); setPollResult(null); setUserVotedOptionId(null); };
      sig.onPollResult  = setPollResult;
      sig.onPollClosed  = () => setActivePoll(null);

      // Q&A
      sig.onQuestionPending  = (q)  => setQuestions(prev => [...prev, q]);
      sig.onQuestionApproved = (q)  => setQuestions(prev => prev.map(x => x.id === q.id ? q : x));
      sig.onQuestionRejected = (d)  => setQuestions(prev => prev.map(x => x.id === d.id ? { ...x, status: 'rejected' as const } : x));
      sig.onQuestionAnswered = (q)  => setQuestions(prev => prev.map(x => x.id === q.id ? q : x));
      sig.onQuestionUpvoted  = (d)  => setQuestions(prev => prev.map(x => x.id === d.id ? { ...x, upvotes: d.upvotes } : x));

      roomRef.current = rm;
      await rm.join();
    }

    void start();
    return () => { cancelled = true; roomRef.current?.leave(); };
  }, [grant, isHost]);

  // ── Sidebar ────────────────────────────────────────────────────────────────
  function handleTabClick(tab: SideTab) {
    if (sidebarOpen && activeTab === tab) { setSidebarOpen(false); }
    else { setActiveTab(tab); setSidebarOpen(true); if (tab === 'chat') setUnreadChat(0); }
  }

  // ── Screen share ──────────────────────────────────────────────────────────
  const toggleShare = async () => {
    const rm = roomRef.current;
    if (!rm) return;
    if (sharing) { rm.stopScreenShare(); setSharing(false); }
    else { const ok = await rm.publishScreenShare(); setSharing(ok); }
  };

  // ── Hand ──────────────────────────────────────────────────────────────────
  const toggleHand = () => {
    const sig = roomRef.current?.getSignalClient();
    if (!sig) return;
    if (handRaised) { sig.lowerHand(); setHandRaised(false); }
    else { sig.raiseHand(); setHandRaised(true); }
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  if (diagError) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <AlertCircle size={48} color="var(--error-color)" />
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 360 }}>{diagError}</p>
        <button className="btn btn-primary" onClick={handleLeave}>Go Back</button>
      </div>
    );
  }

  if (!diagDone) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Loader2 size={40} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--text-muted)' }}>Running pre-join checks…</p>
        <style>{`@keyframes spin{100%{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const sig = roomRef.current?.getSignalClient();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#06060e' }}>
      <style>{`
        @keyframes spin     { to { transform:rotate(360deg); } }
        @keyframes pulse    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.15)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .ctrl-btn {
          display:inline-flex; align-items:center; justify-content:center; gap:6px;
          padding:0 12px; height:36px; border-radius:8px;
          border:1px solid rgba(255,255,255,0.13); background:rgba(255,255,255,0.07);
          color:var(--text-muted); font-size:12px; font-weight:600; cursor:pointer;
          transition:background .15s,border-color .15s,color .15s; white-space:nowrap;
        }
        .ctrl-btn:hover:not(:disabled) { background:rgba(255,255,255,0.13); color:#fff; }
        .ctrl-btn:disabled { opacity:.5; cursor:not-allowed; }
      `}</style>

      {/* Reconnect overlay */}
      {reconnecting && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <RotateCcw size={38} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#fff', fontWeight: 600 }}>Reconnecting…</p>
          <button className="btn btn-secondary" onClick={handleLeave}>Leave Session</button>
        </div>
      )}

      {/* Audio-approved toast */}
      {audioState === 'approved' && !isHost && (
        <div style={{ position: 'fixed', bottom: 20, right: 70, zIndex: 40, maxWidth: 300, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', animation: 'fadeInUp 0.3s ease' }}>
          <Mic size={16} color="#10b981" />
          <p style={{ fontSize: 13, color: '#10b981', fontWeight: 600, lineHeight: 1.3 }}>Audio approved! Use Unmute to speak.</p>
        </div>
      )}

      {/* Top bar */}
      <div style={{ flexShrink: 0, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, animation: 'pulse 2s infinite' }}/>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Live Session</span>
          {isHost && (
            <span style={{ fontSize: 11, background: 'rgba(37,99,235,0.18)', color: BLUE,
              padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>HOST</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{state}</span>
        </div>
        <div /> {/* spacer */}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Stage */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Video area */}
          <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            {!sharing && state === PeerState.CONNECTED && (
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(124,58,237,0.1)', border: '2px solid rgba(124,58,237,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Monitor size={30} color="var(--primary-color)" />
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 15, fontWeight: 500, textAlign: 'center', maxWidth: 280 }}>
                  {isHost ? 'Click "Share Screen" below to start presenting' : 'Waiting for host to share screen…'}
                </p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', background: 'rgba(6,6,16,0.98)', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>

            {/* Audio button */}
            {isHost ? (
              /* Host always has a mic */
              null
            ) : audioState === 'approved' ? (
              <button
                onClick={handleToggleMic} className="ctrl-btn"
                style={micMuted ? { background: 'rgba(239,68,68,0.18)', borderColor: 'rgba(239,68,68,0.45)', color: '#ef4444' } : {}}
              >
                {micMuted ? <MicOff size={14} /> : <Mic size={14} />}
                <span>{micMuted ? 'Unmute' : 'Mute'}</span>
              </button>
            ) : audioState === 'pending' ? (
              <button disabled className="ctrl-btn" style={{ opacity: 0.55 }}><Mic size={14} /><span>Requested…</span></button>
            ) : (
              <button onClick={handleRequestAudio} className="ctrl-btn"><Mic size={14} /><span>Request Audio</span></button>
            )}

            <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)', margin: '0 4px', flexShrink: 0 }} />

            {/* Screen share — host/presenter */}
            {isHost && (
              <button onClick={toggleShare} className="ctrl-btn" style={sharing ? { background: 'rgba(239,68,68,0.18)', borderColor: 'rgba(239,68,68,0.45)', color: '#ef4444' } : {}}>
                {sharing ? <StopCircle size={14} /> : <Monitor size={14} />}
                <span>{sharing ? 'Stop Share' : 'Share Screen'}</span>
              </button>
            )}

            {/* Hand raise */}
            <button onClick={toggleHand} className="ctrl-btn" style={handRaised ? { background: 'rgba(234,179,8,0.18)', borderColor: 'rgba(234,179,8,0.45)', color: '#eab308' } : {}}>
              <Hand size={14} /><span>{handRaised ? 'Lower Hand' : 'Raise Hand'}</span>
            </button>

            <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)', margin: '0 4px', flexShrink: 0 }} />

            {/* Leave */}
            <button onClick={handleLeave} className="ctrl-btn" style={{ background: 'rgba(239,68,68,0.14)', borderColor: 'rgba(239,68,68,0.38)', color: '#ef4444' }}>
              <Square size={14} /><span>{isHost ? 'End Session' : 'Leave'}</span>
            </button>
          </div>
        </div>

        {/* Sidebar panel */}
        {sidebarOpen && (
          <div style={{ width: 300, flexShrink: 0, background: 'rgba(8,8,18,0.98)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <SidebarHeader label={STRIP_TABS.find(t => t.id === activeTab)?.label ?? ''} onClose={() => setSidebarOpen(false)} />
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {activeTab === 'chat' && <ChatPanel messages={chatMessages} onSend={m => sig?.sendChat(m)} />}
              {activeTab === 'participants' && (
                <PeoplePanel
                  participants={participants} raisedHands={raisedHands}
                  audioRequests={audioRequests} isHost={isHost}
                  canModerate={canModerate} sessionId={grant.roomId}
                  myId={grant.participantId}
                  onApproveAudio={uid => sig?.approveAudio(uid)}
                  onDenyAudio={uid => sig?.denyAudio(uid)}
                  onForceMute={handleForceMute}
                  onPromote={(uid, role) => {
                    setParticipants(prev => prev.map(p => p.userId === uid ? { ...p, role } : p));
                  }}
                />
              )}
              {activeTab === 'polls' && (
                <PollPanel
                  isHost={isHost} sessionId={grant.roomId}
                  activePoll={activePoll} pollResult={pollResult}
                  onCreatePoll={(q, o) => sig?.createPoll(q, o)}
                  onVote={(pid, oid) => { sig?.votePoll(pid, oid); setUserVotedOptionId(oid); }}
                  onClosePoll={pid => sig?.closePoll(pid)}
                  userVotedOptionId={userVotedOptionId}
                />
              )}
              {activeTab === 'qa' && (
                <QAPanel
                  role={isHost ? 'host' as any : 'attendee' as any}
                  userId={grant.participantId}
                  questions={questions.filter(q => q.status !== 'rejected') as any}
                  onSubmitQuestion={t => sig?.submitQuestion(t)}
                  onApprove={id => sig?.approveQuestion(id)}
                  onReject={id => sig?.rejectQuestion(id)}
                  onAnswer={(id, a) => sig?.answerQuestion(id, a)}
                  onUpvote={id => sig?.upvoteQuestion(id)}
                />
              )}
            </div>
          </div>
        )}

        {/* Icon strip — always visible */}
        <IconStrip
          activeTab={activeTab} sidebarOpen={sidebarOpen}
          onTabClick={handleTabClick}
          unreadChat={unreadChat} audioRequestCount={audioRequests.length}
        />
      </div>
    </div>
  );
}
