import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession, getStoredAuth } from '../lib/api';
import { ArrowLeft, Loader2, Calendar, Users, FileText, Video, Clock, Globe, Link, ToggleLeft, ToggleRight } from 'lucide-react';

// ─── Timezone list ───────────────────────────────────────────────────────────

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function getTimezoneLabel(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    const offset = tzPart?.value || '';
    return `${tz.replace(/_/g, ' ')} (${offset})`;
  } catch {
    return tz;
  }
}

function getBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (COMMON_TIMEZONES.includes(tz)) return tz;
    return tz; // Allow even if not in common list
  } catch {
    return 'America/New_York';
  }
}

// ─── Duration options ────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '1.5 hours', value: 90 },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
  { label: 'Custom', value: 0 },
];

// ─── Slug preview ────────────────────────────────────────────────────────────

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0, 0, 0, 0.25)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#e8eaf0',
  padding: '11px 15px',
  borderRadius: '8px',
  fontFamily: "'Inter', sans-serif",
  fontSize: '14px',
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237c8799' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  colorScheme: 'dark',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export default function CreateSession() {
  const navigate = useNavigate();
  const auth = getStoredAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pre-fill scheduledAt to 1 hour from now so it's never empty on first submit
  const defaultDateTime = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString().slice(0, 16);

  const [form, setForm] = useState({
    title: '',
    description: '',
    scheduledAt: defaultDateTime,
    maxAttendees: 100,
    timezone: getBrowserTimezone(),
    durationMinutes: 60,
    customDuration: 60,
    autoStart: false,
  });

  if (!auth) { navigate('/login'); return null; }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value)
             : (e.target as HTMLInputElement).type === 'checkbox' ? (e.target as HTMLInputElement).checked
             : name === 'maxAttendees' ? Number(value)
             : value,
    }));
  };

  const effectiveDuration = form.durationMinutes === 0 ? form.customDuration : form.durationMinutes;

  const slugPreview = useMemo(() => titleToSlug(form.title), [form.title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.scheduledAt) {
      setError('Title and scheduled date are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const scheduledAtISO = new Date(form.scheduledAt).toISOString();
      const endDate = new Date(new Date(form.scheduledAt).getTime() + effectiveDuration * 60_000);
      const session = await createSession({
        title: form.title,
        description: form.description || undefined,
        scheduledAt: scheduledAtISO,
        scheduledStartAt: scheduledAtISO,
        scheduledEndAt: endDate.toISOString(),
        timezone: form.timezone,
        autoStart: form.autoStart,
        maxAttendees: form.maxAttendees,
      });
      navigate(`/dashboard/${session.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };



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
              <label style={labelStyle}>
                <FileText size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Webinar Title *
              </label>
              <input
                name="title" type="text" className="input-field"
                placeholder="e.g. Introduction to React Hooks"
                value={form.title} onChange={handleChange}
                required disabled={loading}
              />
            </div>

            {/* Slug URL Preview */}
            {form.title.trim() && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(37,99,235,0.05)',
                borderRadius: '10px',
                border: '1px solid rgba(37,99,235,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <Link size={14} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Permanent URL: </span>
                  <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                    {window.location.origin}/w/{slugPreview || '…'}
                  </span>
                </div>
              </div>
            )}

            <div className="flex-col" style={{ gap: '8px' }}>
              <label style={labelStyle}>
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
                <label style={labelStyle}>
                  <Calendar size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Scheduled Date & Time *
                </label>
                <input
                  name="scheduledAt" type="datetime-local" className="input-field"
                  value={form.scheduledAt}
                  onChange={handleChange} required disabled={loading}
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div className="flex-col" style={{ gap: '8px' }}>
                <label style={labelStyle}>
                  <Globe size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Timezone
                </label>
                <select
                  name="timezone"
                  value={form.timezone}
                  onChange={handleChange}
                  disabled={loading}
                  style={selectStyle}
                >
                  {COMMON_TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{getTimezoneLabel(tz)}</option>
                  ))}
                  {/* Include browser tz if not in common list */}
                  {!COMMON_TIMEZONES.includes(form.timezone) && (
                    <option value={form.timezone}>{getTimezoneLabel(form.timezone)}</option>
                  )}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="flex-col" style={{ gap: '8px' }}>
                <label style={labelStyle}>
                  <Clock size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Duration
                </label>
                <select
                  name="durationMinutes"
                  value={form.durationMinutes}
                  onChange={handleChange}
                  disabled={loading}
                  style={selectStyle}
                >
                  {DURATION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {form.durationMinutes === 0 && (
                  <input
                    name="customDuration" type="number" className="input-field"
                    min={15} max={480} value={form.customDuration}
                    onChange={handleChange} disabled={loading}
                    placeholder="Minutes"
                    style={{ marginTop: '8px' }}
                  />
                )}
              </div>

              <div className="flex-col" style={{ gap: '8px' }}>
                <label style={labelStyle}>
                  <Users size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Max Attendees
                </label>
                <input
                  name="maxAttendees" type="number" className="input-field"
                  min={1} max={1000} value={form.maxAttendees}
                  onChange={handleChange} disabled={loading}
                />
              </div>
            </div>

            {/* Auto-start Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: 'rgba(0,0,0,0.15)',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer',
              }}
              onClick={() => setForm(prev => ({ ...prev, autoStart: !prev.autoStart }))}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-main)', marginBottom: '2px' }}>
                  Auto-start at scheduled time
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Automatically start the session when the scheduled time arrives
                </div>
              </div>
              {form.autoStart ? (
                <ToggleRight size={28} color="var(--primary-color)" />
              ) : (
                <ToggleLeft size={28} color="var(--text-muted)" />
              )}
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
