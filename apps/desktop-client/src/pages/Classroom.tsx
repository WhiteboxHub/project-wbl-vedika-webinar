/**
 * Classroom.tsx – LiveKit webinar room.
 *
 * Architecture
 * ─────────────
 * <Classroom>               ← session loading, guards, signal, non-LiveKit state
 *   <LiveKitRoom>
 *     <ClassroomInner>      ← ALL LiveKit hooks live here (mic, screen-share, tracks)
 *       <TopBar>
 *       <Body>
 *         <Stage>           ← renders screen-share or waiting placeholder
 *         <Sidebar>         ← chat / people / polls / Q&A panels
 *         <IconStrip>       ← tab buttons on far right
 *       </Body>
 *       <CtrlBar>           ← mic toggle, screen-share, hand, record, leave
 *     </ClassroomInner>
 *   </LiveKitRoom>
 * </Classroom>
 */

import React, {
  useEffect, useMemo, useState, useRef, useCallback,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ParticipantTile,
  useTracks,
  useLocalParticipant,
  useConnectionState,
  useParticipants,
} from '@livekit/components-react';
import {
  ConnectionState, Track, DisconnectReason, VideoPresets,
  ScreenSharePresets,
} from 'livekit-client';
import '@livekit/components-styles';
import {
  Loader2, MicOff, Mic, UserX, Users,
  MessageSquare, Hand, AlertCircle, Monitor, StopCircle,
  BarChart2, HelpCircle, RotateCcw, CheckCircle, Radio,
  ShieldPlus, Video, X, PhoneOff, MonitorOff,
} from 'lucide-react';
import {
  removeParticipant, promoteParticipant, muteParticipant,
} from '../lib/api';
import {
  loadClassroomSession, clearClassroomSession,
  getLiveKitUrl, getSignalServerUrl, type WebinarSessionData,
  loadWebinarSession,
} from '../lib/classroom-session';
import NativeClassroomView from './NativeClassroomView';
import { SignalingClient, ReactionType } from '../lib/signaling';
import PollPanel, { PollData, PollResult } from './classroom/PollPanel';
import QAPanel, { QuestionData } from './classroom/QAPanel';
import ReactionBar from './classroom/ReactionBar';
import { LIVEKIT_MIC_OPTIONS } from '../lib/webrtc/audio-constraints';

const USE_NATIVE_WEBRTC = (import.meta as any).env?.VITE_USE_NATIVE_WEBRTC === 'true';

// ─── Types ───────────────────────────────────────────────────────────────────

type SideTab   = 'chat' | 'participants' | 'polls' | 'qa';
type AudioSt   = 'none' | 'pending' | 'approved' | 'denied';
type MyRole    = 'host' | 'co_organizer' | 'presenter' | 'moderator' | 'attendee';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jwtSub(token: string): string {
  try { return JSON.parse(atob(token.split('.')[1])).sub ?? ''; } catch { return ''; }
}
function canModRole(r: MyRole)  { return r === 'host' || r === 'co_organizer' || r === 'moderator'; }
function canShareRole(r: MyRole){ return r === 'host' || r === 'co_organizer' || r === 'presenter' || r === 'moderator'; }

// ─── Design tokens ───────────────────────────────────────────────────────────

const BLUE   = '#2563eb';
const RED    = '#ef4444';
const GREEN  = '#22c55e';
const AMBER  = '#f59e0b';
const SHELL  = '#0a0a10';
const TOPBAR = 'rgba(8,8,16,0.98)';
const CTRLBG = 'rgba(6,6,12,0.98)';
const BORDER = 'rgba(255,255,255,0.08)';
const SURF   = 'rgba(255,255,255,0.05)';

// ─── Signaling context (passed from Classroom → ClassroomInner as props) ─────

interface SigCtx {
  sigRef:           React.MutableRefObject<SignalingClient | null>;
  chatMessages:     any[];
  reactions:        any[];
  activePoll:       PollData | null;
  pollResult:       PollResult | null;
  myVote:           string | null;
  questions:        QuestionData[];
  audioRequests:    any[];
  raisedHands:      Set<string>;
  participantRoles: Map<string, string>;
  unreadChat:       number;
  myHandRaised:     boolean;
  audioState:       AudioSt;
  micEnableNonce:   number;
  serverMuteNonce:  number;
  serverMuted:      boolean;
  myRole:           MyRole;
  myId:             string;
  sessionId:        string;
  isHost:           boolean;
  isRecording:      boolean;
  connStatus:       'ok' | 'reconnecting' | 'ended';
  reconnectN:       number;
  sidebarOpen:      boolean;
  activeTab:        SideTab;
  cameraErr:        string | null;
  // callbacks
  onTab:            (t: SideTab) => void;
  onSendChat:       (m: string) => void;
  onReact:          (t: ReactionType) => void;
  onRaiseHand:      () => void;
  onLowerHand:      () => void;
  onRequestAudio:   () => void;
  onApproveAudio:   (uid: string) => void;
  onDenyAudio:      (uid: string) => void;
  onPromote:        (uid: string, role: string) => Promise<void>;
  onCreatePoll:     (q: string, opts: string[]) => void;
  onVote:           (pid: string, oid: string) => void;
  onClosePoll:      (pid: string) => void;
  onSubmitQ:        (text: string) => void;
  onApproveQ:       (id: string) => void;
  onRejectQ:        (id: string) => void;
  onAnswerQ:        (id: string, ans: string) => void;
  onUpvoteQ:        (id: string) => void;
  onLeave:          () => void;
  onDismissCamErr:  () => void;
  onToggleRec:      () => void;
  recBusy:          boolean;
}

// ─── Recording hook ───────────────────────────────────────────────────────────

function useRecording(onStatus: (r: boolean) => void) {
  const mrRef   = useRef<MediaRecorder | null>(null);
  const chunks  = useRef<Blob[]>([]);
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { width: 1920, height: 1080, frameRate: 30, cursor: 'always' },
        audio: true,
      });
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus' : 'video/webm';
      const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      chunks.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        const blob = new Blob(chunks.current, { type: mime });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), {
          href: url,
          download: `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`,
        });
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onStatus(false);
      };
      stream.getVideoTracks()[0].addEventListener('ended', () => stop());
      mr.start(1000);
      mrRef.current = mr;
      onStatus(true);
    } catch (err: any) {
      alert(err?.name === 'NotAllowedError' ? 'Screen capture permission denied.' : 'Recording failed.');
    } finally {
      setBusy(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
    mrRef.current = null;
  }, []);

  return { start, stop, busy };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ClassroomInner  — lives INSIDE LiveKitRoom so all LK hooks are available
// ═══════════════════════════════════════════════════════════════════════════════

function ClassroomInner(ctx: SigCtx) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const connectionState = useConnectionState();
  const [micError, setMicError] = useState<string | null>(null);

  // Auto-enable mic when host approves or role is promoted
  useEffect(() => {
    if (ctx.micEnableNonce === 0) return;
    if (ctx.audioState !== 'approved') return;
    void localParticipant.setMicrophoneEnabled(true, LIVEKIT_MIC_OPTIONS as any).catch((e: any) => {
      const name = (e?.name ?? '').toLowerCase();
      setMicError(
        name === 'notallowederror'
          ? 'Microphone access denied — allow it in your browser and try again.'
          : `Microphone error: ${e?.message ?? 'unknown'}`,
      );
    });
  }, [ctx.micEnableNonce, ctx.audioState, localParticipant]);

  // Apply server-authoritative mute from host (LiveKit REST or signal broadcast)
  useEffect(() => {
    if (ctx.serverMuteNonce === 0) return;
    void localParticipant.setMicrophoneEnabled(!ctx.serverMuted, LIVEKIT_MIC_OPTIONS as any).catch(() => {});
  }, [ctx.serverMuteNonce, ctx.serverMuted, localParticipant]);

  // Re-publish mic after LiveKit reconnects
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    if (ctx.audioState !== 'approved' && !ctx.isHost) return;
    if (!isMicrophoneEnabled) return;
    void localParticipant.setMicrophoneEnabled(true, LIVEKIT_MIC_OPTIONS as any).catch(() => {});
  }, [connectionState]);

  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: true },
  );

  // Track whether WE are sharing (local participant's own screen share pub)
  const myScreenPub = localParticipant?.getTrackPublication(Track.Source.ScreenShare);
  const isSharing   = !!myScreenPub?.track;

  // Remote screen share takes priority; then local (so host sees what attendees see)
  const remoteScreen = screenTracks.find(t => !t.participant.isLocal) ?? null;
  const activeScreen = remoteScreen ?? (screenTracks[0] ?? null);

  const connecting  = connectionState === ConnectionState.Connecting
                   || connectionState === ConnectionState.Reconnecting;

  // ── Mic toggle ─────────────────────────────────────────────────────────────
  const [shareError, setShareError] = useState<string | null>(null);

  // Auto-dismiss error toasts after 5 s
  useEffect(() => { if (micError) { const t = setTimeout(() => setMicError(null), 5000); return () => clearTimeout(t); } }, [micError]);
  useEffect(() => { if (shareError) { const t = setTimeout(() => setShareError(null), 5000); return () => clearTimeout(t); } }, [shareError]);

  const toggleMic = useCallback(async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled, LIVEKIT_MIC_OPTIONS as any);
    } catch (e: any) {
      const name = (e?.name ?? '').toLowerCase();
      setMicError(
        name === 'notallowederror'
          ? 'Microphone access denied — allow it in your browser and try again.'
          : name === 'notfounderror'
          ? 'No microphone found. Plug one in and try again.'
          : `Microphone error: ${e?.message ?? 'unknown'}`,
      );
    }
  }, [localParticipant, isMicrophoneEnabled]);

  // ── Screen share toggle ────────────────────────────────────────────────────
  const [shareLoading, setShareLoading] = useState(false);

  const toggleScreenShare = useCallback(async () => {
    if (shareLoading) return;
    setShareLoading(true);
    try {
      if (isSharing) {
        await localParticipant.setScreenShareEnabled(false);
      } else {
        await localParticipant.setScreenShareEnabled(true, {
          resolution: ScreenSharePresets.h1080fps30,  // highest preset this SDK version supports
          audio: true,
        } as any);
      }
    } catch (err: any) {
      const name = (err?.name ?? '').toLowerCase();
      const msg  = (err?.message ?? '').toLowerCase();
      if (name === 'notallowederror') {
        // User clicked Cancel in the picker — silent, that's fine
      } else if (msg.includes('permission') || msg.includes('not allowed') || msg.includes('canpublish')) {
        setShareError('Screen share permission not yet active. Wait a moment after promotion and try again.');
      } else {
        setShareError(`Screen share failed: ${err?.message ?? 'unknown error'}`);
      }
    } finally {
      setShareLoading(false);
    }
  }, [localParticipant, isSharing, shareLoading]);

  const canShare  = canShareRole(ctx.myRole);
  const canRecord = ctx.isHost;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, height: 48, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 16px',
        background: TOPBAR, borderBottom: `1px solid ${BORDER}`,
        gap: 12,
      }}>
        {/* Left: status badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, animation: 'pulse 2s infinite' }}/>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '-0.01em', color: '#e8eaf0' }}>Live Session</span>
          </div>
          {ctx.isHost && badge(BLUE, 'HOST')}
          {ctx.myRole === 'co_organizer' && badge(GREEN, 'CO-ORG')}
          {ctx.myRole === 'presenter'    && badge(AMBER, 'PRESENTER')}
          {ctx.isRecording && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(239,68,68,0.12)', border: `1px solid rgba(239,68,68,0.3)`,
              borderRadius: 6, padding: '3px 9px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: RED, animation: 'recPulse 1.2s ease infinite' }}/>
              <span style={{ fontSize: 11, fontWeight: 700, color: RED, letterSpacing: '0.06em' }}>REC</span>
            </div>
          )}
          {isSharing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(37,99,235,0.12)', border: `1px solid rgba(37,99,235,0.28)`,
              borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, color: BLUE }}>
              <Monitor size={10}/> Sharing
            </div>
          )}
        </div>

        {/* Centre: reactions */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
          <ReactionBar onReact={ctx.onReact} incomingReactions={ctx.reactions}/>
        </div>

        {/* Right: spacer */}
        <div style={{ width: 80, flexShrink: 0 }}/>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Stage */}
        <div style={{ flex: 1, position: 'relative', background: SHELL, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>

          {/* Connecting overlay */}
          {connecting && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10,
              background: 'rgba(0,0,0,0.82)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <Loader2 size={38} color={BLUE} style={{ animation: 'spin 1s linear infinite' }}/>
              <p style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Connecting to session…</p>
            </div>
          )}

          {/* Screen share */}
          {activeScreen ? (
            <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ParticipantTile trackRef={activeScreen} style={{ width: '100%', height: '100%', objectFit: 'contain' }}/>
              {/* Presenter label */}
              <div style={{ position: 'absolute', bottom: 14, left: 14,
                display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none',
                padding: '5px 12px', borderRadius: 8,
                background: 'rgba(0,0,0,0.65)', border: `1px solid ${BORDER}`,
                color: '#e8eaf0', fontSize: 12, fontWeight: 600 }}>
                <Monitor size={12} color={BLUE}/>
                <span>
                  {activeScreen.participant.isLocal
                    ? 'You are presenting'
                    : `${activeScreen.participant.name || activeScreen.participant.identity} is presenting`}
                </span>
              </div>
            </div>
          ) : (
            /* Waiting placeholder */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
              padding: 36, textAlign: 'center', maxWidth: 440 }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%',
                background: 'rgba(37,99,235,0.08)', border: `2px solid rgba(37,99,235,0.18)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Video size={34} color={BLUE}/>
              </div>
              <div>
                <p style={{ color: '#e8eaf0', fontSize: 17, fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>
                  {!connectionState || connecting ? 'Joining session…' : 'Ready for presentation'}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
                  {connecting
                    ? 'Setting up your secure connection.'
                    : canShare
                      ? 'Click Share Screen in the toolbar to start presenting, or wait for a presenter to join.'
                      : 'Raise your hand to request the microphone, or use the sidebar for chat and Q&A.'}
                </p>
              </div>
            </div>
          )}

          {/* Mic error toast */}
          {micError && (
            <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              zIndex: 20, maxWidth: 360, width: 'max-content',
              background: 'rgba(12,10,22,0.97)', border: `1px solid rgba(239,68,68,0.38)`,
              borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 9, alignItems: 'center',
              boxShadow: '0 6px 24px rgba(0,0,0,0.5)', animation: 'fadeUp 0.2s ease' }}>
              <MicOff size={14} color={RED} style={{ flexShrink: 0 }}/>
              <p style={{ fontSize: 12, color: '#f1c0c0', fontWeight: 500, lineHeight: 1.4 }}>{micError}</p>
              <button onClick={() => setMicError(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', marginLeft: 4, display: 'flex', alignItems: 'center' }}>
                <X size={11}/>
              </button>
            </div>
          )}

          {/* Screen-share error toast */}
          {shareError && (
            <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              zIndex: 20, maxWidth: 380, width: 'max-content',
              background: 'rgba(12,10,22,0.97)', border: `1px solid rgba(245,158,11,0.38)`,
              borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 9, alignItems: 'center',
              boxShadow: '0 6px 24px rgba(0,0,0,0.5)', animation: 'fadeUp 0.2s ease' }}>
              <Monitor size={14} color={AMBER} style={{ flexShrink: 0 }}/>
              <p style={{ fontSize: 12, color: '#fde68a', fontWeight: 500, lineHeight: 1.4 }}>{shareError}</p>
              <button onClick={() => setShareError(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', marginLeft: 4, display: 'flex', alignItems: 'center' }}>
                <X size={11}/>
              </button>
            </div>
          )}

          {/* Reconnecting overlay */}
          {ctx.connStatus === 'reconnecting' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20,
              background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <RotateCcw size={36} color={BLUE} style={{ animation: 'spin 1s linear infinite' }}/>
              <p style={{ color: '#fff', fontWeight: 600 }}>Reconnecting… (attempt {ctx.reconnectN})</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Hold tight — this usually resolves in seconds.</p>
              <button className="cls-btn-sec" onClick={ctx.onLeave}>Leave Session</button>
            </div>
          )}

          {/* Camera/mic error toast */}
          {ctx.cameraErr && (
            <div style={{ position: 'absolute', bottom: 14, left: 14, zIndex: 15, maxWidth: 300,
              background: 'rgba(12,10,22,0.97)', border: `1px solid rgba(245,158,11,0.35)`,
              borderRadius: 11, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start',
              boxShadow: '0 6px 28px rgba(0,0,0,0.5)', animation: 'fadeUp 0.2s ease' }}>
              <AlertCircle size={16} color={AMBER} style={{ flexShrink: 0, marginTop: 1 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 12, color: AMBER, marginBottom: 3 }}>Device Unavailable</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Chat, polls and Q&A still work.
                </p>
              </div>
              <button onClick={ctx.onDismissCamErr}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                <X size={12}/>
              </button>
            </div>
          )}

          {/* Mic approved toast */}
          {ctx.audioState === 'approved' && !ctx.isHost && !isMicrophoneEnabled && (
            <div style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 15, maxWidth: 260,
              background: 'rgba(22,163,74,0.1)', border: `1px solid rgba(34,197,94,0.35)`,
              borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center',
              animation: 'fadeUp 0.2s ease' }}>
              <Mic size={14} color={GREEN} style={{ flexShrink: 0 }}/>
              <p style={{ fontSize: 12, color: GREEN, fontWeight: 600, lineHeight: 1.3 }}>
                Mic approved — enabling microphone…
              </p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        {ctx.sidebarOpen && (
          <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column',
            background: 'rgba(6,6,14,0.99)', borderLeft: `1px solid ${BORDER}`,
            animation: 'slideIn 0.18s ease' }}>
            <SidebarHeader
              label={TABS.find(t => t.id === ctx.activeTab)?.label ?? ''}
              onClose={() => ctx.onTab(ctx.activeTab)}
            />
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {ctx.activeTab === 'chat' && <ChatPanel messages={ctx.chatMessages} onSend={ctx.onSendChat}/>}
              {ctx.activeTab === 'participants' && (
                <PeoplePanel
                  isHost={ctx.isHost} myRole={ctx.myRole} sessionId={ctx.sessionId}
                  raisedHands={ctx.raisedHands} audioRequests={ctx.audioRequests}
                  participantRoles={ctx.participantRoles} myId={ctx.myId}
                  onApproveAudio={ctx.onApproveAudio} onDenyAudio={ctx.onDenyAudio}
                  onPromote={ctx.onPromote}
                />
              )}
              {ctx.activeTab === 'polls' && (
                <PollPanel isHost={ctx.isHost || canModRole(ctx.myRole)} sessionId={ctx.sessionId}
                  activePoll={ctx.activePoll} pollResult={ctx.pollResult}
                  onCreatePoll={ctx.onCreatePoll} onVote={ctx.onVote}
                  onClosePoll={ctx.onClosePoll} userVotedOptionId={ctx.myVote}/>
              )}
              {ctx.activeTab === 'qa' && (
                <QAPanel role={ctx.myRole as any} userId={ctx.myId || ctx.sessionId}
                  questions={ctx.questions.filter(q => q.status !== 'rejected') as any}
                  onSubmitQuestion={ctx.onSubmitQ} onApprove={ctx.onApproveQ}
                  onReject={ctx.onRejectQ} onAnswer={ctx.onAnswerQ} onUpvote={ctx.onUpvoteQ}/>
              )}
            </div>
          </div>
        )}

        {/* Icon strip */}
        <IconStrip
          activeTab={ctx.activeTab} open={ctx.sidebarOpen} onTab={ctx.onTab}
          unread={ctx.unreadChat} audioReqs={ctx.audioRequests.length}
        />
      </div>

      {/* ── Control bar ───────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 5, padding: '8px 16px', flexWrap: 'wrap',
        background: CTRLBG, borderTop: `1px solid ${BORDER}`,
      }}>

        {/* Mic */}
        {ctx.audioState === 'approved' ? (
          <button onClick={toggleMic} className="cls-ctrl"
            data-state={isMicrophoneEnabled ? 'active' : 'muted'}
            title={isMicrophoneEnabled ? 'Mute' : 'Unmute'}>
            {isMicrophoneEnabled ? <Mic size={14}/> : <MicOff size={14}/>}
            <span>{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span>
          </button>
        ) : ctx.audioState === 'pending' ? (
          <button disabled className="cls-ctrl" style={{ opacity: 0.5 }}>
            <Mic size={14}/><span>Requested…</span>
          </button>
        ) : ctx.audioState === 'denied' ? (
          <button disabled className="cls-ctrl" style={{ opacity: 0.4 }}>
            <MicOff size={14}/><span>Mic Denied</span>
          </button>
        ) : (
          <button onClick={ctx.onRequestAudio} className="cls-ctrl" title="Request to speak">
            <Mic size={14}/><span>Request Mic</span>
          </button>
        )}

        <Bar/>

        {/* Screen share */}
        {canShare && (
          <button onClick={toggleScreenShare} disabled={shareLoading}
            className="cls-ctrl"
            data-state={isSharing ? 'danger' : shareLoading ? 'loading' : undefined}
            title={isSharing ? 'Stop sharing' : 'Share your screen'}>
            {shareLoading
              ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/>
              : isSharing ? <MonitorOff size={14}/> : <Monitor size={14}/>}
            <span>{isSharing ? 'Stop Share' : 'Share Screen'}</span>
          </button>
        )}

        {/* Hand */}
        <button onClick={ctx.myHandRaised ? ctx.onLowerHand : ctx.onRaiseHand}
          className="cls-ctrl"
          data-state={ctx.myHandRaised ? 'warn' : undefined}
          title={ctx.myHandRaised ? 'Lower hand' : 'Raise hand'}>
          <Hand size={14}/>
          <span>{ctx.myHandRaised ? 'Lower Hand' : 'Raise Hand'}</span>
        </button>

        <Bar/>

        {/* Record (host only) */}
        {canRecord && (
          <button onClick={ctx.onToggleRec} disabled={ctx.recBusy}
            className="cls-ctrl"
            data-state={ctx.isRecording ? 'danger' : undefined}
            title={ctx.isRecording ? 'Stop recording' : 'Record session'}>
            {ctx.recBusy
              ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/>
              : ctx.isRecording ? <StopCircle size={14}/> : <Radio size={14}/>}
            <span>{ctx.isRecording ? 'Stop Rec' : 'Record'}</span>
          </button>
        )}

        {/* Leave */}
        <button onClick={ctx.onLeave} className="cls-ctrl" data-state="leave"
          title={ctx.isHost ? 'End session for all' : 'Leave session'}>
          <PhoneOff size={14}/>
          <span>{ctx.isHost ? 'End Session' : 'Leave'}</span>
        </button>
      </div>

      <RoomAudioRenderer/>
    </div>
  );
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function badge(color: string, text: string) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      background: `${color}22`, color, padding: '2px 8px',
      borderRadius: 10, border: `1px solid ${color}44` }}>
      {text}
    </span>
  );
}
function Bar() {
  return <div style={{ width: 1, height: 24, background: BORDER, margin: '0 3px', flexShrink: 0 }}/>;
}

// ─── Icon strip ───────────────────────────────────────────────────────────────

const TABS: { id: SideTab; label: string; icon: React.ReactNode }[] = [
  { id: 'chat',         label: 'Chat',    icon: <MessageSquare size={15}/> },
  { id: 'participants', label: 'People',  icon: <Users size={15}/> },
  { id: 'polls',        label: 'Polls',   icon: <BarChart2 size={15}/> },
  { id: 'qa',           label: 'Q&A',     icon: <HelpCircle size={15}/> },
];

function IconStrip({ activeTab, open, onTab, unread, audioReqs }: {
  activeTab: SideTab; open: boolean;
  onTab: (t: SideTab) => void;
  unread: number; audioReqs: number;
}) {
  return (
    <div style={{ width: 52, flexShrink: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 8, gap: 3,
      background: TOPBAR, borderLeft: `1px solid ${BORDER}` }}>
      {TABS.map(t => {
        const active = open && activeTab === t.id;
        const dot    = t.id === 'chat' ? Math.min(unread, 99)
                     : t.id === 'participants' ? audioReqs : 0;
        return (
          <button key={t.id} title={t.label} onClick={() => onTab(t.id)} style={{
            width: 42, height: 44, borderRadius: 8,
            background: active ? 'rgba(37,99,235,0.16)' : 'transparent',
            border:     active ? `1px solid rgba(37,99,235,0.38)` : '1px solid transparent',
            color:      active ? BLUE : 'var(--text-muted)',
            cursor: 'pointer', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 2,
            position: 'relative', transition: 'all 0.14s', outline: 'none',
          }}>
            {t.icon}
            <span style={{ fontSize: 9, lineHeight: 1, fontWeight: 600 }}>{t.label}</span>
            {dot > 0 && (
              <div style={{ position: 'absolute', top: 2, right: 2,
                minWidth: 14, height: 14, borderRadius: 7,
                background: t.id === 'participants' ? AMBER : RED,
                fontSize: 9, fontWeight: 700, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                {dot}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Sidebar header ───────────────────────────────────────────────────────────

function SidebarHeader({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div style={{ flexShrink: 0, padding: '10px 14px', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none',
        color: 'var(--text-muted)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 5 }}>
        <X size={13}/>
      </button>
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({ messages, onSend }: { messages: any[]; onSend: (m: string) => void }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim()); setInput('');
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {messages.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', marginTop: 48 }}>
            No messages yet
          </p>
        )}
        {messages.map((m, i) => (
          <div key={m.id || i} style={{ padding: '8px 10px', borderRadius: 8, background: SURF }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: BLUE }}>{m.userName}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word', color: '#d4d8e0' }}>{m.message}</p>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
      <form onSubmit={submit} style={{ borderTop: `1px solid ${BORDER}`, padding: '10px 12px', display: 'flex', gap: 7 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Send a message…"
          style={{ flex: 1, padding: '8px 11px', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`,
            color: '#e8eaf0', fontSize: 13, outline: 'none',
            fontFamily: 'Inter, sans-serif' }}/>
        <button type="submit" style={{ padding: '8px 14px', borderRadius: 8, border: 'none',
          background: BLUE, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13,
          fontFamily: 'Inter, sans-serif' }}>
          Send
        </button>
      </form>
    </div>
  );
}

// ─── People Panel ─────────────────────────────────────────────────────────────

function PeoplePanel({
  isHost, myRole, sessionId, raisedHands, audioRequests,
  participantRoles, myId, onApproveAudio, onDenyAudio, onPromote,
}: {
  isHost: boolean; myRole: MyRole; sessionId: string;
  raisedHands: Set<string>; audioRequests: any[];
  participantRoles: Map<string, string>; myId: string;
  onApproveAudio: (uid: string) => void;
  onDenyAudio: (uid: string) => void;
  onPromote: (uid: string, role: string) => Promise<void>;
}) {
  const participants = useParticipants();
  const [promoting, setPromoting] = useState<string | null>(null);
  const [muting, setMuting] = useState<string | null>(null);
  const canMod = canModRole(myRole);

  async function handlePromote(uid: string, role: string) {
    setPromoting(uid);
    try { await onPromote(uid, role); } finally { setPromoting(null); }
  }

  async function handleServerMute(p: ReturnType<typeof useParticipants>[number], muted: boolean) {
    const micPub = p.getTrackPublication(Track.Source.Microphone);
    if (!micPub?.trackSid) return;
    setMuting(p.identity);
    try {
      await muteParticipant(sessionId, p.identity, micPub.trackSid, muted);
    } catch {
      alert(muted ? 'Failed to mute participant' : 'Failed to unmute participant');
    } finally {
      setMuting(null);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10,
        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Participants ({participants.length})
      </p>

      {/* Audio requests */}
      {canMod && audioRequests.length > 0 && (
        <div style={{ marginBottom: 12, background: 'rgba(245,158,11,0.06)',
          border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 9, padding: '9px 10px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: AMBER, marginBottom: 7,
            textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Mic Requests ({audioRequests.length})
          </p>
          {audioRequests.map((req: any) => (
            <div key={req.userId} style={{ display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {req.userName}
              </span>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => onApproveAudio(req.userId)}
                  style={pill(GREEN)}>Approve</button>
                <button onClick={() => onDenyAudio(req.userId)}
                  style={pill(RED)}>Deny</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Participant list */}
      {participants.map(p => {
        const hand  = raisedHands.has(p.identity);
        const role  = participantRoles.get(p.identity) ?? 'attendee';
        const isMe  = p.identity === myId;
        const isMod = ['host', 'organizer', 'co_organizer', 'moderator'].includes(role);

        return (
          <div key={p.identity} style={{ padding: '8px 10px', borderRadius: 9, marginBottom: 5,
            background: (p as any).isSpeaking ? 'rgba(34,197,94,0.06)' : SURF,
            border: `1px solid ${(p as any).isSpeaking ? 'rgba(34,197,94,0.28)' : BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              {/* Avatar */}
              <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: (p as any).isSpeaking
                  ? `linear-gradient(135deg,${GREEN},#16a34a)` : `linear-gradient(135deg,${BLUE},#1d4ed8)`,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700 }}>
                {(p.name || p.identity || '?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                    {p.name || p.identity}
                  </span>
                  {hand && <span style={chip(AMBER)}>Hand Up</span>}
                  {(p as any).isSpeaking && <span style={chip(GREEN)}>Speaking</span>}
                  {isMe  && <span style={chip(BLUE)}>You</span>}
                  {(role === 'host' || role === 'organizer') && <span style={chip(BLUE)}>Host</span>}
                  {(role === 'co_organizer' || role === 'moderator') && <span style={chip(GREEN)}>Co-org</span>}
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                  {p.isMicrophoneEnabled ? 'Mic on' : 'Muted'}
                </p>
              </div>
            </div>

            {/* Host controls */}
            {canMod && !isMe && (
              <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                {p.isMicrophoneEnabled && p.getTrackPublication(Track.Source.Microphone)?.trackSid && (
                  <button title="Mute participant" disabled={muting === p.identity}
                    onClick={() => void handleServerMute(p, true)}
                    style={iconBtn(RED, muting === p.identity)}>
                    {muting === p.identity
                      ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }}/>
                      : <MicOff size={10}/>}
                  </button>
                )}
                {!p.isMicrophoneEnabled && p.getTrackPublication(Track.Source.Microphone)?.trackSid && (
                  <button title="Unmute participant" disabled={muting === p.identity}
                    onClick={() => void handleServerMute(p, false)}
                    style={iconBtn(GREEN, muting === p.identity)}>
                    {muting === p.identity
                      ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }}/>
                      : <Mic size={10}/>}
                  </button>
                )}
                {isHost && !isMod && (
                  <button title="Make Co-organizer" disabled={promoting === p.identity}
                    onClick={() => handlePromote(p.identity, 'co_organizer')}
                    style={iconBtn(BLUE, promoting === p.identity)}>
                    {promoting === p.identity
                      ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }}/>
                      : <ShieldPlus size={10}/>}
                  </button>
                )}
                <button title="Remove participant"
                  onClick={() => window.confirm(`Remove ${p.name || p.identity}?`) && removeParticipant(sessionId, p.identity)}
                  style={iconBtn(RED)}>
                  <UserX size={10}/>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function pill(color: string): React.CSSProperties {
  return {
    padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700,
    border: `1px solid ${color}44`, background: `${color}14`, color,
  };
}
function chip(color: string): React.CSSProperties {
  return { fontSize: 9, background: `${color}1a`, color, padding: '1px 5px', borderRadius: 6 };
}
function iconBtn(color: string, disabled = false): React.CSSProperties {
  return {
    width: 26, height: 26, borderRadius: 6,
    border: `1px solid ${color}38`, background: `${color}12`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color,
    opacity: disabled ? 0.5 : 1,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Classroom (outer shell) — session loading, signal, recording, state
// ═══════════════════════════════════════════════════════════════════════════════

export default function Classroom() {
  const { roomId }  = useParams<{ roomId: string }>();
  const location    = useLocation();
  const navigate    = useNavigate();

  // ── Native WebRTC branch ──────────────────────────────────────────────────
  const nativeSess = USE_NATIVE_WEBRTC
    ? ((location.state as WebinarSessionData) || (roomId ? loadWebinarSession(roomId) : null))
    : null;
  if (USE_NATIVE_WEBRTC && nativeSess?.grant) {
    return <NativeClassroomView grant={nativeSess.grant} isHost={nativeSess.isHost}/>;
  }

  // ── Session data ──────────────────────────────────────────────────────────
  const sessionData = useMemo(
    () => (location.state as any) || (roomId ? loadClassroomSession(roomId) : null),
    [roomId],
  );
  const liveKitToken:    string  = sessionData?.liveKitToken   || '';
  const livekitUrl:      string  = sessionData?.livekitUrl     || getLiveKitUrl();
  const isHost:          boolean = sessionData?.isHost         || false;
  const sessionId:       string  = sessionData?.sessionId      || '';
  const participantName: string  = sessionData?.participantName || '';
  const signalToken:     string  = sessionData?.signalToken    || liveKitToken;
  const myId = useMemo(() => jwtSub(signalToken), [signalToken]);

  // ── Dynamic role ──────────────────────────────────────────────────────────
  const [myRole,   setMyRole]   = useState<MyRole>(isHost ? 'host' : 'attendee');

  // ── Signal client ─────────────────────────────────────────────────────────
  const sigRef   = useRef<SignalingClient | null>(null);
  const sideRef  = useRef(false);
  const tabRef   = useRef<SideTab>('chat');

  // ── UI state ──────────────────────────────────────────────────────────────
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [activeTab,    setActiveTab]    = useState<SideTab>('chat');
  const [unreadChat,   setUnreadChat]   = useState(0);
  const [error,        setError]        = useState<string | null>(null);
  const [cameraErr,    setCameraErr]    = useState<string | null>(null);
  const [connStatus,   setConnStatus]   = useState<'ok' | 'reconnecting' | 'ended'>('ok');
  const [reconnectN,   setReconnectN]   = useState(0);
  const userLeftRef = useRef(false);

  useEffect(() => { sideRef.current = sidebarOpen; }, [sidebarOpen]);
  useEffect(() => { tabRef.current  = activeTab;   }, [activeTab]);

  // ── Audio state ───────────────────────────────────────────────────────────
  const [audioState,    setAudioState]    = useState<AudioSt>(isHost ? 'approved' : 'none');
  const [audioRequests, setAudioRequests] = useState<any[]>([]);
  const [micEnableNonce, setMicEnableNonce]   = useState(0);
  const [serverMuteNonce, setServerMuteNonce] = useState(0);
  const [serverMuted, setServerMuted]         = useState(false);

  // ── Presence / hands ─────────────────────────────────────────────────────
  const [myHandRaised,     setMyHandRaised]     = useState(false);
  const [raisedHands,      setRaisedHands]      = useState<Set<string>>(new Set());
  const [participantRoles, setParticipantRoles] = useState<Map<string, string>>(new Map());

  // ── Chat / polls / qa ─────────────────────────────────────────────────────
  const [chatMessages,  setChatMessages]  = useState<any[]>([]);
  const [reactions,     setReactions]     = useState<any[]>([]);
  const [activePoll,    setActivePoll]    = useState<PollData | null>(null);
  const [pollResult,    setPollResult]    = useState<PollResult | null>(null);
  const [myVote,        setMyVote]        = useState<string | null>(null);
  const [questions,     setQuestions]     = useState<QuestionData[]>([]);

  // ── Recording ─────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const { start: startRec, stop: stopRec, busy: recBusy } = useRecording(setIsRecording);
  const toggleRec = useCallback(() => {
    if (isRecording) { stopRec(); setIsRecording(false); }
    else startRec();
  }, [isRecording, startRec, stopRec]);

  // ── Signal setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!signalToken || !roomId) return;
    const sig = new SignalingClient(getSignalServerUrl());
    sigRef.current = sig;

    sig.onConnected    = () => {
      setConnStatus('ok');
      sig.joinRoom(roomId, signalToken, participantName, isHost ? 'host' : 'attendee');
    };
    sig.onDisconnected = () => {
      setConnStatus(p => p === 'ended' ? 'ended' : 'reconnecting');
      setReconnectN(n => n + 1);
    };
    sig.onRoomState = d => {
      if (d?.history)      setChatMessages(d.history);
      if (d?.activePoll)   { setActivePoll(d.activePoll); setPollResult(null); setMyVote(null); }
      if (d?.presence) {
        const m = new Map<string, string>();
        (d.presence as any[]).forEach(p => m.set(p.userId, p.role));
        setParticipantRoles(m);
      }
      if (d?.raisedHands) {
        const s = new Set<string>((d.raisedHands as any[]).map((h: any) => h.userId));
        setRaisedHands(s); setMyHandRaised(s.has(myId));
      }
      if (d?.audioRequests) {
        setAudioRequests((d.audioRequests as any[]).filter((r: any) => r.status === 'pending'));
      }
    };
    sig.onChat = (id, userId, userName, message, timestamp) => {
      setChatMessages(prev => [...prev, { id, userId, userName, message, timestamp }]);
      if (!sideRef.current || tabRef.current !== 'chat') setUnreadChat(c => c + 1);
    };
    sig.onParticipantJoined = (uid, _n, role) => setParticipantRoles(prev => new Map(prev).set(uid, role));
    sig.onParticipantLeft   = (uid) => {
      setParticipantRoles(prev => { const m = new Map(prev); m.delete(uid); return m; });
      setRaisedHands(prev     => { const s = new Set(prev);  s.delete(uid); return s; });
    };
    sig.onHandRaised = (uid, _n, raised) => {
      setRaisedHands(prev => { const s = new Set(prev); raised ? s.add(uid) : s.delete(uid); return s; });
      if (uid === myId) setMyHandRaised(raised);
    };
    sig.onReaction = (uid, uname, type, ts) => {
      setReactions(prev => [...prev.slice(-20), { uid, uname, type, ts }]);
    };
    sig.onPollCreated = p => { setActivePoll(p); setPollResult(null); setMyVote(null); };
    sig.onPollResult  = setPollResult;
    sig.onPollClosed  = () => setActivePoll(null);
    sig.onQuestionPending  = q => setQuestions(prev => [...prev, q]);
    sig.onQuestionApproved = q => setQuestions(prev => prev.map(x => x.id === q.id ? q : x));
    sig.onQuestionRejected = d => setQuestions(prev => prev.map(x => x.id === d.id ? { ...x, status: 'rejected' as const } : x));
    sig.onQuestionAnswered = q => setQuestions(prev => prev.map(x => x.id === q.id ? q : x));
    sig.onQuestionUpvoted  = d => setQuestions(prev => prev.map(x => x.id === d.id ? { ...x, upvotes: d.upvotes } : x));

    sig.onAudioRequested = req => {
      if (canModRole(myRole)) setAudioRequests(prev => [...prev.filter(r => r.userId !== req.userId), req]);
    };
    sig.onAudioApproved = ({ userId }) => {
      if (userId === myId) {
        setAudioState('approved');
        setMicEnableNonce(n => n + 1);
      }
      setAudioRequests(prev => prev.filter(r => r.userId !== userId));
    };
    sig.onAudioDenied = ({ userId }) => {
      if (userId === myId) setAudioState('denied');
      setAudioRequests(prev => prev.filter(r => r.userId !== userId));
    };
    sig.onParticipantMuted = ({ userId, muted }) => {
      if (userId === myId) {
        setServerMuted(muted ?? true);
        setServerMuteNonce(n => n + 1);
      }
    };
    sig.onRoleChanged = (data: any) => {
      if (data?.userId) setParticipantRoles(prev => new Map(prev).set(data.userId, data.role));
      if (data?.userId === myId) {
        setMyRole(data.role as MyRole);
        if (['co_organizer', 'organizer', 'presenter', 'moderator'].includes(data.role)) {
          setAudioState('approved');
          setMicEnableNonce(n => n + 1);
        }
      }
    };
    sig.onRecordingStatus = ({ isRecording: r }) => setIsRecording(r);
    sig.onSessionEnded    = () => setConnStatus('ended');

    sig.connect();
    return () => { sig.disconnect(); };
  }, [signalToken, roomId]);

  // ── Sidebar toggle ────────────────────────────────────────────────────────
  const onTab = useCallback((tab: SideTab) => {
    if (sidebarOpen && activeTab === tab) { setSidebarOpen(false); }
    else { setActiveTab(tab); setSidebarOpen(true); if (tab === 'chat') setUnreadChat(0); }
  }, [sidebarOpen, activeTab]);

  // ── Callbacks ─────────────────────────────────────────────────────────────
  const onSendChat     = useCallback((m: string) => sigRef.current?.sendChat(m), []);
  const onReact        = useCallback((t: ReactionType) => sigRef.current?.sendReaction(t), []);
  const onRaiseHand    = useCallback(() => { sigRef.current?.raiseHand();  setMyHandRaised(true);  }, []);
  const onLowerHand    = useCallback(() => { sigRef.current?.lowerHand();  setMyHandRaised(false); }, []);
  const onRequestAudio = useCallback(() => { sigRef.current?.requestAudio(); setAudioState('pending'); }, []);
  const onApproveAudio = useCallback((uid: string) => sigRef.current?.approveAudio(uid), []);
  const onDenyAudio    = useCallback((uid: string) => sigRef.current?.denyAudio(uid), []);
  const onPromote      = useCallback(async (uid: string, role: string) => {
    await promoteParticipant(sessionId, uid, role);
  }, [sessionId]);
  const onCreatePoll   = useCallback((q: string, opts: string[]) => sigRef.current?.createPoll(q, opts), []);
  const onVote         = useCallback((pid: string, oid: string) => { sigRef.current?.votePoll(pid, oid); setMyVote(oid); }, []);
  const onClosePoll    = useCallback((pid: string) => sigRef.current?.closePoll(pid), []);
  const onSubmitQ      = useCallback((t: string) => sigRef.current?.submitQuestion(t), []);
  const onApproveQ     = useCallback((id: string) => sigRef.current?.approveQuestion(id), []);
  const onRejectQ      = useCallback((id: string) => sigRef.current?.rejectQuestion(id), []);
  const onAnswerQ      = useCallback((id: string, ans: string) => sigRef.current?.answerQuestion(id, ans), []);
  const onUpvoteQ      = useCallback((id: string) => sigRef.current?.upvoteQuestion(id), []);

  // ── Leave ─────────────────────────────────────────────────────────────────
  const onLeave = useCallback(() => {
    userLeftRef.current = true;
    stopRec();
    if (roomId) clearClassroomSession(roomId);
    navigate(isHost ? '/dashboard' : '/');
  }, [roomId, isHost, stopRec]);

  function handleLkDisconnected(reason?: DisconnectReason) {
    if (connStatus === 'ended') { if (roomId) clearClassroomSession(roomId); navigate(isHost ? '/dashboard' : '/'); return; }
    const userLeave  = userLeftRef.current;
    const serverKill = reason === DisconnectReason.DUPLICATE_IDENTITY || reason === DisconnectReason.ROOM_DELETED;
    if (userLeave || serverKill) { if (roomId) clearClassroomSession(roomId); navigate(isHost ? '/dashboard' : '/'); }
    else { setConnStatus('reconnecting'); setReconnectN(c => c + 1); }
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!liveKitToken) return (
    <div style={fullCenter}>
      <AlertCircle size={44} color={RED}/>
      <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Session expired or invalid link.</p>
      <button className="btn btn-primary" onClick={() => navigate('/')}>Go Home</button>
    </div>
  );

  if (connStatus === 'ended') return (
    <div style={{ ...fullCenter, textAlign: 'center', gap: 18 }}>
      <CheckCircle size={52} color={GREEN}/>
      <h2 style={{ fontSize: 22 }}>Session Ended</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 340 }}>
        {isHost ? 'You ended this session.' : 'The host has ended this session.'}
      </p>
      <button className="btn btn-primary" onClick={() => {
        if (roomId) clearClassroomSession(roomId);
        navigate(isHost ? '/dashboard' : '/');
      }}>
        {isHost ? 'Back to Dashboard' : 'Go Home'}
      </button>
    </div>
  );

  if (error) return (
    <div style={{ ...fullCenter, textAlign: 'center', gap: 16 }}>
      <AlertCircle size={44} color={RED}/>
      <h2 style={{ color: RED }}>Connection Failed</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 380 }}>{error}</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-secondary" onClick={() => setError(null)}>Retry</button>
        <button className="btn btn-primary" onClick={onLeave}>{isHost ? 'Back' : 'Home'}</button>
      </div>
    </div>
  );

  // ── Context object for ClassroomInner ─────────────────────────────────────
  const ctx: SigCtx = {
    sigRef, chatMessages, reactions, activePoll, pollResult, myVote,
    questions, audioRequests, raisedHands, participantRoles,
    unreadChat, myHandRaised, audioState, micEnableNonce, serverMuteNonce, serverMuted,
    myRole, myId,
    sessionId, isHost, isRecording, connStatus, reconnectN,
    sidebarOpen, activeTab, cameraErr,
    onTab, onSendChat, onReact, onRaiseHand, onLowerHand,
    onRequestAudio, onApproveAudio, onDenyAudio, onPromote,
    onCreatePoll, onVote, onClosePoll, onSubmitQ, onApproveQ,
    onRejectQ, onAnswerQ, onUpvoteQ,
    onLeave, onDismissCamErr: () => setCameraErr(null),
    onToggleRec: toggleRec, recBusy,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: SHELL }}>
        <LiveKitRoom
          token={liveKitToken} serverUrl={livekitUrl}
          video={false} audio={isHost} connect={true}
          data-lk-theme="default"
          connectOptions={{ autoSubscribe: true }}
          options={{
            adaptiveStream: true,
            dynacast: true,
            disconnectOnPageLeave: false,
            publishDefaults: {
              simulcast: true,
              // 4K → 1080p → 720p simulcast layers
              videoSimulcastLayers: [VideoPresets.h2160, VideoPresets.h1080, VideoPresets.h720],
              videoCodec: 'vp9',
              dtx: false,
              stopMicTrackOnMute: false,
              forceStereo: true,              // stereo mic when browser supports it
              // Max screen-share bitrate for 4K fidelity
              screenShareEncoding: { maxBitrate: 8_000_000, maxFramerate: 15 },
            },
            audioCaptureDefaults: {
              echoCancellation:  true,
              noiseSuppression:  true,
              autoGainControl:   true,
              sampleRate:        48000,  // CD-quality sample rate
              channelCount:      2,      // stereo capture
            },
            videoCaptureDefaults: {
              resolution: VideoPresets.h2160.resolution,  // 4K camera capture
            },
          }}
          style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
          onDisconnected={handleLkDisconnected}
          onError={err => {
            const m = (err?.message ?? '').toLowerCase();
            if (m.includes('client initiated') || m.includes('duplicate identity') ||
                m.includes('room deleted')      || m.includes('room not found')) return;
            if (m.includes('permission denied') || m.includes('notallowederror') ||
                m.includes('notfounderror')      || m.includes('notreadableerror') ||
                m.includes('video source')       || m.includes('audio source')) {
              setCameraErr(err.message); return;
            }
            setError(err.message);
          }}
        >
          <ClassroomInner {...ctx}/>
        </LiveKitRoom>
      </div>

      {/* Global keyframe styles */}
      <style>{`
        @keyframes spin     { to { transform:rotate(360deg); } }
        @keyframes pulse    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.2)} }
        @keyframes recPulse { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn  { from{opacity:0;transform:translateX(12px)} to{opacity:1;transform:translateX(0)} }

        /* ─ control button ─ */
        .cls-ctrl {
          display:inline-flex; align-items:center; justify-content:center; gap:5px;
          padding:0 13px; height:36px; border-radius:7px;
          border:1px solid rgba(255,255,255,0.1);
          background:rgba(255,255,255,0.06);
          color:var(--text-muted); font-size:12px; font-weight:600;
          cursor:pointer; white-space:nowrap;
          font-family:'Inter',sans-serif; line-height:1;
          transition:background 0.14s, border-color 0.14s, color 0.14s;
        }
        .cls-ctrl:hover:not(:disabled) {
          background:rgba(255,255,255,0.11); color:#e8eaf0;
        }
        .cls-ctrl:disabled { opacity:.42; cursor:not-allowed; }
        .cls-ctrl span { line-height:1; }

        .cls-ctrl[data-state="active"]  { background:rgba(37,99,235,0.18)!important; border-color:rgba(37,99,235,0.4)!important; color:#2563eb!important; }
        .cls-ctrl[data-state="muted"]   { background:rgba(239,68,68,0.14)!important; border-color:rgba(239,68,68,0.35)!important; color:#ef4444!important; }
        .cls-ctrl[data-state="danger"]  { background:rgba(239,68,68,0.14)!important; border-color:rgba(239,68,68,0.35)!important; color:#ef4444!important; }
        .cls-ctrl[data-state="warn"]    { background:rgba(245,158,11,0.13)!important; border-color:rgba(245,158,11,0.34)!important; color:#f59e0b!important; }
        .cls-ctrl[data-state="leave"]   { background:rgba(239,68,68,0.1)!important; border-color:rgba(239,68,68,0.3)!important; color:#ef4444!important; }
        .cls-ctrl[data-state="loading"] { opacity:.7; }

        /* ─ secondary button ─ */
        .cls-btn-sec {
          padding:9px 18px; border-radius:8px; border:1px solid rgba(255,255,255,0.15);
          background:rgba(255,255,255,0.07); color:#e8eaf0; font-size:13px; font-weight:600;
          cursor:pointer; font-family:'Inter',sans-serif;
        }
        .cls-btn-sec:hover { background:rgba(255,255,255,0.12); }

        /* ─ suppress LK device picker ─ */
        .lk-media-device-select,
        .lk-button-group-menu { display:none!important; }

        /* ─ LK tile ─ */
        .lk-participant-tile { border-radius:10px!important; overflow:hidden!important; }
        .lk-participant-tile[data-lk-speaking="true"] {
          outline:2px solid rgba(34,197,94,0.6)!important; outline-offset:-2px;
        }
      `}</style>
    </>
  );
}

const fullCenter: React.CSSProperties = {
  height: '100vh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20,
};
