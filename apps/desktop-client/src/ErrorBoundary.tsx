import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * GAP-15: Global error boundary to catch unhandled React errors.
 * Without this, any uncaught render error shows a blank white screen.
 * This boundary shows a recovery UI and logs the error for debugging.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a10 0%, #0f0f1e 100%)',
          fontFamily: "'Inter', system-ui, sans-serif",
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            width: '100%',
            background: 'rgba(20,20,30,0.9)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '16px',
            padding: '40px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            textAlign: 'center',
          }}
        >
          {/* Icon */}
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>

          <h1
            style={{
              color: '#ef4444',
              fontSize: '20px',
              fontWeight: 700,
              marginBottom: '12px',
            }}
          >
            Something went wrong
          </h1>

          <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, marginBottom: '8px' }}>
            An unexpected error occurred. Your session data is safe.
          </p>

          {this.state.error && (
            <pre
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '12px',
                color: '#f87171',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '24px',
                maxHeight: '120px',
                overflow: 'auto',
              }}
            >
              {this.state.error.message}
            </pre>
          )}

          <button
            onClick={this.handleReset}
            style={{
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 28px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={(e) => ((e.target as HTMLElement).style.opacity = '0.85')}
            onMouseOut={(e) => ((e.target as HTMLElement).style.opacity = '1')}
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }
}
