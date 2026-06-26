import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession, getStoredAuth } from '../lib/api';
import { ArrowLeft, Loader2, Calendar, Users, FileText, Video } from 'lucide-react';

export default function CreateSession() {
  const navigate = useNavigate();
  const auth = getStoredAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    scheduledAt: '',
    maxAttendees: 100,
  });

  if (!auth) { navigate('/login'); return null; }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'maxAttendees' ? Number(value) : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.scheduledAt) {
      setError('Title and scheduled date are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await createSession({
        title: form.title,
        description: form.description || undefined,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        maxAttendees: form.maxAttendees,
      });
      navigate(`/dashboard/${session.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  // Default scheduledAt to 1 hour from now
  const defaultDateTime = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString().slice(0, 16);

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px' }}>
      <div className="bg-orb" style={{ width: '400px', height: '400px', top: '-100px', left: '-100px', opacity: 0.3 }} />

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}
          style={{ marginBottom: '32px', padding: '8px 16px', fontSize: '13px' }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>

        <div className="glass-panel fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '32px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px',
              background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Video size={22} color="white" />
            </div>
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Create New Webinar</h2>
              <p className="text-muted" style={{ fontSize: '14px' }}>Fill in the details below</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex-col gap-6">
            <div className="flex-col" style={{ gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <FileText size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Webinar Title *
              </label>
              <input
                name="title" type="text" className="input-field"
                placeholder="e.g. Introduction to React Hooks"
                value={form.title} onChange={handleChange}
                required disabled={loading}
              />
            </div>

            <div className="flex-col" style={{ gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Description
              </label>
              <textarea
                name="description" className="input-field"
                placeholder="What will attendees learn in this session?"
                value={form.description} onChange={handleChange}
                disabled={loading} rows={3}
                style={{ resize: 'vertical', minHeight: '80px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="flex-col" style={{ gap: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Calendar size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Scheduled Date & Time *
                </label>
                <input
                  name="scheduledAt" type="datetime-local" className="input-field"
                  defaultValue={defaultDateTime}
                  onChange={handleChange} required disabled={loading}
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div className="flex-col" style={{ gap: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Users size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Max Attendees
                </label>
                <input
                  name="maxAttendees" type="number" className="input-field"
                  min={1} max={1000} value={form.maxAttendees}
                  onChange={handleChange} disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div style={{
                padding: '12px 16px', borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
                color: 'var(--error-color)', fontSize: '14px',
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/dashboard')}
                style={{ flex: 1 }} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2 }}>
                {loading ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Creating...</>
                ) : (
                  <><Video size={16} /> Create Webinar</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
