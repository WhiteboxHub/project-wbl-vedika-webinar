import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  GridLayout,
  ParticipantTile,
  ControlBar,
  Chat,
  useParticipants,
  useTracks,
  useLocalParticipant,
  useConnectionState,
} from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import '@livekit/components-styles';
import {
  Loader2, MicOff, UserX, Square, Users,
  MessageSquare, Hand, Wifi, WifiOff, AlertCircle,
} from 'lucide-react';
import { removeParticipant, muteParticipant } from '../lib/api';
import { loadClassroomSession, clearClassroomSession } from '../lib/classroom-session';

// ─── Participant List ──────────────────────────────────────────────────────────
function ParticipantList({ isHost, sessionId }: { isHost: boolean; sessionId: string }) {
  const participants = useParticipants();
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Participants ({participants.length})
      </p>
      {participants.length === 0 && (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>
          No one here yet
        </p>
      )}
      {participants.map(p => {
        let meta: Record<string, any> = {};
        try { meta = JSON.parse(p.metadata || '{}'); } catch {}
        return (
          <div key={p.identity} style={{
            padding: '10px', borderRadius: '10px', marginBottom: '6px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700, flexShrink: 0,
              }}>
                {(p.name || p.identity || '?')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{p.name || p.identity}</span>
                  {meta.handRaised && <span style={{ fontSize: '14px' }} title="Hand raised">✋</span>}
                  {p.isLocal && (
                    <span style={{ fontSize: '10px', background: 'rgba(124,58,237,0.2)', color: 'var(--primary-color)', padding: '1px 6px', borderRadius: '8px' }}>You</span>
                  )}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {p.isMicrophoneEnabled ? '🎙️ Mic on' : '🔇 Muted'}
                  {p.isCameraEnabled ? ' · 📹 Camera on' : ''}
                </p>
              </div>
            </div>
            {isHost && !p.isLocal && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  title="Mute"
                  onClick={() => {
                    const track = [...p.trackPublications.values()].find(t => t.kind === Track.Kind.Audio);
                    if (track) muteParticipant(sessionId, p.identity, track.trackSid);
                  }}
                  style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
                ><MicOff size={11} /></button>
                <button
                  title="Remove"
                  onClick={() => { if (window.confirm(`Remove ${p.name}?`)) removeParticipant(sessionId, p.identity); }}
                  style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--error-color)' }}
                ><UserX size={11} /></button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Stage (video grid + controls) ────────────────────────────────────────────
function Stage({ isHost, onLeave, sessionId }: { isHost: boolean; onLeave: () => void; sessionId: string }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const [handRaised, setHandRaised] = useState(false);

  useEffect(() => {
    try {
      const meta = JSON.parse(localParticipant?.metadata || '{}');
      setHandRaised(!!meta.handRaised);
    } catch {}
  }, [localParticipant?.metadata]);

  const toggleHand = () => {
    if (!localParticipant) return;
    try {
      const meta = JSON.parse(localParticipant.metadata || '{}');
      meta.handRaised = !meta.handRaised;
      localParticipant.setMetadata(JSON.stringify(meta));
      setHandRaised(meta.handRaised);
    } catch {}
  };

  const isConnecting = connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting;
  const isConnected = connectionState === ConnectionState.Connected;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', background: '#0a0a0f' }}>

      {/* Connection overlay while connecting */}
      {isConnecting && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)', gap: '16px',
        }}>
          <Loader2 size={40} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#fff', fontWeight: 600 }}>Connecting to room…</p>
        </div>
      )}

      {/* Video grid */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {isConnected && tracks.length > 0 ? (
          <GridLayout tracks={tracks} style={{ width: '100%', height: '100%' }}>
            <ParticipantTile />
          </GridLayout>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(124,58,237,0.1)', border: '2px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={36} color="var(--primary-color)" />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '15px', fontWeight: 500 }}>
              {isConnected ? 'No cameras on yet' : 'Joining room…'}
            </p>
            {isConnected && (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                {isHost ? 'Turn on your camera to begin' : 'Waiting for the host to share video'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Controls bar — always visible at the bottom */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '10px', padding: '12px 16px',
        background: 'rgba(10,10,15,0.95)',
        borderTop: '1px solid var(--border-color)',
        flexWrap: 'wrap',
      }}>
        {/* LiveKit built-in controls (mic, camera, screen share, disconnect) */}
        <div className="lk-control-bar-wrapper">
          <ControlBar
            variation="verbose"
            controls={{
              microphone: true,
              camera: isHost,        // only host has camera control
              screenShare: isHost,   // only host shares screen
              leave: false,          // we handle leave ourselves
            }}
          />
        </div>

        {/* Raise / Lower hand */}
        <button
          onClick={toggleHand}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 16px', borderRadius: '8px', cursor: 'pointer',
            background: handRaised ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${handRaised ? 'rgba(234,179,8,0.5)' : 'rgba(255,255,255,0.15)'}`,
            color: handRaised ? '#eab308' : 'var(--text-muted)',
            fontSize: '13px', fontWeight: 600, transition: 'all 0.2s',
          }}
        >
          <Hand size={15} />
          {handRaised ? 'Lower Hand' : 'Raise Hand'}
        </button>

        {/* Leave / End */}
        <button
          onClick={onLeave}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 16px', borderRadius: '8px', cursor: 'pointer',
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: '#ef4444', fontSize: '13px', fontWeight: 600,
          }}
        >
          <Square size={14} />
          {isHost ? 'End Meeting' : 'Leave'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Classroom ────────────────────────────────────────────────────────────
export default function Classroom() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Resolve session data: router state → sessionStorage fallback
  const sessionData = useMemo(
    () => (location.state as any) || (roomId ? loadClassroomSession(roomId) : null),
    [roomId] // intentionally NOT including location.state to avoid re-mounts
  );

  const liveKitToken: string = sessionData?.liveKitToken || '';
  const livekitUrl: string   = sessionData?.livekitUrl   || 'ws://localhost:7880';
  const isHost: boolean      = sessionData?.isHost       || false;
  const sessionId: string    = sessionData?.sessionId    || '';

  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat');
  const [error, setError] = useState<string | null>(null);

  // Persist so refresh works
  useEffect(() => {
    if (roomId && sessionData?.liveKitToken) {
      // already persisted by WaitingRoom/SessionDetail — just verify
    }
  }, []);

  // No token → send home
  if (!liveKitToken) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh', gap: '16px' }}>
        <AlertCircle size={48} color="var(--error-color)" />
        <p style={{ color: 'var(--text-muted)' }}>Session expired or invalid link.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Go Home</button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh', gap: '16px', padding: '20px', textAlign: 'center' }}>
        <AlertCircle size={48} color="var(--error-color)" />
        <h2 style={{ color: '#ef4444' }}>Connection Failed</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '400px' }}>{error}</p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>LiveKit URL: <code>{livekitUrl}</code></p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => { setError(null); }}>Retry</button>
          <button className="btn btn-primary" onClick={() => navigate(isHost ? '/dashboard' : '/')}>
            {isHost ? 'Back to Dashboard' : 'Go Home'}
          </button>
        </div>
      </div>
    );
  }

  function handleLeave() {
    if (roomId) clearClassroomSession(roomId);
    navigate(isHost ? '/dashboard' : '/');
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0a0a0f' }}>
      <LiveKitRoom
        token={liveKitToken}
        serverUrl={livekitUrl}
        // Attendees (canPublish=false) must NOT pass video/audio=true — it causes a silent error
        video={isHost}
        audio={isHost}
        connect={true}
        data-lk-theme="default"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
        onDisconnected={() => {
          if (roomId) clearClassroomSession(roomId);
          navigate(isHost ? '/dashboard' : '/');
        }}
        onError={(err) => {
          console.error('[Classroom] LiveKit error:', err);
          setError(err.message);
        }}
      >
        {/* Top bar */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'rgba(10,10,15,0.95)', borderBottom: '1px solid var(--border-color)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Live Session</span>
            {isHost && (
              <span style={{ fontSize: '11px', background: 'rgba(124,58,237,0.2)', color: 'var(--primary-color)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                HOST
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('chat')}
              style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, background: activeTab === 'chat' ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)', color: activeTab === 'chat' ? 'var(--primary-color)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}
            ><MessageSquare size={14} /> Chat</button>
            <button
              onClick={() => setActiveTab('participants')}
              style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, background: activeTab === 'participants' ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)', color: activeTab === 'participants' ? 'var(--primary-color)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}
            ><Users size={14} /> People</button>
          </div>
        </div>

        {/* Main body */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          {/* Stage (video + controls) */}
          <Stage isHost={isHost} onLeave={handleLeave} sessionId={sessionId} />

          {/* Sidebar */}
          <div style={{
            width: '300px', flexShrink: 0,
            background: 'rgba(12,12,18,0.98)', borderLeft: '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column', minHeight: 0,
          }}>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {activeTab === 'chat' ? (
                <Chat style={{ flex: 1, minHeight: 0, border: 'none', background: 'transparent' }} />
              ) : (
                <ParticipantList isHost={isHost} sessionId={sessionId} />
              )}
            </div>
          </div>
        </div>

        <RoomAudioRenderer />
      </LiveKitRoom>

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes pulse   { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.6; transform:scale(1.2); } }
        .lk-control-bar-wrapper { display:flex; align-items:center; }
        .lk-control-bar { background: transparent !important; border: none !important; padding: 0 !important; gap: 6px !important; }
        .lk-button { background: rgba(255,255,255,0.08) !important; border: 1px solid rgba(255,255,255,0.12) !important; border-radius: 8px !important; color: #fff !important; width: 44px !important; height: 38px !important; }
        .lk-button:hover { background: rgba(255,255,255,0.15) !important; }
        .lk-button[aria-pressed="true"] { background: rgba(239,68,68,0.2) !important; border-color: rgba(239,68,68,0.4) !important; color: #ef4444 !important; }
        .lk-chat { background: transparent !important; }
        .lk-chat-messages { background: transparent !important; }
        .lk-chat-entry { background: rgba(255,255,255,0.04) !important; border-radius: 8px !important; color: #f8fafc !important; }
        .lk-chat-form { background: rgba(255,255,255,0.04) !important; border-top: 1px solid rgba(255,255,255,0.08) !important; }
        .lk-chat-form input { background: transparent !important; color: #f8fafc !important; }
        .lk-grid-layout { background: transparent !important; }
        .lk-participant-tile { border-radius: 12px !important; overflow: hidden !important; }
        .lk-participant-placeholder { background: rgba(124,58,237,0.15) !important; }
      `}</style>
    </div>
  );
}
