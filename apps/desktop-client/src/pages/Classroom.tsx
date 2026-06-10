import React, { useEffect, useState } from 'react';
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
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { Loader2, MicOff, UserX, Square, Users, MessageSquare, Hand } from 'lucide-react';
import { removeParticipant, muteParticipant } from '../lib/api';
import { loadClassroomSession, clearClassroomSession } from '../lib/classroom-session';

// ─── Interactive Participant List ──────────────────────────────────────────────
function ParticipantList({ isHost, sessionId }: { isHost: boolean; sessionId: string }) {
  const participants = useParticipants();
  
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        In Session ({participants.length})
      </p>

      {participants.length === 0 && (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
          No one is here
        </p>
      )}

      {participants.map(participant => {
        let meta: any = {};
        try { meta = JSON.parse(participant.metadata || '{}'); } catch {}

        return (
          <div key={participant.identity} style={{
            padding: '10px 12px', borderRadius: '10px', marginBottom: '8px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                {(participant.name || participant.identity)[0].toUpperCase()}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600 }}>{participant.name || participant.identity}</p>
                  {meta.handRaised && <span title="Hand Raised" style={{ animation: 'bounce 1s infinite' }}>✋</span>}
                  {participant.isLocal && <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '10px', color: 'var(--text-muted)' }}>You</span>}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {participant.isMicrophoneEnabled ? '🎙️ Mic On' : '🔇 Muted'}
                  {participant.isCameraEnabled ? ' · 📹 Camera' : ''}
                </p>
              </div>
            </div>
            
            {isHost && !participant.isLocal && (
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
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Custom Stage with Raise Hand ─────────────────────────────────────────────
function Stage({ isHost, onEndMeeting }: { isHost: boolean; onEndMeeting: () => void }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const { localParticipant } = useLocalParticipant();
  const [handRaised, setHandRaised] = useState(false);

  // Sync state with metadata
  useEffect(() => {
    if (!localParticipant) return;
    try {
      const meta = JSON.parse(localParticipant.metadata || '{}');
      if (meta.handRaised !== handRaised) setHandRaised(!!meta.handRaised);
    } catch {}
  }, [localParticipant?.metadata]);

  const toggleRaiseHand = () => {
    if (!localParticipant) return;
    try {
      const meta = JSON.parse(localParticipant.metadata || '{}');
      meta.handRaised = !meta.handRaised;
      localParticipant.setMetadata(JSON.stringify(meta));
      setHandRaised(meta.handRaised);
    } catch {
      localParticipant.setMetadata(JSON.stringify({ handRaised: true }));
      setHandRaised(true);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#000', position: 'relative' }}>
      {tracks.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          <h3>Waiting for participants to turn on their cameras...</h3>
        </div>
      ) : (
        <GridLayout tracks={tracks} style={{ flex: 1, padding: '16px' }}>
          <ParticipantTile />
        </GridLayout>
      )}
      
      {/* Custom Control Bar Area */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '16px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <ControlBar variation="minimal" style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', borderRadius: '24px', padding: '4px 12px' }} />
        
        <button 
          onClick={toggleRaiseHand}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '6px', 
            padding: '10px 16px', borderRadius: '24px',
            background: handRaised ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255,255,255,0.1)',
            border: `1px solid ${handRaised ? 'rgba(234, 179, 8, 0.5)' : 'rgba(255,255,255,0.2)'}`,
            color: handRaised ? '#eab308' : '#fff',
            cursor: 'pointer', backdropFilter: 'blur(10px)',
            fontWeight: 600, fontSize: '13px', transition: 'all 0.2s'
          }}
        >
          <Hand size={16} /> {handRaised ? 'Lower Hand' : 'Raise Hand'}
        </button>

        {isHost && (
          <button 
            onClick={onEndMeeting}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '6px', 
              padding: '10px 16px', borderRadius: '24px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              color: '#ef4444',
              cursor: 'pointer', backdropFilter: 'blur(10px)',
              fontWeight: 600, fontSize: '13px'
            }}
          >
            <Square size={16} /> End Meeting
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Classroom ───────────────────────────────────────────────────────────
export default function Classroom() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Resolve session data from router state OR sessionStorage (for direct URL / refresh)
  const resolvedState = (location.state as any) || (roomId ? loadClassroomSession(roomId) : null);

  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string>('');
  const isHost = resolvedState?.isHost || false;
  const sessionId = resolvedState?.sessionId || '';

  const [activeTab, setActiveTab] = useState<'chat'|'participants'>('chat');
  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting...');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const stateToken = resolvedState?.liveKitToken;
    const stateUrl = resolvedState?.livekitUrl;
    if (!stateToken) { navigate('/'); return; }
    setToken(stateToken);
    setLivekitUrl(stateUrl || '');
    console.log('[Classroom] serverUrl:', stateUrl);
    console.log('[Classroom] token length:', stateToken?.length);
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
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      {/* Connection status banner */}
      {(connectionError || connectionStatus === 'Connecting...') && (
        <div style={{
          padding: '8px 16px',
          background: connectionError ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
          color: connectionError ? '#ef4444' : '#eab308',
          fontSize: '13px', fontWeight: 600, textAlign: 'center',
          borderBottom: `1px solid ${connectionError ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.3)'}`
        }}>
          {connectionError ? `❌ Connection Error: ${connectionError}` : `⏳ ${connectionStatus} (Server: ${livekitUrl})`}
        </div>
      )}
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={livekitUrl}
        data-lk-theme="default"
        style={{ flex: 1, display: 'flex' }}
        onDisconnected={() => {
          if (roomId) clearClassroomSession(roomId);
          navigate(isHost ? '/dashboard' : '/');
        }}
        onConnected={() => { setConnectionStatus('Connected!'); setConnectionError(null); console.log('[Classroom] Connected to LiveKit!'); }}
        onError={(err) => { setConnectionError(err.message); console.error('[Classroom] LiveKit error:', err); }}
      >
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
          
          {/* Main Stage (75%) */}
          <Stage isHost={isHost} onEndMeeting={() => navigate('/dashboard')} />

          {/* Organizer / Attendee Sidebar (25%) */}
          <div style={{ 
            width: '320px', flexShrink: 0, 
            background: 'rgba(15,15,20,0.95)', 
            borderLeft: '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column' 
          }}>
            
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '12px 16px 0 16px', gap: '20px' }}>
              <button 
                onClick={() => setActiveTab('chat')}
                style={{ 
                  padding: '8px 4px', background: 'transparent', border: 'none', 
                  color: activeTab === 'chat' ? 'var(--primary-color)' : 'var(--text-muted)',
                  borderBottom: `2px solid ${activeTab === 'chat' ? 'var(--primary-color)' : 'transparent'}`,
                  fontWeight: activeTab === 'chat' ? 600 : 500, fontSize: '14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <MessageSquare size={16} /> Chat
              </button>
              <button 
                onClick={() => setActiveTab('participants')}
                style={{ 
                  padding: '8px 4px', background: 'transparent', border: 'none', 
                  color: activeTab === 'participants' ? 'var(--primary-color)' : 'var(--text-muted)',
                  borderBottom: `2px solid ${activeTab === 'participants' ? 'var(--primary-color)' : 'transparent'}`,
                  fontWeight: activeTab === 'participants' ? 600 : 500, fontSize: '14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <Users size={16} /> Participants
              </button>
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}>
                <Chat style={{ flex: 1, border: 'none', background: 'transparent' }} />
              </div>
              
              <div style={{ display: activeTab === 'participants' ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}>
                <ParticipantList isHost={isHost} sessionId={sessionId} />
              </div>
            </div>

          </div>
        </div>
        <RoomAudioRenderer />
      </LiveKitRoom>
      <style>{`@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }`}</style>
    </div>
  );
}
