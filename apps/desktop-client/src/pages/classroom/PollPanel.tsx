import React, { useState } from 'react';
import { BarChart2, Plus, X, Check } from 'lucide-react';

export interface PollOptionData { id: string; text: string; }
export interface PollData { id: string; question: string; options: PollOptionData[]; isActive: boolean; }
export interface PollResult { pollId: string; question: string; totalVotes: number; options: Array<{ id: string; text: string; count: number; percentage: number }>; }

interface Props {
  isHost: boolean;
  sessionId: string;
  activePoll: PollData | null;
  pollResult: PollResult | null;
  onCreatePoll: (question: string, options: string[]) => void;
  onVote: (pollId: string, optionId: string) => void;
  onClosePoll: (pollId: string) => void;
  userVotedOptionId?: string | null;
}

export default function PollPanel({ isHost, activePoll, pollResult, onCreatePoll, onVote, onClosePoll, userVotedOptionId }: Props) {
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  const addOption = () => { if (options.length < 6) setOptions([...options, '']); };
  const removeOption = (i: number) => { if (options.length > 2) setOptions(options.filter((_, j) => j !== i)); };
  const updateOption = (i: number, v: string) => { const o = [...options]; o[i] = v; setOptions(o); };

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const filtered = options.filter(o => o.trim());
    if (!question.trim() || filtered.length < 2) return;
    onCreatePoll(question.trim(), filtered);
    setQuestion(''); setOptions(['', '']); setCreating(false);
  }

  const hasVoted = !!userVotedOptionId;
  const result = pollResult;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart2 size={15} color="var(--primary-color)" />
          <span style={{ fontWeight: 700, fontSize: '13px' }}>Polls</span>
        </div>
        {isHost && !creating && !activePoll && (
          <button onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '7px', border: 'none', background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
            <Plus size={11} /> New Poll
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={handleCreate} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input className="input-field" placeholder="Poll question…" value={question} onChange={e => setQuestion(e.target.value)} style={{ fontSize: '13px' }} required />
          {options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input className="input-field" placeholder={`Option ${i + 1}`} value={opt} onChange={e => updateOption(i, e.target.value)} style={{ fontSize: '13px', flex: 1 }} />
              {options.length > 2 && (
                <button type="button" onClick={() => removeOption(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error-color)', padding: '4px' }}><X size={13} /></button>
              )}
            </div>
          ))}
          {options.length < 6 && (
            <button type="button" onClick={addOption} style={{ background: 'none', border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '7px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px' }}>+ Add option</button>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Launch Poll</button>
            <button type="button" onClick={() => setCreating(false)} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
          </div>
        </form>
      )}

      {activePoll && !result && (
        <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '12px', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <p style={{ fontWeight: 600, fontSize: '14px', flex: 1 }}>{activePoll.question}</p>
            {isHost && <button onClick={() => onClosePoll(activePoll.id)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', marginLeft: '8px' }}>End Poll</button>}
          </div>
          {activePoll.options.map(opt => (
            <button key={opt.id} onClick={() => !hasVoted && onVote(activePoll.id, opt.id)} disabled={hasVoted} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', marginBottom: '6px', border: `1px solid ${userVotedOptionId === opt.id ? 'var(--primary-color)' : 'var(--border-color)'}`, background: userVotedOptionId === opt.id ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.04)', color: 'var(--text-main)', cursor: hasVoted ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', transition: 'all 0.2s', textAlign: 'left' }}>
              <span>{opt.text}</span>
              {userVotedOptionId === opt.id && <Check size={13} color="var(--primary-color)" />}
            </button>
          ))}
        </div>
      )}

      {result && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
          <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{result.question}</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>{result.totalVotes} votes</p>
          {result.options.map(opt => (
            <div key={opt.id} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                <span>{opt.text}</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{opt.percentage}%</span>
              </div>
              <div style={{ height: '7px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${opt.percentage}%`, background: 'linear-gradient(90deg, var(--primary-color), var(--secondary-color))', borderRadius: '4px', transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!activePoll && !creating && !result && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px', gap: '8px' }}>
          <BarChart2 size={30} opacity={0.25} />
          <p>{isHost ? 'Create a poll to engage your audience' : 'No active poll'}</p>
        </div>
      )}
    </div>
  );
}
