import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, storeAuth } from '../lib/api';
import { LogIn, Loader2, Video } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@webinar.local');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await login(email, password);
      storeAuth(data);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-col flex-center" style={{ height: '100vh', padding: '20px' }}>
      {/* Animated background orbs */}
      <div className="bg-orb" style={{ width: '400px', height: '400px', top: '-100px', left: '-100px' }} />
      <div className="bg-orb" style={{ width: '300px', height: '300px', bottom: '-80px', right: '-80px', animationDelay: '2s' }} />

      <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '20px',
            background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(124, 58, 237, 0.4)',
          }}>
            <Video size={30} color="white" />
          </div>
          <h1 style={{ fontSize: '26px', marginBottom: '6px' }}>Organizer Portal</h1>
          <p className="text-muted">Sign in to manage your webinars</p>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-6">
          <div className="flex-col" style={{ gap: '8px' }}>
            <label htmlFor="email" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
            <input
              id="email"
              type="email"
              className="input-field"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@webinar.local"
              required
              disabled={loading}
            />
          </div>

          <div className="flex-col" style={{ gap: '8px' }}>
            <label htmlFor="password" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
            <input
              id="password"
              type="password"
              className="input-field"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: 'var(--error-color)',
              fontSize: '14px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '8px', padding: '14px' }}
          >
            {loading ? (
              <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Signing in...</>
            ) : (
              <><LogIn size={18} /> Sign In</>
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Default: <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>webinar123</code>
        </p>
      </div>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
