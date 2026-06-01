import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveInvite, joinSession, ResolveInviteResponse } from '../lib/api';
import { Loader2, AlertCircle, LogIn } from 'lucide-react';

export default function Join() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ResolveInviteResponse | null>(null);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    async function loadSession() {
      if (!token) {
        setError('No invite token provided');
        setLoading(false);
        return;
      }
      try {
        const data = await resolveInvite(token);
        setSession(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load session');
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, [token]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !name.trim()) return;
    
    setJoining(true);
    setError(null);
    try {
      const liveKitData = await joinSession(token, name);
      // Navigate to classroom with the LiveKit token
      navigate(`/class/${liveKitData.roomName}`, { 
        state: { 
          liveKitToken: liveKitData.livekitToken,
          livekitUrl: liveKitData.livekitUrl,
          participantName: name,
        } 
      });
    } catch (err: any) {
      setError(err.message || 'Failed to join session');
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh' }}>
        <Loader2 className="fade-in" size={48} color="var(--primary-color)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex-col flex-center" style={{ height: '100vh' }}>
        <div className="glass-panel flex-col flex-center fade-in" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <AlertCircle size={48} color="var(--error-color)" className="mb-4" />
          <h2 className="mt-4">Invalid Invite</h2>
          <p className="text-muted mt-4">{error}</p>
          <button className="btn btn-secondary mt-8" onClick={() => navigate('/')}>Return Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-col flex-center" style={{ height: '100vh', padding: '20px' }}>
      <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '480px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>{session.title}</h2>
          <p className="text-muted">Hosted by {session.instructorName}</p>
          
          <div style={{ 
            display: 'inline-block', 
            marginTop: '16px', 
            padding: '4px 12px', 
            borderRadius: '20px', 
            fontSize: '13px',
            background: session.status === 'live' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            color: session.status === 'live' ? 'var(--success-color)' : 'var(--text-main)',
            border: `1px solid ${session.status === 'live' ? 'var(--success-color)' : 'var(--border-color)'}`
          }}>
            Status: {session.status.toUpperCase()}
          </div>
        </div>

        <form onSubmit={handleJoin} className="flex-col gap-6">
          <div className="flex-col" style={{ gap: '8px' }}>
            <label htmlFor="name" style={{ fontSize: '14px', fontWeight: 500 }}>Your Name</label>
            <input 
              id="name"
              type="text" 
              className="input-field" 
              placeholder="Enter your display name" 
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={joining}
              autoFocus
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={joining || !name.trim()}
            style={{ width: '100%', marginTop: '8px' }}
          >
            {joining ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                Joining...
              </>
            ) : (
              <>
                <LogIn size={18} />
                Join Webinar
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
