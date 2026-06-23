import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ParticipantTile,
  ControlBar,
  useParticipants,
  useTracks,
  useLocalParticipant,
  useConnectionState,
  useRoomContext,
} from '@livekit/components-react';
import { ConnectionState, Track, ConnectionQuality, DisconnectReason, RoomEvent } from 'livekit-client';
import '@livekit/components-styles';
import {
  Loader2, MicOff, Mic, UserX, Square, Users,
  MessageSquare, Hand, AlertCircle, Monitor, StopCircle,
  BarChart2, HelpCircle, RotateCcw, CheckCircle, Radio,
  ShieldPlus,
} from 'lucide-react';
import {
  removeParticipant, muteParticipant, promoteParticipant,
  startRecording, stopRecording, getRecording,
} from '../lib/api';
import {
  loadWebinarSession, loadClassroomSession, clearClassroomSession,
  getLiveKitUrl, getSignalServerUrl, type WebinarSessionData,
} from '../lib/classroom-session';
import NativeClassroomView from './NativeClassroomView';
import { SignalingClient, ReactionType } from '../lib/signaling';
import { startScreenShare, stopScreenShare, isScreenSharing } from '../lib/screen-share';
import PollPanel, { PollData, PollResult } from './classroom/PollPanel';
import QAPanel, { QuestionData } from './classroom/QAPanel';
import ReactionBar from './classroom/ReactionBar';

const USE_NATIVE_WEBRTC = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_USE_NATIVE_WEBRTC === 'true';

// ─── Types ────────────────────────────────────────────────────────────────────

type SideTab = 'chat' | 'participants' | 'polls' | 'qa';
type AudioState = 'none' | 'pending' | 'approved' | 'denied';
type Role = 'host' | 'presenter' | 'moderator' | 'attendee';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function qualityColor(q: ConnectionQuality | undefined): string {
  if (q === ConnectionQuality.Excellent) return '#10b981';
  if (q === ConnectionQuality.Good) return '#f59e0b';
  return '#ef4444';
}

/** Decode the `sub` claim from a JWT without verifying the signature. */
function jwtSub(token: string): string {
  try {
    return JSON.parse(atob(token.split('.')[1])).sub ?? '';
  } catch {
    return '';
  }
}

// ─── RecBadge ─────────────────────────────────────────────────────────────────

function RecBadge() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
      borderRadius: 6, padding: '3px 8px',
    }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', animation: 'recPulse 1.4s ease infinite' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', letterSpacing: '0.06em' }}>REC</span>
    </div>
  );
}

// ─── Icon Strip ───────────────────────────────────────────────────────────────

const STRIP_TABS: { id: SideTab; label: string; icon: React.ReactNode }[] = [
  { id: 'chat',         label: 'Chat',    icon: <MessageSquare size={16} /> },
  { id: 'participants', label: 'People',  icon: <Users size={16} /> },
  { id: 'polls',        label: 'Polls',   icon: <BarChart2 size={16} /> },
  { id: 'qa',           label: 'Q&A',     icon: <HelpCircle size={16} /> },
];

interface IconStripProps {
  activeTab: SideTab;
  sidebarOpen: boolean;
  onTabClick: (tab: SideTab) => void;
  unreadChat: number;
  audioRequestCount: number;
}

function IconStrip({ activeTab, sidebarOpen, onTabClick, unreadChat, audioRequestCount }: IconStripProps) {
  return (
    <div style={{
      width: 52, flexShrink: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 10, gap: 4,
      background: 'rgba(6,6,16,0.98)', borderLeft: '1px solid var(--border-color)',
    }}>
      {STRIP_TABS.map(tab => {
        const isActive = sidebarOpen && activeTab === tab.id;
        const badge =
          tab.id === 'chat' && unreadChat > 0 ? Math.min(unreadChat, 99) :
          tab.id === 'participants' && audioRequestCount > 0 ? audioRequestCount : 0;
        return (
          <button
            key={tab.id}
            title={tab.label}
            onClick={() => onTabClick(tab.id)}
            style={{
              width: 42, height: 42, borderRadius: 10,
              background: isActive ? 'rgba(124,58,237,0.22)' : 'transparent',
              border: isActive ? '1px solid rgba(124,58,237,0.45)' : '1px solid transparent',
              color: isActive ? 'var(--primary-color)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              position: 'relative', transition: 'all 0.15s', outline: 'none',
            }}
          >
            {tab.icon}
            <span style={{ fontSize: 9, lineHeight: 1, fontWeight: 600 }}>{tab.label}</span>
            {badge > 0 && (
              <div style={{
                position: 'absolute', top: 3, right: 3,
                minWidth: 15, height: 15, borderRadius: 8,
                background: tab.id === 'participants' ? '#f59e0b' : '#ef4444',
                fontSize: 9, fontWeight: 700, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', lineHeight: 1,
              }}>
                {badge}
              </div>
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {messages.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>No messages yet</p>}
        {messages.map((m, i) => (
          <div key={m.id || i} style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '2px' }}>
              <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--primary-color)' }}>{m.userName}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
            <p style={{ fontSize: '13px', lineHeight: 1.4 }}>{m.message}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} style={{ borderTop: '1px solid var(--border-color)', padding: '10px', display: 'flex', gap: '7px' }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1, padding: '8px 11px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontSize: '13px', outline: 'none' }}
        />
        <button type="submit" style={{ padding: '8px 13px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>
          Send
        </button>
      </form>
    </div>
  );
}

// ─── Participant List (enhanced) ───────────────────────────────────────────────

interface ParticipantListProps {
  isHost: boolean;
  canModerate: boolean;
  sessionId: string;
  raisedHands: Set<string>;
  audioRequests: any[];
  participantRoles: Map<string, string>;
  myParticipantId: string;
  onApproveAudio: (userId: string) => void;
  onDenyAudio: (userId: string) => void;
  onPromote: (userId: string, role: string) => Promise<void>;
}

function ParticipantList({
  isHost, canModerate, sessionId, raisedHands, audioRequests,
  participantRoles, myParticipantId, onApproveAudio, onDenyAudio, onPromote,
}: ParticipantListProps) {
  const participants = useParticipants();
  const [promoting, setPromoting] = useState<string | null>(null);

  async function handlePromote(userId: string, role: string) {
    setPromoting(userId);
    try { await onPromote(userId, role); } finally { setPromoting(null); }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Participants ({participants.length})
      </p>

      {/* Pending audio requests */}
      {canModerate && audioRequests.length > 0 && (
        <div style={{ marginBottom: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            🎙 Audio Requests ({audioRequests.length})
          </p>
          {audioRequests.map((req: any) => (
            <div key={req.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>{req.userName}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => onApproveAudio(req.userId)}
                  style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.15)', color: '#10b981', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                >
                  Approve
                </button>
                <button
                  onClick={() => onDenyAudio(req.userId)}
                  style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {participants.map(p => {
        const handUp = raisedHands.has(p.identity);
        const role = participantRoles.get(p.identity) ?? 'attendee';
        const isMe = p.identity === myParticipantId;
        const isModerator = role === 'host' || role === 'organizer' || role === 'co_organizer' || role === 'moderator';
        const isAttendee = !isModerator && !isMe;
        const audioTrack = [...p.trackPublications.values()].find(t => t.kind === Track.Kind.Audio && t.trackSid);
        const isMicOn = p.isMicrophoneEnabled;

        return (
          <div
            key={p.identity}
            style={{
              padding: '9px', borderRadius: '10px', marginBottom: '5px',
              background: (p as any).isSpeaking ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${(p as any).isSpeaking ? 'rgba(16,185,129,0.35)' : 'var(--border-color)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                background: (p as any).isSpeaking ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,var(--primary-color),var(--secondary-color))',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 700,
                boxShadow: (p as any).isSpeaking ? '0 0 0 2px rgba(16,185,129,0.4)' : 'none',
                transition: 'all 0.2s',
              }}>
                {(p.name || p.identity || '?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}>
                    {p.name || p.identity}
                  </span>
                  {handUp && <span title="Hand raised">✋</span>}
                  {(p as any).isSpeaking && <span style={{ fontSize: '9px', background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '1px 5px', borderRadius: '8px' }}>Speaking</span>}
                  {isMe && <span style={{ fontSize: '9px', background: 'rgba(124,58,237,0.2)', color: 'var(--primary-color)', padding: '1px 5px', borderRadius: '8px' }}>You</span>}
                  {role === 'host' || role === 'organizer' ? (
                    <span style={{ fontSize: '9px', background: 'rgba(124,58,237,0.18)', color: 'var(--primary-color)', padding: '1px 5px', borderRadius: '8px' }}>Host</span>
                  ) : role === 'co_organizer' || role === 'moderator' ? (
                    <span style={{ fontSize: '9px', background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '1px 5px', borderRadius: '8px' }}>Co-org</span>
                  ) : null}
                </div>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
                  {isMicOn ? '🎙 Mic on' : '🔇 Muted'}
                  {(p as any).connectionQuality !== ConnectionQuality.Unknown && (
                    <span style={{ color: qualityColor((p as any).connectionQuality) }}>
                      {' · '}{(p as any).connectionQuality === ConnectionQuality.Excellent ? 'Excellent' : (p as any).connectionQuality === ConnectionQuality.Good ? 'Good' : 'Poor'}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Host controls */}
            {canModerate && !isMe && (
              <div style={{ display: 'flex', gap: '3px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 80 }}>
                {/* Mute / Unmute */}
                {audioTrack && (
                  <button
                    title={isMicOn ? 'Mute' : 'Unmute'}
                    onClick={() => {
                      if (audioTrack.trackSid) muteParticipant(sessionId, p.identity, audioTrack.trackSid, isMicOn);
                    }}
                    style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isMicOn ? '#ef4444' : '#10b981' }}
                  >
                    {isMicOn ? <MicOff size={10} /> : <Mic size={10} />}
                  </button>
                )}

                {/* Make co-organizer (attendees only) */}
                {isHost && isAttendee && (
                  <button
                    title="Make Co-organizer"
                    disabled={promoting === p.identity}
                    onClick={() => handlePromote(p.identity, 'co_organizer')}
                    style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)', opacity: promoting === p.identity ? 0.5 : 1 }}
                  >
                    {promoting === p.identity ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldPlus size={10} />}
                  </button>
                )}

                {/* Remove */}
                <button
                  title="Remove"
                  onClick={() => window.confirm(`Remove ${p.name || p.identity}?`) && removeParticipant(sessionId, p.identity)}
                  style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}
                >
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

// ─── Stage ────────────────────────────────────────────────────────────────────

interface StageProps {
  isHost: boolean;
  isPresenter: boolean;
  canModerate: boolean;
  onLeave: () => void;
  sessionId: string;
  raisedHands: Set<string>;
  myHandRaised: boolean;
  onRaiseHand: () => void;
  onLowerHand: () => void;
  audioState: AudioState;
  onRequestAudio: () => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  recordingLoading: boolean;
  canRecord: boolean;
}

function Stage({
  isHost, isPresenter, canModerate, onLeave,
  myHandRaised, onRaiseHand, onLowerHand,
  audioState, onRequestAudio,
  isRecording, onToggleRecording, recordingLoading, canRecord,
}: StageProps) {
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: true },
  );
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const [sharing, setSharing] = useState(false);

  const connecting = connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting;
  const connected = connectionState === ConnectionState.Connected;
  const canShare = isHost || isPresenter;

  const activeScreenShare = screenTracks.find(t => !t.participant.isLocal) ?? screenTracks[0] ?? null;

  useEffect(() => {
    if (!room) return;
    const sync = () => setSharing(isScreenSharing(room));
    sync();
    room.on(RoomEvent.LocalTrackPublished, sync);
    room.on(RoomEvent.LocalTrackUnpublished, sync);
    return () => {
      room.off(RoomEvent.LocalTrackPublished, sync);
      room.off(RoomEvent.LocalTrackUnpublished, sync);
    };
  }, [room]);

  const toggleShare = async () => {
    if (!room) return;
    if (sharing) { await stopScreenShare(room); setSharing(false); }
    else { const ok = await startScreenShare(room); if (ok) setSharing(true); }
  };

  const toggleSelfMic = async () => {
    try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); } catch { /* ignore */ }
  };

  const toggleHand = () => {
    if (myHandRaised) onLowerHand(); else onRaiseHand();
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', background: '#060610' }}>
      {connecting && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.78)', gap: '14px' }}>
          <Loader2 size={38} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#fff', fontWeight: 600 }}>Connecting to room…</p>
        </div>
      )}

      {/* Video area */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {connected && activeScreenShare ? (
          <div className="screen-share-stage">
            <ParticipantTile trackRef={activeScreenShare} />
            <div className="screen-share-label">
              <Monitor size={13} />
              <span>{activeScreenShare.participant.name || activeScreenShare.participant.identity}</span>
            </div>
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px', textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(124,58,237,0.1)', border: '2px solid rgba(124,58,237,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {canShare ? <Monitor size={34} color="var(--primary-color)" /> : <Users size={34} color="var(--primary-color)" />}
            </div>
            <p style={{ color: 'var(--text-main)', fontSize: '16px', fontWeight: 600 }}>
              {!connected ? 'Joining session…' : canShare ? 'Ready to present' : 'Waiting for presentation'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '340px', lineHeight: 1.5 }}>
              {!connected
                ? 'Setting up your connection to the webinar room.'
                : canShare
                  ? 'Click "Share Screen" below to start presenting.'
                  : 'The host has not started screen sharing yet. Use the panel icons on the right to chat or ask questions.'}
            </p>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '6px', padding: '10px 16px',
        background: 'rgba(6,6,16,0.98)', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap',
      }}>

        {/* Mic — host/presenter: LiveKit ControlBar; attendee approved: custom toggle */}
        {(isHost || isPresenter || canModerate) ? (
          <div className="lk-ctrl-wrap">
            <ControlBar variation="minimal" controls={{ microphone: true, camera: false, screenShare: false, leave: false }} />
          </div>
        ) : audioState === 'approved' ? (
          <button
            onClick={toggleSelfMic}
            className="ctrl-btn"
            title={isMicrophoneEnabled ? 'Mute yourself' : 'Unmute yourself'}
            style={!isMicrophoneEnabled ? { background: 'rgba(239,68,68,0.18)', borderColor: 'rgba(239,68,68,0.45)', color: '#ef4444' } : {}}
          >
            {isMicrophoneEnabled ? <Mic size={14} /> : <MicOff size={14} />}
            <span>{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span>
          </button>
        ) : audioState === 'pending' ? (
          <button disabled className="ctrl-btn" style={{ opacity: 0.55 }}>
            <Mic size={14} /><span>Requested…</span>
          </button>
        ) : (
          <button onClick={onRequestAudio} className="ctrl-btn" title="Request permission to speak">
            <Mic size={14} /><span>Request Audio</span>
          </button>
        )}

        {/* Divider */}
        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)', margin: '0 4px', flexShrink: 0 }} />

        {/* Share screen */}
        {canShare && (
          <button onClick={toggleShare} className="ctrl-btn" style={sharing ? { background: 'rgba(239,68,68,0.18)', borderColor: 'rgba(239,68,68,0.45)', color: '#ef4444' } : {}}>
            {sharing ? <StopCircle size={14} /> : <Monitor size={14} />}
            <span>{sharing ? 'Stop Share' : 'Share Screen'}</span>
          </button>
        )}

        {/* Hand raise */}
        <button
          onClick={toggleHand} className="ctrl-btn"
          style={myHandRaised ? { background: 'rgba(234,179,8,0.18)', borderColor: 'rgba(234,179,8,0.45)', color: '#eab308' } : {}}
        >
          <Hand size={14} />
          <span>{myHandRaised ? 'Lower Hand' : 'Raise Hand'}</span>
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)', margin: '0 4px', flexShrink: 0 }} />

        {/* Record (host only, LiveKit path only) */}
        {canRecord && (
          <button
            onClick={onToggleRecording}
            disabled={recordingLoading}
            className="ctrl-btn"
            title={isRecording ? 'Stop recording' : 'Start recording'}
            style={isRecording ? { background: 'rgba(239,68,68,0.18)', borderColor: 'rgba(239,68,68,0.45)', color: '#ef4444' } : {}}
          >
            {recordingLoading
              ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              : isRecording ? <StopCircle size={14} /> : <Radio size={14} />}
            <span>{isRecording ? 'Stop Rec' : 'Record'}</span>
          </button>
        )}

        {/* Leave */}
        <button onClick={onLeave} className="ctrl-btn ctrl-btn-danger">
          <Square size={14} />
          <span>{isHost ? 'End Session' : 'Leave'}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar Panel ────────────────────────────────────────────────────────────

function SidebarHeader({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div style={{
      flexShrink: 0, padding: '10px 12px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)',
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2 }}>✕</button>
    </div>
  );
}

// ─── Main Classroom ───────────────────────────────────────────────────────────

export default function Classroom() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Native WebRTC branch
  const nativeSession = USE_NATIVE_WEBRTC
    ? ((location.state as WebinarSessionData) || (roomId ? loadWebinarSession(roomId) : null))
    : null;

  if (USE_NATIVE_WEBRTC && nativeSession?.grant) {
    return <NativeClassroomView grant={nativeSession.grant} isHost={nativeSession.isHost} />;
  }

  // ── Session data ─────────────────────────────────────────────────────────
  const sessionData = useMemo(
    () => (location.state as any) || (roomId ? loadClassroomSession(roomId) : null),
    [roomId],
  );

  const liveKitToken: string  = sessionData?.liveKitToken  || '';
  const livekitUrl: string    = sessionData?.livekitUrl    || getLiveKitUrl();
  const isHost: boolean       = sessionData?.isHost        || false;
  const sessionId: string     = sessionData?.sessionId     || '';
  const participantName: string = sessionData?.participantName || '';
  const role: Role            = isHost ? 'host' : 'attendee';
  const isPresenter           = false;
  const signalToken: string   = sessionData?.signalToken   || liveKitToken;

  /** My signal participant ID (JWT sub claim) */
  const myParticipantId = useMemo(() => jwtSub(signalToken), [signalToken]);

  const canModerate = isHost; // expands when role-changed updates myRole

  // ── UI state ─────────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [activeTab, setActiveTab]           = useState<SideTab>('chat');
  const [unreadChat, setUnreadChat]         = useState(0);
  const [error, setError]                   = useState<string | null>(null);
  const [cameraError, setCameraError]       = useState<string | null>(null);
  const [connStatus, setConnStatus]         = useState<'connected' | 'reconnecting' | 'ended'>('connected');
  const [reconnectCount, setReconnectCount] = useState(0);
  const userInitiatedLeaveRef               = useRef(false);

  // Sidebar open/active tab refs for closure-safe callbacks
  const sidebarOpenRef = useRef(false);
  const activeTabRef   = useRef<SideTab>('chat');
  useEffect(() => { sidebarOpenRef.current = sidebarOpen; }, [sidebarOpen]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // ── Recording state ──────────────────────────────────────────────────────
  const [isRecording, setIsRecording]           = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const canRecord = isHost && !USE_NATIVE_WEBRTC;

  // ── Audio state (attendee) ───────────────────────────────────────────────
  const initialAudio: AudioState = (isHost || isPresenter) ? 'approved' : 'none';
  const [audioState, setAudioState]   = useState<AudioState>(initialAudio);
  const [audioRequests, setAudioRequests] = useState<any[]>([]);

  // ── Role / people state ──────────────────────────────────────────────────
  const [myHandRaised, setMyHandRaised]         = useState(false);
  const [raisedHands, setRaisedHands]           = useState<Set<string>>(new Set());
  const [participantRoles, setParticipantRoles] = useState<Map<string, string>>(new Map());

  // ── Signal state ─────────────────────────────────────────────────────────
  const sigRef          = useRef<SignalingClient | null>(null);
  const [chatMessages, setChatMessages]   = useState<any[]>([]);
  const [incomingReactions, setIncomingReactions] = useState<any[]>([]);
  const [activePoll, setActivePoll]       = useState<PollData | null>(null);
  const [pollResult, setPollResult]       = useState<PollResult | null>(null);
  const [userVotedOptionId, setUserVotedOptionId] = useState<string | null>(null);
  const [questions, setQuestions]         = useState<QuestionData[]>([]);

  // ── Recording restore on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!canRecord || !sessionId) return;
    getRecording(sessionId).then(rec => {
      if (rec?.status === 'recording_active') setIsRecording(true);
    }).catch(() => {});
  }, [canRecord, sessionId]);

  // ── Signal setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!signalToken || !roomId) return;
    const sig = new SignalingClient(getSignalServerUrl());
    sigRef.current = sig;

    sig.onConnected = () => {
      setConnStatus('connected');
      sig.joinRoom(roomId, signalToken, participantName, role);
    };
    sig.onDisconnected = () => {
      setConnStatus(prev => prev === 'ended' ? 'ended' : 'reconnecting');
      setReconnectCount(c => c + 1);
    };

    sig.onRoomState = (d) => {
      if (d?.history)   setChatMessages(d.history);
      if (d?.activePoll) setActivePoll(d.activePoll);
      if (d?.presence) {
        const rm = new Map<string, string>();
        d.presence.forEach((p: any) => rm.set(p.userId, p.role));
        setParticipantRoles(rm);
      }
      if (d?.raisedHands) {
        const hs = new Set<string>((d.raisedHands as any[]).map(h => h.userId));
        setRaisedHands(hs);
        setMyHandRaised(hs.has(myParticipantId));
      }
      if (d?.audioRequests) {
        const pending = (d.audioRequests as any[]).filter(r => r.status === 'pending');
        setAudioRequests(pending);
      }
    };

    sig.onChat = (id, userId, userName, message, timestamp) => {
      setChatMessages(prev => [...prev, { id, userId, userName, message, timestamp }]);
      if (!sidebarOpenRef.current || activeTabRef.current !== 'chat') {
        setUnreadChat(c => c + 1);
      }
    };

    sig.onParticipantJoined = (userId, _userName, role) => {
      setParticipantRoles(prev => new Map(prev).set(userId, role));
    };
    sig.onParticipantLeft = (userId) => {
      setParticipantRoles(prev => { const n = new Map(prev); n.delete(userId); return n; });
      setRaisedHands(prev => { const n = new Set(prev); n.delete(userId); return n; });
    };

    sig.onHandRaised = (userId, _userName, raised) => {
      setRaisedHands(prev => { const n = new Set(prev); raised ? n.add(userId) : n.delete(userId); return n; });
      if (userId === myParticipantId) setMyHandRaised(raised);
    };

    sig.onReaction = (userId, userName, type, timestamp) => {
      setIncomingReactions(prev => [...prev.slice(-20), { userId, userName, type, timestamp }]);
    };

    sig.onPollCreated = (p) => { setActivePoll(p); setPollResult(null); setUserVotedOptionId(null); };
    sig.onPollResult  = setPollResult;
    sig.onPollClosed  = () => { setActivePoll(null); };

    sig.onQuestionPending  = (q) => setQuestions(prev => [...prev, q]);
    sig.onQuestionApproved = (q) => setQuestions(prev => prev.map(x => x.id === q.id ? q : x));
    sig.onQuestionRejected = (d) => setQuestions(prev => prev.map(x => x.id === d.id ? { ...x, status: 'rejected' as const } : x));
    sig.onQuestionAnswered = (q) => setQuestions(prev => prev.map(x => x.id === q.id ? q : x));
    sig.onQuestionUpvoted  = (d) => setQuestions(prev => prev.map(x => x.id === d.id ? { ...x, upvotes: d.upvotes } : x));

    // Audio approval
    sig.onAudioRequested = (req) => {
      if (canModerate) setAudioRequests(prev => [...prev.filter(r => r.userId !== req.userId), req]);
    };
    sig.onAudioApproved = ({ userId }) => {
      if (userId === myParticipantId) setAudioState('approved');
      setAudioRequests(prev => prev.filter(r => r.userId !== userId));
    };
    sig.onAudioDenied = ({ userId }) => {
      if (userId === myParticipantId) setAudioState('denied');
      setAudioRequests(prev => prev.filter(r => r.userId !== userId));
    };

    // Role promotion — update People panel role map
    sig.onRoleChanged = (data: any) => {
      if (data?.userId) setParticipantRoles(prev => new Map(prev).set(data.userId, data.role));
    };

    // Recording status from host broadcast
    sig.onRecordingStatus = ({ isRecording }) => { setIsRecording(isRecording); };

    sig.onSessionEnded = () => setConnStatus('ended');

    sig.connect();
    return () => { sig.disconnect(); };
  }, [signalToken, roomId]);

  // ── Sidebar logic ─────────────────────────────────────────────────────────
  function handleTabClick(tab: SideTab) {
    if (sidebarOpen && activeTab === tab) {
      setSidebarOpen(false);
    } else {
      setActiveTab(tab);
      setSidebarOpen(true);
      if (tab === 'chat') setUnreadChat(0);
    }
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────
  const handleSendChat  = useCallback((m: string) => sigRef.current?.sendChat(m), []);
  const handleReact     = useCallback((t: ReactionType) => sigRef.current?.sendReaction(t), []);
  const handleRaiseHand = useCallback(() => { sigRef.current?.raiseHand(); setMyHandRaised(true); }, []);
  const handleLowerHand = useCallback(() => { sigRef.current?.lowerHand(); setMyHandRaised(false); }, []);
  const handleRequestAudio = useCallback(() => { sigRef.current?.requestAudio(); setAudioState('pending'); }, []);
  const handleApproveAudio = useCallback((userId: string) => { sigRef.current?.approveAudio(userId); }, []);
  const handleDenyAudio    = useCallback((userId: string) => { sigRef.current?.denyAudio(userId); }, []);

  const handlePromote = useCallback(async (userId: string, newRole: string) => {
    await promoteParticipant(sessionId, userId, newRole);
  }, [sessionId]);

  const handleCreatePoll = useCallback((q: string, o: string[]) => sigRef.current?.createPoll(q, o), []);
  const handleVote       = useCallback((pollId: string, optionId: string) => { sigRef.current?.votePoll(pollId, optionId); setUserVotedOptionId(optionId); }, []);
  const handleClosePoll  = useCallback((id: string) => sigRef.current?.closePoll(id), []);
  const handleSubmitQ    = useCallback((t: string) => sigRef.current?.submitQuestion(t), []);
  const handleApproveQ   = useCallback((id: string) => sigRef.current?.approveQuestion(id), []);
  const handleRejectQ    = useCallback((id: string) => sigRef.current?.rejectQuestion(id), []);
  const handleAnswerQ    = useCallback((id: string, a: string) => sigRef.current?.answerQuestion(id, a), []);
  const handleUpvoteQ    = useCallback((id: string) => sigRef.current?.upvoteQuestion(id), []);

  // ── Recording toggle ──────────────────────────────────────────────────────
  const toggleRecording = useCallback(async () => {
    setRecordingLoading(true);
    try {
      if (isRecording) {
        await stopRecording(sessionId);
        setIsRecording(false);
        sigRef.current?.broadcastRecordingStatus(false);
      } else {
        await startRecording(sessionId);
        setIsRecording(true);
        sigRef.current?.broadcastRecordingStatus(true);
      }
    } catch (err: any) {
      alert(`Recording error: ${err.message}`);
    } finally {
      setRecordingLoading(false);
    }
  }, [isRecording, sessionId]);

  // ── Leave ─────────────────────────────────────────────────────────────────
  function handleLeave() {
    userInitiatedLeaveRef.current = true;
    if (roomId) clearClassroomSession(roomId);
    navigate(isHost ? '/dashboard' : '/');
  }

  function handleLkDisconnected(reason?: DisconnectReason) {
    if (connStatus === 'ended') {
      if (roomId) clearClassroomSession(roomId);
      navigate(isHost ? '/dashboard' : '/');
      return;
    }
    const isUserLeave   = userInitiatedLeaveRef.current;
    const isServerEnded = reason === DisconnectReason.DUPLICATE_IDENTITY || reason === DisconnectReason.ROOM_DELETED;
    if (isUserLeave || isServerEnded) {
      if (roomId) clearClassroomSession(roomId);
      navigate(isHost ? '/dashboard' : '/');
    } else {
      setConnStatus('reconnecting');
      setReconnectCount(c => c + 1);
    }
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!liveKitToken) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <AlertCircle size={48} color="var(--error-color)" />
        <p style={{ color: 'var(--text-muted)' }}>Session expired or invalid link.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Go Home</button>
      </div>
    );
  }

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#06060e' }}>
      <LiveKitRoom
        token={liveKitToken}
        serverUrl={livekitUrl}
        video={false} audio={false} connect={true}
        data-lk-theme="default"
        connectOptions={{ autoSubscribe: true }}
        options={{ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: false, publishDefaults: { simulcast: true } }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
        onDisconnected={handleLkDisconnected}
        onError={(err) => {
          const msg = (err?.message ?? '').toLowerCase();
          if (
            msg.includes('client initiated') || msg.includes('duplicate identity') ||
            msg.includes('room deleted')     || msg.includes('room not found')
          ) return;
          if (
            msg.includes('video source') || msg.includes('audio source') ||
            msg.includes('could not start') || msg.includes('permission denied') ||
            msg.includes('notallowederror') || msg.includes('notfounderror') || msg.includes('notreadableerror')
          ) { setCameraError(err.message); return; }
          setError(err.message);
        }}
      >
        {/* ── Reconnecting overlay ── */}
        {connStatus === 'reconnecting' && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <RotateCcw size={38} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#fff', fontWeight: 600 }}>Reconnecting… (attempt {reconnectCount})</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Please wait — this usually resolves in a few seconds.</p>
            <button className="btn btn-secondary" onClick={handleLeave}>Leave Session</button>
          </div>
        )}

        {/* ── Camera/mic error toast ── */}
        {cameraError && (
          <div style={{ position: 'fixed', bottom: '20px', left: '20px', zIndex: 40, maxWidth: '340px', background: 'rgba(20,10,40,0.97)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: '12px', padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <AlertCircle size={18} color="#eab308" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: '13px', color: '#eab308', marginBottom: '4px' }}>Camera / mic unavailable</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Could not access your camera or microphone. You can still use chat, polls, and Q&amp;A.
              </p>
            </div>
            <button onClick={() => setCameraError(null)} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px' }}>✕</button>
          </div>
        )}

        {/* ── Audio approval toast (attendee) ── */}
        {audioState === 'approved' && !isHost && !isPresenter && (
          <div style={{ position: 'fixed', bottom: '20px', right: '70px', zIndex: 40, maxWidth: '300px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '12px', padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', animation: 'fadeInUp 0.3s ease' }}>
            <Mic size={16} color="#10b981" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: '13px', color: '#10b981', fontWeight: 600, lineHeight: 1.3 }}>
              Audio approved! Use the Unmute button to speak.
            </p>
          </div>
        )}

        {/* ── Top bar ── */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', height: 46, background: 'rgba(6,6,16,0.98)', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Live Session</span>
            {isHost && <span style={{ fontSize: 11, background: 'rgba(124,58,237,0.2)', color: 'var(--primary-color)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>HOST</span>}
            {isRecording && isHost && <RecBadge />}
            {isRecording && !isHost && <RecBadge />}
          </div>
          <ReactionBar onReact={handleReact} incomingReactions={incomingReactions} />
          <div style={{ width: 80 }} />{/* spacer to balance reactions */}
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          {/* Stage */}
          <Stage
            isHost={isHost} isPresenter={isPresenter} canModerate={canModerate}
            onLeave={handleLeave} sessionId={sessionId}
            raisedHands={raisedHands} myHandRaised={myHandRaised}
            onRaiseHand={handleRaiseHand} onLowerHand={handleLowerHand}
            audioState={audioState} onRequestAudio={handleRequestAudio}
            isRecording={isRecording} onToggleRecording={toggleRecording}
            recordingLoading={recordingLoading} canRecord={canRecord}
          />

          {/* Sidebar panel */}
          {sidebarOpen && (
            <div style={{ width: 300, flexShrink: 0, background: 'rgba(8,8,18,0.98)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <SidebarHeader
                label={STRIP_TABS.find(t => t.id === activeTab)?.label ?? ''}
                onClose={() => setSidebarOpen(false)}
              />
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {activeTab === 'chat' && <ChatPanel messages={chatMessages} onSend={handleSendChat} />}
                {activeTab === 'participants' && (
                  <ParticipantList
                    isHost={isHost} canModerate={canModerate}
                    sessionId={sessionId} raisedHands={raisedHands}
                    audioRequests={audioRequests} participantRoles={participantRoles}
                    myParticipantId={myParticipantId}
                    onApproveAudio={handleApproveAudio} onDenyAudio={handleDenyAudio}
                    onPromote={handlePromote}
                  />
                )}
                {activeTab === 'polls' && (
                  <PollPanel
                    isHost={isHost || canModerate} sessionId={sessionId}
                    activePoll={activePoll} pollResult={pollResult}
                    onCreatePoll={handleCreatePoll} onVote={handleVote}
                    onClosePoll={handleClosePoll} userVotedOptionId={userVotedOptionId}
                  />
                )}
                {activeTab === 'qa' && (
                  <QAPanel
                    role={role as any} userId={myParticipantId || sessionId}
                    questions={questions.filter(q => q.status !== 'rejected') as any}
                    onSubmitQuestion={handleSubmitQ} onApprove={handleApproveQ}
                    onReject={handleRejectQ} onAnswer={handleAnswerQ} onUpvote={handleUpvoteQ}
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

        <RoomAudioRenderer />
      </LiveKitRoom>

      <style>{`
        @keyframes spin      { to { transform: rotate(360deg); } }
        @keyframes pulse     { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.6; transform:scale(1.15); } }
        @keyframes recPulse  { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes fadeInUp  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }

        /* LiveKit control bar overrides */
        .lk-ctrl-wrap { display:flex; align-items:center; }
        .lk-control-bar { background:transparent !important; border:none !important; padding:0 !important; gap:6px !important; }
        .lk-button {
          display:inline-flex !important; align-items:center !important; justify-content:center !important;
          min-width:40px !important; height:36px !important; padding:0 10px !important;
          background:rgba(255,255,255,0.08) !important; border:1px solid rgba(255,255,255,0.12) !important;
          border-radius:8px !important; color:#fff !important; font-size:12px !important;
          font-weight:600 !important; cursor:pointer !important; gap:5px !important;
          transition:background 0.15s, border-color 0.15s !important;
        }
        .lk-button:hover { background:rgba(255,255,255,0.15) !important; }
        .lk-button[aria-pressed="true"] {
          background:rgba(239,68,68,0.18) !important; border-color:rgba(239,68,68,0.4) !important; color:#ef4444 !important;
        }

        /* Custom control buttons */
        .ctrl-btn {
          display:inline-flex; align-items:center; justify-content:center; gap:6px;
          padding:0 12px; height:36px; border-radius:8px;
          border:1px solid rgba(255,255,255,0.13); background:rgba(255,255,255,0.07);
          color:var(--text-muted); font-size:12px; font-weight:600; cursor:pointer;
          transition:background 0.15s, border-color 0.15s, color 0.15s; white-space:nowrap;
        }
        .ctrl-btn:hover:not(:disabled) { background:rgba(255,255,255,0.13); color:#fff; }
        .ctrl-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .ctrl-btn span { line-height:1; }

        .ctrl-btn-danger {
          background:rgba(239,68,68,0.14) !important; border-color:rgba(239,68,68,0.38) !important; color:#ef4444 !important;
        }
        .ctrl-btn-danger:hover { background:rgba(239,68,68,0.25) !important; }

        /* Screen share stage */
        .screen-share-stage {
          width:100%; height:100%; position:relative;
          display:flex; align-items:center; justify-content:center; background:#000;
        }
        .screen-share-stage .lk-participant-tile { width:100% !important; height:100% !important; max-width:100% !important; max-height:100% !important; border-radius:0 !important; }
        .screen-share-stage video { width:100% !important; height:100% !important; object-fit:contain !important; }
        .screen-share-label {
          position:absolute; bottom:12px; left:12px;
          display:flex; align-items:center; gap:6px;
          padding:6px 12px; border-radius:8px;
          background:rgba(0,0,0,0.65); border:1px solid rgba(255,255,255,0.12);
          color:#f8fafc; font-size:12px; font-weight:600; pointer-events:none;
        }
        .lk-participant-tile { border-radius:12px !important; overflow:hidden !important; }
        .lk-participant-placeholder { background:rgba(124,58,237,0.15) !important; }
      `}</style>
    </div>
  );
}
