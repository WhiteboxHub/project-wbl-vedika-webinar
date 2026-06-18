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
import { ConnectionState, Track, ConnectionQuality } from 'livekit-client';
import '@livekit/components-styles';
import {
  Loader2, MicOff, UserX, Square, Users,
  MessageSquare, Hand, AlertCircle, Monitor, StopCircle,
  BarChart2, HelpCircle, RotateCcw,
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

      {/* Controls */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(6,6,16,0.98)', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        <div className="lk-ctrl-wrap">
          <ControlBar variation="verbose" controls={{ microphone: true, camera: isHost || isPresenter, screenShare: false, leave: false }} />
        </div>

        {canShare && (
          <button onClick={toggleShare} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', background: sharing ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.07)', border: `1px solid ${sharing ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.13)'}`, color: sharing ? '#ef4444' : 'var(--text-muted)', fontSize: '12px', fontWeight: 600 }}>
            {sharing ? <StopCircle size={13} /> : <Monitor size={13} />}
            {sharing ? 'Stop Share' : 'Screen Share'}
          </button>
        )}

        <button onClick={toggleHand} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', background: handRaised ? 'rgba(234,179,8,0.18)' : 'rgba(255,255,255,0.07)', border: `1px solid ${handRaised ? 'rgba(234,179,8,0.45)' : 'rgba(255,255,255,0.13)'}`, color: handRaised ? '#eab308' : 'var(--text-muted)', fontSize: '12px', fontWeight: 600 }}>
          <Hand size={13} /> {handRaised ? 'Lower Hand' : 'Raise Hand'}
        </button>

        <button onClick={onLeave} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.38)', color: '#ef4444', fontSize: '12px', fontWeight: 600 }}>
          <Square size={13} /> {isHost ? 'End Session' : 'Leave'}
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

  const [activeTab, setActiveTab] = useState<SideTab>('chat');
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);

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
    if (!liveKitToken || !roomId) return;

    const sig = new SignalingClient(getSignalServerUrl());
    sigRef.current = sig;

    sig.onConnected = () => { sig.joinRoom(roomId, liveKitToken, participantName, role); };
    sig.onDisconnected = () => { setIsReconnecting(true); setReconnectCount(c => c + 1); };
    sig.onConnected = () => { setIsReconnecting(false); sig.joinRoom(roomId, liveKitToken, participantName, role); };

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

    sig.connect();
    return () => { sig.disconnect(); };
  }, [liveKitToken, roomId]);

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

  function handleLeave() {
    if (roomId) clearClassroomSession(roomId);
    navigate(isHost ? '/dashboard' : '/');
  }

  if (!liveKitToken) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <AlertCircle size={48} color="var(--error-color)" />
        <p style={{ color: 'var(--text-muted)' }}>Session expired or invalid link.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Go Home</button>
      </div>
    );
  }

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
        video={isHost}
        audio={isHost}
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
        onDisconnected={handleLeave}
        onError={(err) => setError(err.message)}
      >
        {/* Reconnect overlay */}
        {isReconnecting && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <RotateCcw size={38} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#fff', fontWeight: 600 }}>Reconnecting to signal server… (attempt {reconnectCount})</p>
            <button className="btn btn-secondary" onClick={handleLeave}>Leave Session</button>
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
        .lk-ctrl-wrap { display:flex; align-items:center; }
        .lk-control-bar { background:transparent!important; border:none!important; padding:0!important; gap:6px!important; }
        .lk-button { background:rgba(255,255,255,0.08)!important; border:1px solid rgba(255,255,255,0.12)!important; border-radius:8px!important; color:#fff!important; width:42px!important; height:36px!important; }
        .lk-button:hover { background:rgba(255,255,255,0.15)!important; }
        .lk-button[aria-pressed="true"] { background:rgba(239,68,68,0.2)!important; border-color:rgba(239,68,68,0.4)!important; color:#ef4444!important; }
        .lk-grid-layout { background:transparent!important; }
        .lk-participant-tile { border-radius:12px!important; overflow:hidden!important; }
        .lk-participant-placeholder { background:rgba(124,58,237,0.15)!important; }
      `}</style>
    </div>
  );
}
