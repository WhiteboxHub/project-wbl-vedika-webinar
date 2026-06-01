import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function Classroom() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Extract token from router state
    const stateToken = (location.state as any)?.liveKitToken;
    if (!stateToken) {
      // If we somehow got here without a token, boot them back to home
      navigate('/');
      return;
    }
    setToken(stateToken);
  }, [location, navigate]);

  if (!token) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh' }}>
        <Loader2 className="fade-in" size={48} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // LiveKit URL (could be from env, but defaulting to standard local dev port)
  const serverUrl = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880';

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={serverUrl}
        // Use the default LiveKit components styling
        data-lk-theme="default"
        style={{ height: '100vh', width: '100%' }}
        onDisconnected={() => navigate('/')}
      >
        {/* Render the standard video conference UI */}
        <VideoConference />
        
        {/* Render audio from the room */}
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
