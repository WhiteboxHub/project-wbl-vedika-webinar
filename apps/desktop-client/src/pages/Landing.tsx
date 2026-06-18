import { Video } from 'lucide-react';

export default function Landing() {
  return (
    <div className="flex-col flex-center" style={{ height: '100vh' }}>
      <div className="glass-panel flex-col flex-center fade-in" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '16px', borderRadius: '50%', marginBottom: '24px' }}>
          <Video size={48} color="var(--primary-color)" />
        </div>
        <h2>Welcome to Webinar</h2>
        <p className="text-muted mt-4">
          To join a session, please click on an invite link provided by your instructor.
        </p>
      </div>
    </div>
  );
}
