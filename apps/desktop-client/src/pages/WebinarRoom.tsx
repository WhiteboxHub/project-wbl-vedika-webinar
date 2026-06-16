import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Mic, MicOff, Camera, CameraOff, MonitorUp, MonitorOff,
  Hand, Square, Users, MessageSquare, Send, AlertCircle,
  Loader2, Wifi, WifiOff, UserX, PhoneOff,
} from 'lucide-react';
import { SignalingClient } from '../lib/signaling';
import { WebRTCRoom } from '../lib/webrtc-room';
import { loadWebinarSession, clearWebinarSession, getSignalServerUrl, WebinarSessionData } from '../lib/classroom-session';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChatMsg { from: string; fromName: string; message: string; ts: number; isSelf: boolean; }
interface Participant { userId: string; name: string; role: string; handRaised: boolean; }

// ─── Video Tile ────────────────────────────────────────────────────────────────

function VideoTile({ stream, name, isLocal, muted }: { stream: MediaStream | null; name: string; isLocal?: boolean; muted?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div style={{
      position: 'relative', borderRadius: '14px', overflow: 'hidden',
      background: '#111118', border: '1px solid rgba(255,255,255,0.06)',
      aspectRatio: '16/9', minHeight: '200px',
    }}>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay playsInline muted={muted ?? isLocal}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', fontWeight: 700, color: '#fff',
          }}>
            {(name || '?')[0].toUpperCase()}
          </div>
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: '8px', left: '8px',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        padding: '4px 10px', borderRadius: '6px',
        fontSize: '12px', fontWeight: 600, color: '#fff',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        {name} {isLocal && <span style={{ fontSize: '10px', opacity: 0.7 }}>(You)</span>}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function WebinarRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Resolve session data
  const sessionData = useMemo<WebinarSessionData | null>(
    () => (location.state as WebinarSessionData) || (roomId ? loadWebinarSession(roomId) : null),
    [roomId]
  );

  // Refs for signaling + room (persist across renders)
  const signalingRef = useRef<SignalingClient | null>(null);
  const roomRef = useRef<WebRTCRoom | null>(null);
  const mountedRef = useRef(true);

  // State
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream[]>>(new Map());
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat');
  const [handRaised, setHandRaised] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const isHost = sessionData?.isHost ?? false;
  const userName = sessionData?.userName ?? 'Guest';
  const userId = sessionData?.userId ?? '';
  const sessionId = sessionData?.sessionId ?? '';

  // ─── Initialize WebRTC Room ──────────────────────────────────────────────

  useEffect(() => {
    if (!sessionData || !roomId) return;

    mountedRef.current = true;

    const signalUrl = getSignalServerUrl();
    console.log('[WebinarRoom] Connecting to signal server:', signalUrl);
    const signaling = new SignalingClient(signalUrl);
    const room = new WebRTCRoom(signaling, sessionData.userId, sessionData.isHost);

    signalingRef.current = signaling;
    roomRef.current = room;

    // ── Callbacks ──

    signaling.onConnected = () => {
      console.log('[WebinarRoom] Signal connected, joining room:', roomId);
      signaling.joinRoom(roomId, sessionData.userId, {
        name: sessionData.userName,
        role: sessionData.isHost ? 'host' : 'attendee',
      });
      if (mountedRef.current) {
        setConnected(true);
        // Add self to participant list
        setParticipants(prev => {
          const next = new Map(prev);
          next.set(sessionData.userId, {
            userId: sessionData.userId,
            name: sessionData.userName,
            role: sessionData.isHost ? 'host' : 'attendee',
            handRaised: false,
          });
          return next;
        });
      }
    };

    signaling.onDisconnected = () => {
      if (mountedRef.current) setConnected(false);
    };

    signaling.onError = (msg: string) => {
      console.error('[WebinarRoom] Signal error:', msg);
      if (mountedRef.current) setError(msg);
    };

    room.onParticipantJoined = (uid: string, meta: any) => {
      if (!mountedRef.current) return;
      console.log('[WebinarRoom] Participant joined:', uid, meta);
      setParticipants(prev => {
        const next = new Map(prev);
        next.set(uid, { userId: uid, name: meta?.name || uid, role: meta?.role || 'attendee', handRaised: false });
        return next;
      });
      setConnected(true);
    };

    room.onParticipantLeft = (uid: string) => {
      if (!mountedRef.current) return;
      setParticipants(prev => { const n = new Map(prev); n.delete(uid); return n; });
      setRemoteStreams(prev => { const n = new Map(prev); n.delete(uid); return n; });
    };

    room.onRemoteStream = (uid: string, streams: MediaStream[]) => {
      if (!mountedRef.current) return;
      console.log('[WebinarRoom] Remote streams updated for:', uid, streams.length);
      setRemoteStreams(prev => new Map(prev).set(uid, streams));
      setConnected(true);
    };

    room.onRemoteStreamRemoved = (uid: string) => {
      if (!mountedRef.current) return;
      setRemoteStreams(prev => { const n = new Map(prev); n.delete(uid); return n; });
    };

    room.onChatMessage = (from: string, message: string, timestamp: number) => {
      if (!mountedRef.current) return;
      // Find name from participants
      const p = room.participants.get(from);
      setChatMessages(prev => [...prev, {
        from, fromName: p?.name || from, message, ts: timestamp, isSelf: from === sessionData.userId,
      }]);
    };

    room.onHandRaise = (uid: string, raised: boolean) => {
      if (!mountedRef.current) return;
      setParticipants(prev => {
        const n = new Map(prev);
        const p = n.get(uid);
        if (p) n.set(uid, { ...p, handRaised: raised });
        return n;
      });
    };

    room.onError = (err: Error) => {
      console.error('[WebinarRoom] Room error:', err);
    };

    // ── Start ──

    (async () => {
      try {
        // Host: try to start camera/mic, but don't block if unavailable
        if (sessionData.isHost) {
          try {
            const stream = await room.startLocalMedia(true, true);
            if (mountedRef.current) { setLocalStream(stream); setMicOn(true); setCamOn(true); }
          } catch (mediaErr: any) {
            console.warn('[WebinarRoom] Camera/mic not available:', mediaErr.message);
            // Try audio-only as fallback
            try {
              const audioStream = await room.startLocalMedia(false, true);
              if (mountedRef.current) { setLocalStream(audioStream); setMicOn(true); setCamOn(false); }
            } catch {
              console.warn('[WebinarRoom] No media devices available — joining without camera/mic');
              if (mountedRef.current) { setMicOn(false); setCamOn(false); }
            }
          }
        }

        signaling.connect();
      } catch (err: any) {
        console.error('[WebinarRoom] Init error:', err);
        if (mountedRef.current) setError(err.message || 'Failed to start');
      }
    })();

    return () => {
      mountedRef.current = false;
      room.dispose();
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ─── Controls ────────────────────────────────────────────────────────────

  const handleToggleMic = useCallback(async () => {
    if (!roomRef.current) return;
    const newState = await roomRef.current.toggleMic();
    setMicOn(newState);
  }, []);

  const handleToggleCamera = useCallback(async () => {
    if (!roomRef.current) return;
    const newState = await roomRef.current.toggleCamera();
    setCamOn(newState);
  }, []);

  const handleScreenShare = useCallback(async () => {
    if (!roomRef.current) return;
    if (screenSharing) {
      roomRef.current.stopScreenShare();
      setScreenStream(null);
      setScreenSharing(false);
    } else {
      try {
        const stream = await roomRef.current.startScreenShare();
        setScreenStream(stream);
        setScreenSharing(true);
        // Auto-stop when user clicks browser's native "Stop sharing"
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          roomRef.current?.stopScreenShare();
          setScreenStream(null);
          setScreenSharing(false);
        });
      } catch (err: any) {
        console.log('[WebinarRoom] Screen share cancelled');
      }
    }
  }, [screenSharing]);

  const handleRaiseHand = useCallback(() => {
    if (!roomRef.current) return;
    const newState = !handRaised;
    roomRef.current.raiseHand(newState);
    setHandRaised(newState);
  }, [handRaised]);

  const handleSendChat = useCallback(() => {
    if (!roomRef.current || !chatInput.trim()) return;
    roomRef.current.sendChat(chatInput.trim());
    setChatMessages(prev => [...prev, {
      from: userId, fromName: userName, message: chatInput.trim(), ts: Date.now(), isSelf: true,
    }]);
    setChatInput('');
  }, [chatInput, userId, userName]);

  const handleLeave = useCallback(() => {
    if (roomId) clearWebinarSession(roomId);
    roomRef.current?.dispose();
    navigate(isHost ? '/dashboard' : '/');
  }, [roomId, isHost, navigate]);

  // ─── No Session Data ─────────────────────────────────────────────────────

  if (!sessionData) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh', gap: '16px' }}>
        <AlertCircle size={48} color="var(--error-color)" />
        <p style={{ color: 'var(--text-muted)' }}>Session expired or invalid link.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Go Home</button>
      </div>
    );
  }

  // ─── Error State ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh', gap: '16px', padding: '20px', textAlign: 'center' }}>
        <AlertCircle size={48} color="var(--error-color)" />
        <h2 style={{ color: '#ef4444' }}>Connection Error</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '400px' }}>{error}</p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Signal Server: <code>{getSignalServerUrl()}</code></p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => { setError(null); window.location.reload(); }}>Retry</button>
          <button className="btn btn-primary" onClick={handleLeave}>
            {isHost ? 'Back to Dashboard' : 'Go Home'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const hostStreams = isHost 
    ? (localStream ? [localStream] : []) 
    : (remoteStreams.values().next().value || []);
  const participantsList = Array.from(participants.values());

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0a0a0f', color: '#f8fafc' }}>

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', background: 'rgba(10,10,15,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: connected ? '#10b981' : '#ef4444',
            boxShadow: connected ? '0 0 8px #10b981' : '0 0 8px #ef4444',
            animation: 'pulse 2s infinite',
          }} />
          <span style={{ fontWeight: 600, fontSize: '14px' }}>
            {connected ? 'Live Session' : 'Connecting…'}
          </span>
          {isHost && (
            <span style={{
              fontSize: '11px', background: 'rgba(124,58,237,0.2)', color: 'var(--primary-color)',
              padding: '2px 8px', borderRadius: '10px', fontWeight: 600,
            }}>HOST</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare size={14} />} label="Chat" count={chatMessages.length} />
          <TabButton active={activeTab === 'participants'} onClick={() => setActiveTab('participants')} icon={<Users size={14} />} label={`People (${participantsList.length})`} />
        </div>
      </div>

      {/* ── Main Body ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* ── Stage ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {/* Video Grid */}
          <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0, overflow: 'auto' }}>
            {/* Main video — host stream or screen share */}
            {screenStream ? (
              <>
                <VideoTile stream={screenStream} name={`${userName}'s Screen`} isLocal={isHost} />
                {localStream && isHost && (
                  <div style={{ position: 'absolute', bottom: '100px', right: '340px', width: '200px', zIndex: 5, borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(124,58,237,0.4)' }}>
                    <VideoTile stream={localStream} name={userName} isLocal muted />
                  </div>
                )}
              </>
            ) : hostStreams.length > 0 ? (
              <>
                <VideoTile stream={hostStreams[0]} name={isHost ? userName : 'Host'} isLocal={isHost} muted={isHost} />
                {hostStreams.length > 1 && (
                  <div style={{ position: 'absolute', bottom: '100px', right: '340px', width: '200px', zIndex: 5, borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(124,58,237,0.4)' }}>
                    <VideoTile stream={hostStreams[1]} name="Host Camera" isLocal={isHost} muted={isHost} />
                  </div>
                )}
              </>
            ) : (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '16px', minHeight: '300px',
              }}>
                <div style={{
                  width: '100px', height: '100px', borderRadius: '50%',
                  background: 'rgba(124,58,237,0.1)', border: '2px solid rgba(124,58,237,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {connected ? <Users size={40} color="var(--primary-color)" /> : <Loader2 size={40} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '16px', fontWeight: 500 }}>
                  {connected
                    ? (isHost ? 'Turn on your camera to begin' : 'Waiting for the host to share video…')
                    : 'Connecting to session…'
                  }
                </p>
              </div>
            )}

            {/* Attendee thumbnails (host sees remote streams) */}
            {isHost && remoteStreams.size > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {Array.from(remoteStreams.entries()).map(([uid, streams]) => {
                  const p = participants.get(uid);
                  return streams.map((stream, idx) => (
                    <div key={`${uid}-${idx}`} style={{ width: '160px' }}>
                      <VideoTile stream={stream} name={p?.name || uid} />
                    </div>
                  ));
                })}
              </div>
            )}
          </div>

          {/* ── Controls Bar ──────────────────────────────────────── */}
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', padding: '14px 16px',
            background: 'rgba(10,10,15,0.98)', borderTop: '1px solid rgba(255,255,255,0.06)',
            flexWrap: 'wrap',
          }}>
            {/* Mic */}
            {isHost && (
              <ControlButton
                active={micOn} onClick={handleToggleMic}
                icon={micOn ? <Mic size={18} /> : <MicOff size={18} />}
                label={micOn ? 'Mute' : 'Unmute'}
                danger={!micOn}
              />
            )}

            {/* Camera */}
            {isHost && (
              <ControlButton
                active={camOn} onClick={handleToggleCamera}
                icon={camOn ? <Camera size={18} /> : <CameraOff size={18} />}
                label={camOn ? 'Stop Camera' : 'Start Camera'}
                danger={!camOn}
              />
            )}

            {/* Screen Share */}
            {isHost && (
              <ControlButton
                active={!screenSharing} onClick={handleScreenShare}
                icon={screenSharing ? <MonitorOff size={18} /> : <MonitorUp size={18} />}
                label={screenSharing ? 'Stop Share' : 'Share Screen'}
                highlight={screenSharing}
              />
            )}

            {/* Raise Hand (attendees) */}
            <ControlButton
              active={!handRaised} onClick={handleRaiseHand}
              icon={<Hand size={18} />}
              label={handRaised ? 'Lower Hand' : 'Raise Hand'}
              highlight={handRaised}
              highlightColor="#eab308"
            />

            {/* Leave / End */}
            <ControlButton
              active={false} onClick={handleLeave}
              icon={isHost ? <Square size={16} /> : <PhoneOff size={16} />}
              label={isHost ? 'End Meeting' : 'Leave'}
              danger
            />
          </div>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <div style={{
          width: '300px', flexShrink: 0,
          background: 'rgba(12,12,18,0.98)', borderLeft: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          {activeTab === 'chat' ? (
            /* Chat */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {chatMessages.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
                    No messages yet. Say hi! 👋
                  </p>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} style={{
                    padding: '8px 10px', borderRadius: '10px',
                    background: msg.isSelf ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${msg.isSelf ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: msg.isSelf ? 'var(--primary-color)' : 'var(--text-muted)' }}>
                        {msg.isSelf ? 'You' : msg.fromName}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', lineHeight: 1.4, color: '#e2e8f0' }}>{msg.message}</p>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div style={{
                flexShrink: 0, padding: '10px', borderTop: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', gap: '8px',
              }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                  placeholder="Type a message…"
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', padding: '10px 12px', color: '#f8fafc', fontSize: '13px', outline: 'none',
                  }}
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim()}
                  style={{
                    width: '38px', height: '38px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    background: chatInput.trim() ? 'var(--primary-color)' : 'rgba(255,255,255,0.06)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.2s',
                  }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          ) : (
            /* Participants */
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Participants ({participantsList.length})
              </p>
              {participantsList.length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>
                  No one here yet
                </p>
              )}
              {participantsList.map(p => (
                <div key={p.userId} style={{
                  padding: '10px', borderRadius: '10px', marginBottom: '6px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 700, flexShrink: 0,
                    }}>
                      {(p.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{p.name}</span>
                        {p.handRaised && <span title="Hand raised">✋</span>}
                        {p.userId === userId && (
                          <span style={{ fontSize: '10px', background: 'rgba(124,58,237,0.2)', color: 'var(--primary-color)', padding: '1px 6px', borderRadius: '8px' }}>You</span>
                        )}
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {p.role === 'host' ? '🎙️ Host' : '👤 Attendee'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
      `}</style>
    </div>
  );
}

// ─── Helper Components ─────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon, label, count }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number;
}) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
      fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '5px',
      background: active ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)',
      color: active ? 'var(--primary-color)' : 'var(--text-muted)',
      transition: 'all 0.2s',
    }}>
      {icon} {label}
    </button>
  );
}

function ControlButton({ active, onClick, icon, label, danger, highlight, highlightColor }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
  danger?: boolean; highlight?: boolean; highlightColor?: string;
}) {
  const bg = danger
    ? 'rgba(239,68,68,0.15)'
    : highlight
      ? `${highlightColor || 'rgba(124,58,237,0.2)'}`
      : 'rgba(255,255,255,0.08)';
  const border = danger
    ? 'rgba(239,68,68,0.4)'
    : highlight
      ? (highlightColor || 'rgba(124,58,237,0.4)')
      : 'rgba(255,255,255,0.12)';
  const color = danger
    ? '#ef4444'
    : highlight
      ? (highlightColor || 'var(--primary-color)')
      : '#e2e8f0';

  return (
    <button onClick={onClick} title={label} style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '10px 16px', borderRadius: '10px', cursor: 'pointer',
      background: bg, border: `1px solid ${border}`, color,
      fontSize: '13px', fontWeight: 600, transition: 'all 0.2s',
      whiteSpace: 'nowrap',
    }}>
      {icon}
      <span style={{ fontSize: '12px' }}>{label}</span>
    </button>
  );
}
