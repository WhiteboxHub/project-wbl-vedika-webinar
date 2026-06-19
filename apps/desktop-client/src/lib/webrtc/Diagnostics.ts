import type { PreJoinDiagnosticResult, DiagnosticCheck, RTCIceServerConfig } from '@webinar/shared';
import { getSignalServerUrl } from '../classroom-session';

async function checkCamera(): Promise<DiagnosticCheck> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { status: 'skipped', message: 'Camera API not available' };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    return { status: 'pass', message: 'Camera accessible' };
  } catch {
    return { status: 'warn', message: 'Camera unavailable (optional for attendees)' };
  }
}

async function checkMicrophone(requireMic: boolean): Promise<DiagnosticCheck> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { status: requireMic ? 'fail' : 'skipped', message: 'Microphone API not available' };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return { status: 'pass', message: 'Microphone accessible' };
  } catch {
    return requireMic
      ? { status: 'fail', message: 'Microphone required for host' }
      : { status: 'warn', message: 'Microphone unavailable' };
  }
}

async function checkSignalServer(): Promise<DiagnosticCheck> {
  const url = getSignalServerUrl();
  return new Promise((resolve) => {
    const start = performance.now();
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ status: 'fail', message: 'Signal server timeout', latencyMs: Math.round(performance.now() - start) });
    }, 5000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ event: 'ping', data: { ts: Date.now() } }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.event === 'pong') {
          clearTimeout(timeout);
          ws.close();
          resolve({
            status: 'pass',
            message: 'Signal server reachable',
            latencyMs: Math.round(performance.now() - start),
          });
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve({ status: 'fail', message: 'Signal server unreachable' });
    };
  });
}

async function checkTurn(iceServers: RTCIceServerConfig[]): Promise<DiagnosticCheck> {
  const turn = iceServers.find(s => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some(u => u.startsWith('turn'));
  });
  if (!turn) {
    return { status: 'warn', message: 'No TURN server configured (LAN only)' };
  }

  return new Promise((resolve) => {
    const start = performance.now();
    const pc = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });
    let resolved = false;
    const done = (check: DiagnosticCheck) => {
      if (resolved) return;
      resolved = true;
      pc.close();
      resolve({ ...check, latencyMs: Math.round(performance.now() - start) });
    };

    const timeout = setTimeout(() => done({ status: 'warn', message: 'TURN check timed out' }), 8000);

    pc.onicecandidate = (ev) => {
      if (ev.candidate?.candidate?.includes('typ relay')) {
        clearTimeout(timeout);
        done({ status: 'pass', message: 'TURN relay candidate received' });
      }
    };

    pc.createDataChannel('diag');
    pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => {
      clearTimeout(timeout);
      done({ status: 'fail', message: 'TURN connectivity check failed' });
    });
  });
}

export async function runPreJoinDiagnostics(
  iceServers: RTCIceServerConfig[],
  options: { requireMic?: boolean } = {},
): Promise<PreJoinDiagnosticResult> {
  const [camera, microphone, signalServer, turn] = await Promise.all([
    checkCamera(),
    checkMicrophone(!!options.requireMic),
    checkSignalServer(),
    checkTurn(iceServers),
  ]);

  const checks = [camera, microphone, signalServer, turn];
  const overall = checks.some(c => c.status === 'fail')
    ? 'fail'
    : checks.some(c => c.status === 'warn')
      ? 'warn'
      : 'pass';

  return { camera, microphone, signalServer, turn, overall };
}
