import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

const API_BASE = '/api';

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0f',
    padding: '20px',
    position: 'relative' as const,
    fontFamily: "'Inter', sans-serif",
  },
  glass: {
    background: 'rgba(20, 20, 30, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center' as const,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: 1,
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '12px 20px',
    background: 'linear-gradient(135deg, #a855f7, #6366f1)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
};

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const slug = searchParams.get('slug');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('No token provided.');
      return;
    }

    const doVerify = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/email/verify?token=${token}`);
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.message || 'Verification failed');
        }

        const data = await res.json();
        if (data.verified && slug) {
          // Store verified registration credentials locally
          localStorage.setItem(
            `webinar_registered_${slug}`,
            JSON.stringify({ name: data.name, email: data.email, verified: true })
          );
        }
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Verification link is invalid or expired.');
      }
    };

    doVerify();
  }, [token, slug]);

  const handleRedirect = () => {
    if (slug) {
      navigate(`/w/${slug}`);
    } else {
      navigate('/');
    }
  };

  return (
    <div style={styles.page}>
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          width: '350px',
          height: '350px',
          background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, rgba(99,102,241,0) 70%)',
          filter: 'blur(30px)',
          top: '20%',
          left: '30%',
        }}
      />

      <div style={styles.glass}>
        {status === 'verifying' && (
          <div style={{ padding: '20px 0' }}>
            <Loader2
              size={48}
              color="#a855f7"
              style={{ animation: 'spin 1s linear infinite', margin: '0 auto 20px' }}
            />
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e8eaf0', marginBottom: '8px' }}>
              Verifying Email
            </h2>
            <p style={{ fontSize: '14px', color: '#7c8799' }}>
              Please wait while we confirm your registration…
            </p>
          </div>
        )}

        {status === 'success' && (
          <div style={{ padding: '10px 0' }}>
            <CheckCircle2 size={54} color="#22c55e" style={{ margin: '0 auto 20px' }} />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#e8eaf0', marginBottom: '10px' }}>
              Email Verified!
            </h2>
            <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '28px' }}>
              Your email registration has been verified. You can now enter the webinar lobby.
            </p>
            <button onClick={handleRedirect} style={styles.btnPrimary}>
              {slug ? 'Go to Webinar' : 'Go to Home'} <ArrowRight size={16} />
            </button>
          </div>
        )}

        {status === 'error' && (
          <div style={{ padding: '10px 0' }}>
            <AlertTriangle size={54} color="#ef4444" style={{ margin: '0 auto 20px' }} />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#e8eaf0', marginBottom: '10px' }}>
              Verification Failed
            </h2>
            <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '28px' }}>
              {errorMsg}
            </p>
            <button onClick={handleRedirect} style={styles.btnPrimary}>
              {slug ? 'Return to Webinar Page' : 'Go to Home'} <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
