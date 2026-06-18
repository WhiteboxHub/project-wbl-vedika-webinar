import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  GridLayout,
  ParticipantTile,
  ControlBar,
  useParticipants,
  useTracks,
  useLocalParticipant,
  useConnectionState,
  useRoomContext,
} from '@livekit/components-react';
import { ConnectionState, Track, ConnectionQuality, DisconnectReason } from 'livekit-client';
import '@livekit/components-styles';
import {
  Loader2, MicOff, UserX, Square, Users,
  MessageSquare, Hand, AlertCircle, Monitor, StopCircle,
  BarChart2, HelpCircle, RotateCcw, CheckCircle,
} from 'lucide-react';
import { removeParticipant, muteParticipant } from '../lib/api';
import { loadClassroomSession, clearClassroomSession, getLiveKitUrl, getSignalServerUrl } from '../lib/classroom-session';
import { SignalingClient, ReactionType } from '../lib/signaling';
import { startScreenShare, stopScreenShare } from '../lib/screen-share';
import PollPanel, { PollData, PollResult } from './classroom/PollPanel';
import QAPanel, { QuestionData } from './classroom/QAPanel';
import ReactionBar from './classroom/ReactionBar';

type SideTab = 'chat' | 'participants' | 'polls' | 'qa';
type Role = 'host' | 'presenter' | 'moderator' | 'attendee';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function qualityColor(q: ConnectionQuality | undefined): string {
  if (q === ConnectionQuality.Excellent) return '#10b981';
  if (q === ConnectionQuality.Good) return '#f59e0b';
  return '#ef4444';
}

function qualityLabel(q: ConnectionQuality | undefined): string {
  if (q === ConnectionQuality.Excellent) return 'Excellent';
  if (q === ConnectionQuality.Good) return 'Good';
  return 'Poor';
}

// ─── Participant List ─────────────────────────────────────────────────────────

function ParticipantList({ isHost, sessionId, raisedHands }: { isHost: boolean; sessionId: string; raisedHands: Set<string> }) {
  const participants = useParticipants();
  // isSpeaking is a live property on the Participant object
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Participants ({participants.length})
      </p>
      {participants.map(p => {
        const handUp = raisedHands.has(p.identity);
        return (
          <div key={p.identity} style={{ padding: '9px', borderRadius: '10px', marginBottom: '5px', background: (p as any).isSpeaking ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.04)', border: `1px solid ${(p as any).isSpeaking ? 'rgba(16,185,129,0.35)' : 'var(--border-color)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: (p as any).isSpeaking ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,var(--primary-color),var(--secondary-color))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0, boxShadow: (p as any).isSpeaking ? '0 0 0 2px rgba(16,185,129,0.4)' : 'none', transition: 'all 0.2s' }}>
                {(p.name || p.identity || '?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{p.name || p.identity}</span>
                  {handUp && <span title="Hand raised">✋</span>}
                  {(p as any).isSpeaking && <span style={{ fontSize: '10px', background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '1px 5px', borderRadius: '8px' }}>Speaking</span>}
                  {p.isLocal && <span style={{ fontSize: '10px', background: 'rgba(124,58,237,0.2)', color: 'var(--primary-color)', padding: '1px 5px', borderRadius: '8px' }}>You</span>}
                </div>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
                  {p.isMicrophoneEnabled ? '🎙' : '🔇'}{p.isCameraEnabled ? ' 📹' : ''}
                  {(p as any).connectionQuality !== ConnectionQuality.Unknown
                    ? <span style={{ color: qualityColor((p as any).connectionQuality) }}> · {qualityLabel((p as any).connectionQuality)}</span>
                    : null}
                </p>
              </div>
            </div>
            {isHost && !p.isLocal && (
              <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                <button title="Mute" onClick={() => { const t = [...p.trackPublications.values()].find(t => t.kind === Track.Kind.Audio); if (t) muteParticipant(sessionId, p.identity, t.trackSid); }} style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <MicOff size={10} />
                </button>
                <button title="Remove" onClick={() => window.confirm(`Remove ${p.name}?`) && removeParticipant(sessionId, p.identity)} style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                  <UserX size={10} />
                </button>
              </div>
            )}
          </div>
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {messages.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>No messages yet</p>}
        {messages.map((m, i) => (
          <div key={m.id || i} style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '2px' }}>
              <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--primary-color)' }}>{m.userName}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            </div>
            <p style={{ fontSize: '13px', lineHeight: 1.4 }}>{m.message}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} style={{ borderTop: '1px solid var(--border-color)', padding: '10px', display: 'flex', gap: '7px' }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message…" style={{ flex: 1, padding: '8px 11px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontSize: '13px', outline: 'none' }} />
        <button type="submit" style={{ padding: '8px 13px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Send</button>
      </form>
    </div>
  );
}

// ─── Stage ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Stage({ isHost, isPresenter, onLeave, sessionId: _sid, raisedHands: _rh }: { isHost: boolean; isPresenter: boolean; onLeave: () => void; sessionId: string; raisedHands: Set<string> }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const [handRaised, setHandRaised] = useState(false);
  const [sharing, setSharing] = useState(false);

  const connecting = connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting;
  const connected = connectionState === ConnectionState.Connected;
  const canShare = isHost || isPresenter;

  const toggleHand = () => {
    try {
      const meta = JSON.parse(localParticipant?.metadata || '{}');
      meta.handRaised = !meta.handRaised;
      localParticipant?.setMetadata(JSON.stringify(meta));
      setHandRaised(meta.handRaised);
    } catch { /* ignore */ }
  };

  const toggleShare = async () => {
    if (!room) return;
    if (sharing) { await stopScreenShare(room); setSharing(false); }
    else { const ok = await startScreenShare(room); if (ok) setSharing(true); }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', background: '#060610' }}>
      {connecting && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.78)', gap: '14px' }}>
          <Loader2 size={38} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#fff', fontWeight: 600 }}>Connecting to room…</p>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {connected && tracks.length > 0 ? (
          <GridLayout tracks={tracks} style={{ width: '100%', height: '100%' }}>
            <ParticipantTile />
          </GridLayout>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(124,58,237,0.1)', border: '2px solid rgba(124,58,237,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={32} color="var(--primary-color)" />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{connected ? 'No cameras yet' : 'Joining…'}</p>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '10px 16px',
        background: 'rgba(6,6,16,0.98)',
        borderTop: '1px solid var(--border-color)',
        flexWrap: 'wrap',
      }}>
        {/* LiveKit mic / camera buttons */}
        <div className="lk-ctrl-wrap">
          <ControlBar
            variation="minimal"
            controls={{ microphone: true, camera: isHost || isPresenter, screenShare: false, leave: false }}
          />
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)', margin: '0 4px', flexShrink: 0 }} />

        {canShare && (
          <button onClick={toggleShare} className="ctrl-btn" style={{
            background: sharing ? 'rgba(239,68,68,0.18)' : undefined,
            borderColor: sharing ? 'rgba(239,68,68,0.45)' : undefined,
            color: sharing ? '#ef4444' : undefined,
          }}>
            {sharing ? <StopCircle size={14} /> : <Monitor size={14} />}
            <span>{sharing ? 'Stop Share' : 'Share Screen'}</span>
          </button>
        )}

        <button onClick={toggleHand} className="ctrl-btn" style={{
          background: handRaised ? 'rgba(234,179,8,0.18)' : undefined,
          borderColor: handRaised ? 'rgba(234,179,8,0.45)' : undefined,
          color: handRaised ? '#eab308' : undefined,
        }}>
          <Hand size={14} />
          <span>{handRaised ? 'Lower Hand' : 'Raise Hand'}</span>
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)', margin: '0 4px', flexShrink: 0 }} />

        <button onClick={onLeave} className="ctrl-btn ctrl-btn-danger">
          <Square size={14} />
          <span>{isHost ? 'End Session' : 'Leave'}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main Classroom ───────────────────────────────────────────────────────────



export default function Classroom() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const sessionData = useMemo(
    () => (location.state as any) || (roomId ? loadClassroomSession(roomId) : null),
    [roomId],
  );

  const liveKitToken: string = sessionData?.liveKitToken || '';
  const livekitUrl: string = sessionData?.livekitUrl || getLiveKitUrl();
  const isHost: boolean = sessionData?.isHost || false;
  const sessionId: string = sessionData?.sessionId || '';
  const participantName: string = sessionData?.participantName || '';
  const role: Role = isHost ? 'host' : 'attendee';
  const isPresenter = false; // future: derive from token metadata

  /**
   * signalToken: app JWT used exclusively for the signal gateway (JWT_SECRET).
   * Falls back to liveKitToken if absent for backward compat during rolling deploy,
   * but that will fail gateway auth — the UI will just show no chat/polls.
   */
  const signalToken: string = sessionData?.signalToken || liveKitToken;

  const [activeTab, setActiveTab] = useState<SideTab>('chat');
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null); // non-fatal, shown as toast

  // ── Reconnect state machine ──────────────────────────────────────────────
  // 'connected' | 'reconnecting' | 'ended'
  const [connStatus, setConnStatus] = useState<'connected' | 'reconnecting' | 'ended'>('connected');
  const [reconnectCount, setReconnectCount] = useState(0);

  // Set to true ONLY when the user explicitly clicks "Leave" / "End Session".
  // CLIENT_INITIATED from React StrictMode cleanup must NOT navigate away.
  const userInitiatedLeaveRef = useRef(false);

  // Signal state
  const sigRef = useRef<SignalingClient | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [incomingReactions, setIncomingReactions] = useState<any[]>([]);
  const [activePoll, setActivePoll] = useState<PollData | null>(null);
  const [pollResult, setPollResult] = useState<PollResult | null>(null);
  const [userVotedOptionId, setUserVotedOptionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);

  useEffect(() => {
    if (!signalToken || !roomId) return;

    const sig = new SignalingClient(getSignalServerUrl());
    sigRef.current = sig;

    sig.onConnected = () => {
      setConnStatus('connected');
      // Use signalToken (app JWT) — NOT liveKitToken — so the gateway can validate it
      sig.joinRoom(roomId, signalToken, participantName, role);
    };
    sig.onDisconnected = () => {
      setConnStatus(prev => prev === 'ended' ? 'ended' : 'reconnecting');
      setReconnectCount(c => c + 1);
    };

    sig.onRoomState = (d) => {
      if (d?.history) setChatMessages(d.history);
      if (d?.activePoll) setActivePoll(d.activePoll);
    };
    sig.onChat = (id, userId, userName, message, timestamp) => {
      setChatMessages(prev => [...prev, { id, userId, userName, message, timestamp }]);
    };
    sig.onHandRaised = (userId, _userName, raised) => {
      setRaisedHands(prev => { const n = new Set(prev); raised ? n.add(userId) : n.delete(userId); return n; });
    };
    sig.onReaction = (userId, userName, type, timestamp) => {
      setIncomingReactions(prev => [...prev.slice(-20), { userId, userName, type, timestamp }]);
    };
    sig.onPollCreated = (p) => { setActivePoll(p); setPollResult(null); setUserVotedOptionId(null); };
    sig.onPollResult = setPollResult;
    sig.onPollClosed = () => { setActivePoll(null); };
    sig.onQuestionPending = (q) => setQuestions(prev => [...prev, q]);
    sig.onQuestionApproved = (q) => setQuestions(prev => prev.map(x => x.id === q.id ? q : x));
    sig.onQuestionRejected = (d) => setQuestions(prev => prev.map(x => x.id === d.id ? { ...x, status: 'rejected' as const } : x));
    sig.onQuestionAnswered = (q) => setQuestions(prev => prev.map(x => x.id === q.id ? q : x));
    sig.onQuestionUpvoted = (d) => setQuestions(prev => prev.map(x => x.id === d.id ? { ...x, upvotes: d.upvotes } : x));

    // 'session-ended' is broadcast by the API when host calls endSession.
    // SignalingClient also stops auto-reconnecting when it receives this event.
    sig.onSessionEnded = () => setConnStatus('ended');

    sig.connect();
    return () => { sig.disconnect(); };
  }, [signalToken, roomId]);

  const handleSendChat = useCallback((m: string) => sigRef.current?.sendChat(m), []);
  const handleReact = useCallback((t: ReactionType) => sigRef.current?.sendReaction(t), []);
  const handleCreatePoll = useCallback((q: string, o: string[]) => sigRef.current?.createPoll(q, o), []);
  const handleVote = useCallback((pollId: string, optionId: string) => { sigRef.current?.votePoll(pollId, optionId); setUserVotedOptionId(optionId); }, []);
  const handleClosePoll = useCallback((id: string) => sigRef.current?.closePoll(id), []);
  const handleSubmitQ = useCallback((t: string) => sigRef.current?.submitQuestion(t), []);
  const handleApproveQ = useCallback((id: string) => sigRef.current?.approveQuestion(id), []);
  const handleRejectQ = useCallback((id: string) => sigRef.current?.rejectQuestion(id), []);
  const handleAnswerQ = useCallback((id: string, a: string) => sigRef.current?.answerQuestion(id, a), []);
  const handleUpvoteQ = useCallback((id: string) => sigRef.current?.upvoteQuestion(id), []);

  /** Called when the user explicitly clicks "End Session" or "Leave" */
  function handleLeave() {
    userInitiatedLeaveRef.current = true;
    if (roomId) clearClassroomSession(roomId);
    navigate(isHost ? '/dashboard' : '/');
  }

  /**
   * Called by LiveKitRoom's onDisconnected.
   *
   * Strategy:
   *   - User clicked Leave (userInitiatedLeaveRef) → navigate away
   *   - DUPLICATE_IDENTITY / ROOM_DELETED → navigate away
   *   - CLIENT_INITIATED without user action = React StrictMode cleanup in dev
   *     → show reconnecting overlay, let LiveKit SDK auto-reconnect
   *   - Everything else (ICE fail, network blip) → reconnecting overlay
   */
  function handleLkDisconnected(reason?: DisconnectReason) {
    if (connStatus === 'ended') {
      // session-ended was already received from signal — navigate
      if (roomId) clearClassroomSession(roomId);
      navigate(isHost ? '/dashboard' : '/');
      return;
    }

    // Only navigate on CLIENT_INITIATED if the user actually clicked Leave.
    // React StrictMode fires CLIENT_INITIATED during cleanup — we must ignore that.
    const isUserLeave = userInitiatedLeaveRef.current;
    const isServerEnded =
      reason === DisconnectReason.DUPLICATE_IDENTITY ||
      reason === DisconnectReason.ROOM_DELETED;

    if (isUserLeave || isServerEnded) {
      if (roomId) clearClassroomSession(roomId);
      navigate(isHost ? '/dashboard' : '/');
    } else {
      // Transient failure OR StrictMode cleanup — show reconnecting overlay
      setConnStatus('reconnecting');
      setReconnectCount(c => c + 1);
    }
  }

  // ── No token guard ────────────────────────────────────────────────────────
  if (!liveKitToken) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <AlertCircle size={48} color="var(--error-color)" />
        <p style={{ color: 'var(--text-muted)' }}>Session expired or invalid link.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Go Home</button>
      </div>
    );
  }

  // ── Session ended screen (host ended via endSession API) ──────────────────
  if (connStatus === 'ended') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '20px', textAlign: 'center' }}>
        <CheckCircle size={56} color="#10b981" />
        <h2 style={{ fontSize: '22px' }}>Session has ended</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '360px' }}>
          {isHost ? 'You ended this session.' : 'The host has ended this session.'}
        </p>
        <button className="btn btn-primary" onClick={() => { if (roomId) clearClassroomSession(roomId); navigate(isHost ? '/dashboard' : '/'); }}>
          {isHost ? 'Back to Dashboard' : 'Go Home'}
        </button>
      </div>
    );
  }

  // ── LiveKit connection error ───────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '20px', textAlign: 'center' }}>
        <AlertCircle size={48} color="var(--error-color)" />
        <h2 style={{ color: '#ef4444' }}>Connection Failed</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '400px' }}>{error}</p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => setError(null)}>Retry</button>
          <button className="btn btn-primary" onClick={handleLeave}>{isHost ? 'Back to Dashboard' : 'Go Home'}</button>
        </div>
      </div>
    );
  }

  const TABS: { id: SideTab; label: string; icon: React.ReactNode }[] = [
    { id: 'chat', label: 'Chat', icon: <MessageSquare size={13} /> },
    { id: 'participants', label: 'People', icon: <Users size={13} /> },
    { id: 'polls', label: 'Polls', icon: <BarChart2 size={13} /> },
    { id: 'qa', label: 'Q&A', icon: <HelpCircle size={13} /> },
  ];

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#06060e' }}>
      <LiveKitRoom
        token={liveKitToken}
        serverUrl={livekitUrl}
        video={false}
        audio={false}
        connect={true}
        data-lk-theme="default"
        options={{
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            simulcast: true,
          },
        }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
        onDisconnected={handleLkDisconnected}
        onError={(err) => {
          const msg = (err?.message ?? '').toLowerCase();

          // ── Ignore disconnect-flavoured messages ──────────────────────────
          // LiveKit fires these through onError during StrictMode cleanup or
          // normal room teardown. onDisconnected already handles them.
          if (
            msg.includes('client initiated') ||
            msg.includes('duplicate identity') ||
            msg.includes('room deleted') ||
            msg.includes('room not found')
          ) return;

          // ── Camera / mic errors → non-fatal toast ─────────────────────────
          // These don't kill the connection — the host can still present and
          // use chat/polls. Show a dismissible notice instead of a full error screen.
          if (
            msg.includes('video source') ||
            msg.includes('audio source') ||
            msg.includes('could not start') ||
            msg.includes('permission denied') ||
            msg.includes('notallowederror') ||
            msg.includes('notfounderror') ||
            msg.includes('notreadableerror')
          ) {
            setCameraError(err.message);
            return;
          }

          // ── Everything else → fatal error screen ──────────────────────────
          setError(err.message);
        }}
      >
        {/* Reconnecting overlay — shown on transient failures, NOT on intentional leave */}
        {connStatus === 'reconnecting' && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <RotateCcw size={38} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#fff', fontWeight: 600 }}>Reconnecting… (attempt {reconnectCount})</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Please wait — this usually resolves in a few seconds.</p>
            <button className="btn btn-secondary" onClick={handleLeave}>Leave Session</button>
          </div>
        )}

        {/* Camera / mic error toast — non-fatal, dismissible */}
        {cameraError && (
          <div style={{ position: 'fixed', bottom: '20px', left: '20px', zIndex: 40, maxWidth: '340px', background: 'rgba(20,10,40,0.97)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: '12px', padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <AlertCircle size={18} color="#eab308" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: '13px', color: '#eab308', marginBottom: '4px' }}>Camera / mic unavailable</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Could not access your camera or microphone. You can still use chat, polls, and Q&amp;A.
                Click the 🎙 button in the controls to try again.
              </p>
            </div>
            <button onClick={() => setCameraError(null)} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px' }}>✕</button>
          </div>
        )}

        {/* Top bar */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: 'rgba(6,6,16,0.98)', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
            <span style={{ fontWeight: 700, fontSize: '14px' }}>Live Session</span>
            {isHost && <span style={{ fontSize: '11px', background: 'rgba(124,58,237,0.2)', color: 'var(--primary-color)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>HOST</span>}
          </div>

          <ReactionBar onReact={handleReact} incomingReactions={incomingReactions} />

          <div style={{ display: 'flex', gap: '3px' }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '5px 9px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, background: activeTab === tab.id ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.05)', color: activeTab === tab.id ? 'var(--primary-color)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          <Stage isHost={isHost} isPresenter={isPresenter} onLeave={handleLeave} sessionId={sessionId} raisedHands={raisedHands} />

          {/* Sidebar */}
          <div style={{ width: '295px', flexShrink: 0, background: 'rgba(8,8,18,0.98)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {activeTab === 'chat' && <ChatPanel messages={chatMessages} onSend={handleSendChat} />}
              {activeTab === 'participants' && <ParticipantList isHost={isHost} sessionId={sessionId} raisedHands={raisedHands} />}
              {activeTab === 'polls' && (
                <PollPanel isHost={isHost} sessionId={sessionId} activePoll={activePoll} pollResult={pollResult} onCreatePoll={handleCreatePoll} onVote={handleVote} onClosePoll={handleClosePoll} userVotedOptionId={userVotedOptionId} />
              )}
              {activeTab === 'qa' && (
                <QAPanel role={role as any} userId={sessionId} questions={questions.filter(q => q.status !== 'rejected') as any} onSubmitQuestion={handleSubmitQ} onApprove={handleApproveQ} onReject={handleRejectQ} onAnswer={handleAnswerQ} onUpvote={handleUpvoteQ} />
              )}
            </div>
          </div>
        </div>

        <RoomAudioRenderer />
      </LiveKitRoom>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.6; transform:scale(1.15); } }

        /* ── LiveKit control bar overrides ───────────────────────────── */
        .lk-ctrl-wrap { display:flex; align-items:center; }
        .lk-control-bar {
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
          gap: 6px !important;
        }
        /* minimal variation: icon-only buttons — size them like our ctrl-btn */
        .lk-button {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-width: 40px !important;
          height: 36px !important;
          padding: 0 10px !important;
          background: rgba(255,255,255,0.08) !important;
          border: 1px solid rgba(255,255,255,0.12) !important;
          border-radius: 8px !important;
          color: #fff !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          gap: 5px !important;
          transition: background 0.15s, border-color 0.15s !important;
        }
        .lk-button:hover { background: rgba(255,255,255,0.15) !important; }
        .lk-button[aria-pressed="true"],
        .lk-button[data-lk-source="microphone"][aria-pressed="true"],
        .lk-button[data-lk-source="camera"][aria-pressed="true"] {
          background: rgba(239,68,68,0.18) !important;
          border-color: rgba(239,68,68,0.4) !important;
          color: #ef4444 !important;
        }

        /* ── Custom control buttons (Share / Hand / Leave) ───────────── */
        .ctrl-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 0 12px;
          height: 36px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.13);
          background: rgba(255,255,255,0.07);
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
          white-space: nowrap;
        }
        .ctrl-btn:hover { background: rgba(255,255,255,0.13); color: #fff; }
        .ctrl-btn span { line-height: 1; }

        .ctrl-btn-danger {
          background: rgba(239,68,68,0.14) !important;
          border-color: rgba(239,68,68,0.38) !important;
          color: #ef4444 !important;
        }
        .ctrl-btn-danger:hover { background: rgba(239,68,68,0.25) !important; }

        /* ── Video grid ──────────────────────────────────────────────── */
        .lk-grid-layout { background: transparent !important; }
        .lk-participant-tile { border-radius: 12px !important; overflow: hidden !important; }
        .lk-participant-placeholder { background: rgba(124,58,237,0.15) !important; }
      `}</style>
    </div>
  );
}
