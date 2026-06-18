import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactionType } from '../../lib/signaling';

const EMOJI: Record<ReactionType, string> = {
  'thumbs-up': '👍',
  'heart': '❤️',
  'clap': '👏',
  'laugh': '😂',
  'surprised': '😮',
};

interface FloatingEmoji { id: string; emoji: string; x: number; }
interface IncomingReaction { userId: string; userName: string; type: ReactionType; timestamp: number; }

interface Props {
  onReact: (type: ReactionType) => void;
  incomingReactions: IncomingReaction[];
  disabled?: boolean;
}

export default function ReactionBar({ onReact, incomingReactions, disabled }: Props) {
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);
  const seen = useRef(new Set<string>());
  const lastSent = useRef(0);

  useEffect(() => {
    incomingReactions.forEach(r => {
      const key = `${r.userId}-${r.timestamp}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      const id = `${key}-${Math.random()}`;
      const f: FloatingEmoji = { id, emoji: EMOJI[r.type] ?? '✨', x: 5 + Math.random() * 90 };
      setFloating(prev => [...prev.slice(-10), f]); // cap at 10 floating
      setTimeout(() => setFloating(prev => prev.filter(e => e.id !== id)), 2800);
    });
  }, [incomingReactions]);

  const handleReact = useCallback((type: ReactionType) => {
    const now = Date.now();
    if (now - lastSent.current < 2000) return;
    lastSent.current = now;
    onReact(type);
  }, [onReact]);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px' }}>
      {/* Floating layer — fixed so it floats above the room */}
      <div style={{ position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)', width: '300px', height: '220px', pointerEvents: 'none', zIndex: 1000, overflow: 'hidden' }}>
        {floating.map(f => (
          <span key={f.id} style={{ position: 'absolute', bottom: 0, left: `${f.x}%`, fontSize: '26px', animation: 'rxn-float 2.8s ease-out forwards', pointerEvents: 'none', userSelect: 'none' }}>
            {f.emoji}
          </span>
        ))}
      </div>

      {(Object.entries(EMOJI) as [ReactionType, string][]).map(([type, emoji]) => (
        <button key={type} onClick={() => handleReact(type)} disabled={disabled} title={type} style={{ width: '34px', height: '32px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s, background 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.22)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.14)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
        >
          {emoji}
        </button>
      ))}

      <style>{`@keyframes rxn-float { 0% { transform: translateY(0) scale(1); opacity: 1; } 70% { opacity: 0.9; transform: translateY(-140px) scale(1.25); } 100% { transform: translateY(-220px) scale(0.7); opacity: 0; } }`}</style>
    </div>
  );
}
