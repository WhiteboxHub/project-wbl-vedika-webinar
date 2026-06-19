import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PeerState, type JoinGrant } from '@webinar/shared';
import { RoomManager } from '../lib/webrtc/RoomManager';
import { runPreJoinDiagnostics } from '../lib/webrtc/Diagnostics';
import { clearWebinarSession } from '../lib/classroom-session';
import {
  Loader2, Monitor, StopCircle, Square, MessageSquare,
  AlertCircle, Hand, RotateCcw,
} from 'lucide-react';

interface Props {
  grant: JoinGrant;
  isHost: boolean;
}

export default function NativeClassroomView({ grant, isHost }: Props) {
  const navigate = useNavigate();
  const roomRef = useRef<RoomManager | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [state, setState] = useState<PeerState>(PeerState.IDLE);
  const [sharing, setSharing] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [diagDone, setDiagDone] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const handleLeave = useCallback(() => {
    roomRef.current?.leave();
    clearWebinarSession(grant.roomId);
    navigate(isHost ? '/dashboard' : '/');
  }, [grant.roomId, isHost, navigate]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const diag = await runPreJoinDiagnostics(grant.iceServers, { requireMic: isHost });
      if (cancelled) return;
      if (diag.overall === 'fail') {
        setDiagError('Pre-join checks failed. Verify signal server and network.');
        return;
      }
      setDiagDone(true);

      const rm = new RoomManager({
        grant,
        isHost,
        onStateChange: (s) => {
          setState(s);
          setReconnecting(s === PeerState.RECONNECTING);
        },
        onRemoteStream: (stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => {});
          }
        },
        onSessionEnded: () => {
          clearWebinarSession(grant.roomId);
          navigate(isHost ? '/dashboard' : '/');
        },
        onSignalChat: (id, userId, userName, message, timestamp) => {
          setChatMessages(prev => [...prev, { id, userId, userName, message, timestamp }]);
        },
      });

      rm.getSignalClient().onRoomState = (d) => {
        if (d?.history) setChatMessages(d.history);
        if (isHost && d?.presence) {
          for (const p of d.presence) {
            if (p.userId !== grant.participantId && p.role !== 'host') {
              void rm.connectToAttendee(p.userId);
            }
          }
        }
      };

      roomRef.current = rm;
      await rm.join();
    }

    void start();
    return () => {
      cancelled = true;
      roomRef.current?.leave();
    };
  }, [grant, isHost, navigate]);

  const toggleShare = async () => {
    const rm = roomRef.current;
    if (!rm) return;
    if (sharing) {
      rm.stopScreenShare();
      setSharing(false);
    } else {
      const ok = await rm.publishScreenShare();
      setSharing(ok);
    }
  };

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    roomRef.current?.getSignalClient().sendChat(chatInput.trim());
    setChatInput('');
  };

  if (diagError) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <AlertCircle size={48} color="var(--error-color)" />
        <p>{diagError}</p>
        <button className="btn btn-primary" onClick={handleLeave}>Go Back</button>
      </div>
    );
  }

  if (!diagDone) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={40} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{100%{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#06060e' }}>
      {reconnecting && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <RotateCcw size={38} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#fff', fontWeight: 600 }}>Reconnecting…</p>
        </div>
      )}

      <div style={{ flexShrink: 0, padding: '10px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>Live Session {isHost ? '(Host)' : ''}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{state}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            {!sharing && isHost && state === PeerState.CONNECTED && (
              <p style={{ position: 'absolute', color: 'var(--text-muted)' }}>Click Share Screen to present</p>
            )}
            {!isHost && state === PeerState.CONNECTED && (
              <p style={{ position: 'absolute', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                {videoRef.current?.srcObject ? '' : 'Waiting for host screen share…'}
              </p>
            )}
          </div>

          <div style={{ flexShrink: 0, display: 'flex', gap: 8, justifyContent: 'center', padding: 12, borderTop: '1px solid var(--border-color)' }}>
            {isHost && (
              <button className="btn btn-secondary" onClick={toggleShare}>
                {sharing ? <><StopCircle size={14} /> Stop Share</> : <><Monitor size={14} /> Share Screen</>}
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => roomRef.current?.getSignalClient().raiseHand()}>
              <Hand size={14} /> Hand
            </button>
            <button className="btn" onClick={handleLeave} style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              <Square size={14} /> {isHost ? 'End' : 'Leave'}
            </button>
          </div>
        </div>

        <div style={{ width: 280, borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border-color)', fontSize: 12, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}>
            <MessageSquare size={14} /> Chat
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            {chatMessages.map((m, i) => (
              <div key={m.id || i} style={{ marginBottom: 8, fontSize: 13 }}>
                <strong style={{ color: 'var(--primary-color)' }}>{m.userName}</strong>: {m.message}
              </div>
            ))}
          </div>
          <form onSubmit={sendChat} style={{ padding: 10, display: 'flex', gap: 6, borderTop: '1px solid var(--border-color)' }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Message…" style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'inherit' }} />
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 12px' }}>Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
