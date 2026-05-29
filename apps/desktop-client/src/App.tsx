import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

function App() {
  const [health, setHealth] = useState<string>('Checking...');

  useEffect(() => {
    checkHealth();
  }, []);

  async function checkHealth() {
    try {
      const response = await fetch('http://localhost:3000/health');
      const data = await response.json();
      setHealth(data.status === 'ok' ? 'Connected' : 'Error');
    } catch (error) {
      setHealth('Disconnected');
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1>Webinar Platform</h1>
      <p>Desktop Client v0.1.0</p>
      <div style={{ marginTop: '20px' }}>
        <strong>API Status:</strong> {health}
      </div>
      <button
        onClick={checkHealth}
        style={{ marginTop: '20px', padding: '10px 20px' }}
      >
        Check Connection
      </button>
    </div>
  );
}

export default App;
