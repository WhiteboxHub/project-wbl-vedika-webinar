import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useParticipants,
  useTracks,
  useLocalParticipant,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { Loader2, MicOff, UserX, Pin, Square, ShieldCheck } from 'lucide-react';
import { removeParticipant, muteParticipant } from '../lib/api';

// ─── Host Controls Panel ─────────────────────────────────────────────────────
function HostControls({ sessionId, onEndMeeting }: { sessionId: string; onEndMeeting: () => void }) {
  const participants = useParticipants();
  const remoteParticipants = participants.filter(p => !p.isLocal);

  return (
    <div style={{
      width: '280px', flexShrink: 0,
      background: 'rgba(10,10,10,0.9)',
      borderLeft: '1px solid var(--border-color)',
      display: 'flex', flexDirection: 'column',
      backdropFilter: 'blur(20px)',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ShieldCheck size={16} color="var(--primary-color)" />
        <span style={{ fontSize: '14px', fontWeight: 700 }}>Host Controls</span>
      </div>

      {/* End meeting button */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <button onClick={onEndMeeting} style={{
          width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.5)',
          background: 'rgba(239,68,68,0.15)', color: 'var(--error-color)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          fontSize: '13px', fontWeight: 600,
        }}>
          <Square size={14} /> End for Everyone
        </button>
      </div>

      {/* Participants */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Participants ({remoteParticipants.length})
        </p>

        {remoteParticipants.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
            No attendees yet
          </p>
        )}

        {remoteParticipants.map(participant => (
          <div key={participant.identity} style={{
            padding: '10px 12px', borderRadius: '10px', marginBottom: '8px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{participant.name || participant.identity}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {participant.isMicrophoneEnabled ? '🎙️ Mic On' : '🔇 Muted'}
                  {participant.isCameraEnabled ? ' · 📹 Camera' : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  title="Mute participant"
                  onClick={() => {
                    const audioTrack = [...participant.trackPublications.values()].find(t => t.kind === Track.Kind.Audio);
                    if (audioTrack) muteParticipant(sessionId, participant.identity, audioTrack.trackSid);
                  }}
                  style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
                >
                  <MicOff size={12} />
                </button>
                <button
                  title="Remove participant"
                  onClick={() => { if (confirm(`Remove ${participant.name}?`)) removeParticipant(sessionId, participant.identity); }}
                  style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--error-color)' }}
                >
                  <UserX size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Classroom ───────────────────────────────────────────────────────────
export default function Classroom() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as {
    liveKitToken?: string;
    livekitUrl?: string;
    participantName?: string;
    isHost?: boolean;
    sessionId?: string;
  } | null;

  const [token, setToken] = useState<string | null>(null);
  const serverUrl = state?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880';
  const isHost = state?.isHost || false;
  const sessionId = state?.sessionId || '';

  useEffect(() => {
    const stateToken = state?.liveKitToken;
    if (!stateToken) { navigate('/'); return; }
    setToken(stateToken);
  }, [location, navigate]);

  if (!token) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh' }}>
        <Loader2 size={48} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex' }}>
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={serverUrl}
        data-lk-theme="default"
        style={{ flex: 1, height: '100vh', overflow: 'hidden' }}
        onDisconnected={() => navigate(isHost ? '/dashboard' : '/')}
      >
        <VideoConference />
        <RoomAudioRenderer />

        {/* Host controls sidebar */}
        {isHost && sessionId && (
          <HostControls
            sessionId={sessionId}
            onEndMeeting={() => navigate('/dashboard')}
          />
        )}
      </LiveKitRoom>
    </div>
  );
}
