import React, { useState, useEffect } from 'react';
import { Room, RoomEvent, ConnectionState } from 'livekit-client';

/**
 * Standalone LiveKit connection test page.
 * Visit /test-lk to use. Bypasses all routing/state — directly tests
 * API → Token → LiveKit WebSocket → Room connection.
 */
export default function TestLiveKit() {
  const [logs, setLogs] = useState<{ msg: string; type: string }[]>([]);
  const [step, setStep] = useState(0);
  const [authToken, setAuthToken] = useState('');
  const [lkToken, setLkToken] = useState('');
  const [roomName, setRoomName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);

  function log(msg: string, type = '') {
    console.log(`[TestLK] ${msg}`);
    setLogs(prev => [...prev, { msg: `${new Date().toLocaleTimeString()} | ${msg}`, type }]);
  }

  // Step 1: Login
  async function doLogin() {
    log('--- Step 1: Login ---');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'manisaisaduvala@gmail.com', password: 'webinar123' }),
      });
      const data = await res.json();
      if (res.ok && data.accessToken) {
        setAuthToken(data.accessToken);
        log(`✅ Login OK. User: ${data.user.name}`, 'ok');
        setStep(1);
        // Auto-fetch sessions
        const sessRes = await fetch('/api/classes', {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        });
        const sessData = await sessRes.json();
        setSessions(Array.isArray(sessData) ? sessData : []);
        log(`Found ${Array.isArray(sessData) ? sessData.length : 0} sessions`);
      } else {
        log(`❌ Login failed: ${JSON.stringify(data)}`, 'err');
      }
    } catch (e: any) {
      log(`❌ Login error: ${e.message}`, 'err');
    }
  }

  // Step 2: Get host token
  async function getToken(sid: string) {
    setSessionId(sid);
    log(`--- Step 2: Get Host Token for session ${sid} ---`);
    try {
      const res = await fetch('/api/join/host-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ sessionId: sid }),
      });
      const data = await res.json();
      log(`API Response: ${JSON.stringify(data)}`);
      if (data.livekitToken) {
        setLkToken(data.livekitToken);
        setRoomName(data.roomName);
        log(`✅ Got token (${data.livekitToken.length} chars), room: ${data.roomName}`, 'ok');
        setStep(2);
      } else {
        log(`❌ No livekitToken in response`, 'err');
      }
    } catch (e: any) {
      log(`❌ Error: ${e.message}`, 'err');
    }
  }

  // Step 3: Test WebSocket
  async function testWebSocket() {
    log('--- Step 3: Test WebSocket to LiveKit ---');
    const url = 'ws://localhost:7880';
    log(`Connecting WebSocket to ${url}...`);
    const ws = new WebSocket(url);
    ws.onopen = () => { log('✅ WebSocket OPEN to ' + url, 'ok'); ws.close(); setStep(3); };
    ws.onerror = () => { log('❌ WebSocket ERROR to ' + url, 'err'); };
    ws.onclose = (e) => { log(`WebSocket closed: code=${e.code}, clean=${e.wasClean}`); };
  }

  // Step 4: Connect Room
  async function connectRoom() {
    log('--- Step 4: Connect to LiveKit Room ---');
    const serverUrl = 'ws://localhost:7880';
    log(`Server: ${serverUrl}`);
    log(`Room: ${roomName}`);
    log(`Token length: ${lkToken.length}`);

    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      room.on(RoomEvent.Connected, () => {
        log(`✅✅✅ CONNECTED! Room: ${room.name}, SID: ${room.sid}`, 'ok');
        log(`Local participant: ${room.localParticipant.identity} (${room.localParticipant.name})`, 'ok');
        log(`Remote participants: ${room.remoteParticipants.size}`, 'ok');
        setStep(4);
      });

      room.on(RoomEvent.SignalConnected, () => {
        log('✅ Signal connected (WebSocket handshake OK)', 'ok');
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        log(`⚠️ Disconnected: ${reason}`, 'warn');
      });

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        log(`Connection state: ${state}`);
      });

      room.on(RoomEvent.MediaDevicesError, (e: any) => {
        log(`⚠️ Media error: ${e?.message}`, 'warn');
      });

      log('Calling room.connect()...');
      await room.connect(serverUrl, lkToken);
      log(`✅ room.connect() resolved successfully. State: ${room.state}`, 'ok');
    } catch (e: any) {
      log(`❌ CONNECT FAILED: ${e.message}`, 'err');
      if (e.stack) log(`Stack: ${e.stack.split('\n').slice(0, 3).join(' | ')}`, 'err');
    }
  }

  return (
    <div style={{ background: '#0a0a0f', color: '#e2e8f0', minHeight: '100vh', padding: '24px', fontFamily: 'monospace' }}>
      <h1 style={{ color: '#818cf8', marginBottom: '8px' }}>🔧 LiveKit Connection Diagnostics</h1>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>This page tests each step of the connection flow independently.</p>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button onClick={doLogin} style={btnStyle(step >= 0)}>
          1️⃣ Login & List Sessions
        </button>
        {sessions.length > 0 && (
          <select
            onChange={(e) => e.target.value && getToken(e.target.value)}
            style={{ padding: '8px 12px', background: '#1e1e2e', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '8px', fontSize: '14px' }}
          >
            <option value="">-- Pick a session --</option>
            {sessions.map((s: any) => (
              <option key={s.id} value={s.id}>{s.title} ({s.status})</option>
            ))}
          </select>
        )}
        <button onClick={testWebSocket} disabled={step < 1} style={btnStyle(step >= 2)}>
          3️⃣ Test WebSocket
        </button>
        <button onClick={connectRoom} disabled={step < 2} style={btnStyle(step >= 3)}>
          4️⃣ Connect to Room
        </button>
      </div>

      <div style={{ background: '#0f0f1a', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px', maxHeight: '60vh', overflowY: 'auto' }}>
        {logs.length === 0 && <p style={{ color: '#475569' }}>Click "Login & List Sessions" to start...</p>}
        {logs.map((l, i) => (
          <div key={i} style={{
            padding: '4px 10px', margin: '2px 0', borderRadius: '4px',
            borderLeft: `3px solid ${l.type === 'ok' ? '#4ade80' : l.type === 'err' ? '#ef4444' : l.type === 'warn' ? '#eab308' : '#334155'}`,
            color: l.type === 'ok' ? '#4ade80' : l.type === 'err' ? '#ef4444' : l.type === 'warn' ? '#eab308' : '#94a3b8',
            fontSize: '13px',
          }}>
            {l.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '10px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
    background: active ? '#312e81' : '#1e1e2e',
    color: active ? '#a5b4fc' : '#64748b',
    border: `1px solid ${active ? '#4338ca' : '#334155'}`,
    borderRadius: '8px', transition: 'all 0.2s',
  };
}
