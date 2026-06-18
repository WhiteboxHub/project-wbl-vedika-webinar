import React, { useState } from 'react';
import { HelpCircle, ThumbsUp, Check, X, ChevronRight } from 'lucide-react';

export interface QuestionData {
  id: string;
  userId: string;
  userName: string;
  text: string;
  status: 'pending' | 'approved' | 'rejected' | 'answered';
  upvotes: number;
  answer?: string;
  createdAt: string;
}

interface Props {
  role: 'host' | 'presenter' | 'moderator' | 'attendee';
  userId: string;
  questions: QuestionData[];
  onSubmitQuestion: (text: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onAnswer: (id: string, answer: string) => void;
  onUpvote: (id: string) => void;
}

export default function QAPanel({ role, questions, onSubmitQuestion, onApprove, onReject, onAnswer, onUpvote }: Props) {
  const [text, setText] = useState('');
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [view, setView] = useState<'approved' | 'pending'>('approved');

  const canModerate = role === 'host' || role === 'moderator';
  const canAnswer = role === 'host' || role === 'presenter';
  const isAttendee = role === 'attendee';

  const pending = questions.filter(q => q.status === 'pending');
  const approved = questions.filter(q => q.status === 'approved' || q.status === 'answered');
  const display = canModerate && view === 'pending' ? pending : approved;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmitQuestion(text.trim());
    setText('');
  }

  function handleAnswer(id: string) {
    if (!answerText.trim()) return;
    onAnswer(id, answerText.trim());
    setAnsweringId(null); setAnswerText('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <HelpCircle size={15} color="var(--primary-color)" />
        <span style={{ fontWeight: 700, fontSize: '13px' }}>Q&A</span>
        {canModerate && pending.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, background: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '2px 7px', borderRadius: '10px' }}>{pending.length} pending</span>
        )}
      </div>

      {canModerate && (
        <div style={{ display: 'flex', gap: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '3px' }}>
          {(['approved', 'pending'] as const).map(tab => (
            <button key={tab} onClick={() => setView(tab)} style={{ flex: 1, padding: '5px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, textTransform: 'capitalize', background: view === tab ? 'rgba(124,58,237,0.3)' : 'none', color: view === tab ? 'var(--primary-color)' : 'var(--text-muted)' }}>
              {tab === 'pending' ? `Pending (${pending.length})` : 'Approved'}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {display.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px', gap: '8px', padding: '40px 0' }}>
            <HelpCircle size={30} opacity={0.25} />
            <p>{view === 'pending' ? 'No pending questions' : 'No questions yet'}</p>
          </div>
        )}
        {display.map(q => (
          <div key={q.id} style={{ padding: '12px', borderRadius: '10px', background: q.status === 'answered' ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.04)', border: `1px solid ${q.status === 'answered' ? 'rgba(16,185,129,0.2)' : 'var(--border-color)'}` }}>
            <p style={{ fontSize: '13px', marginBottom: '6px', lineHeight: 1.4 }}>{q.text}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600 }}>{q.userName}</span>
              <span>·</span>
              <button onClick={() => onUpvote(q.id)} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px' }}>
                <ThumbsUp size={10} /> {q.upvotes}
              </button>
              {q.status === 'answered' && <span style={{ color: '#10b981', marginLeft: 'auto', fontWeight: 600 }}>✓ Answered</span>}
            </div>

            {canModerate && q.status === 'pending' && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button onClick={() => onApprove(q.id)} style={{ flex: 1, padding: '5px', borderRadius: '6px', border: 'none', background: 'rgba(16,185,129,0.2)', color: '#10b981', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}><Check size={11} /> Approve</button>
                <button onClick={() => onReject(q.id)} style={{ flex: 1, padding: '5px', borderRadius: '6px', border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}><X size={11} /> Reject</button>
              </div>
            )}

            {canAnswer && q.status === 'approved' && answeringId !== q.id && (
              <button onClick={() => { setAnsweringId(q.id); setAnswerText(''); }} style={{ marginTop: '8px', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ChevronRight size={11} /> Answer
              </button>
            )}

            {answeringId === q.id && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <textarea value={answerText} onChange={e => setAnswerText(e.target.value)} placeholder="Type your answer…" rows={2} style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontSize: '12px', resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => handleAnswer(q.id)} style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', background: 'rgba(16,185,129,0.2)', color: '#10b981', cursor: 'pointer', fontSize: '11px' }}>Submit</button>
                  <button onClick={() => setAnsweringId(null)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}>Cancel</button>
                </div>
              </div>
            )}

            {q.answer && (
              <div style={{ marginTop: '8px', padding: '8px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', fontSize: '12px' }}>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Answer: </span>
                <span style={{ color: 'var(--text-main)' }}>{q.answer}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {isAttendee && (
        <form onSubmit={handleSubmit} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', display: 'flex', gap: '8px' }}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Ask a question…" className="input-field" style={{ flex: 1, fontSize: '13px' }} />
          <button type="submit" disabled={!text.trim()} style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Ask</button>
        </form>
      )}
    </div>
  );
}
