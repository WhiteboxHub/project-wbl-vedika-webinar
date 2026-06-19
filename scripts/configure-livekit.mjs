/**
 * Generates docker/livekit.yaml from template.
 * Sets node_ip + TURN domain so remote/LAN attendees can establish WebRTC (PC connection).
 *
 * Priority: LIVEKIT_NODE_IP env → .env file → auto-detect LAN IPv4 → 127.0.0.1
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function detectLanIp() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

const fileEnv = loadEnvFile(path.join(root, '.env'));
const nodeIp = process.env.LIVEKIT_NODE_IP || fileEnv.LIVEKIT_NODE_IP || detectLanIp();

const templatePath = path.join(root, 'docker', 'livekit.yaml.template');
const outPath = path.join(root, 'docker', 'livekit.yaml');

if (!fs.existsSync(templatePath)) {
  console.error('Missing docker/livekit.yaml.template');
  process.exit(1);
}

const yaml = fs.readFileSync(templatePath, 'utf8').replaceAll('{{NODE_IP}}', nodeIp);
fs.writeFileSync(outPath, yaml);

console.log(`[configure-livekit] node_ip=${nodeIp} (TURN domain=${nodeIp}, udp_port=3479)`);
if (nodeIp === '127.0.0.1') {
  console.warn('[configure-livekit] Using loopback — attendees on other devices will fail ICE.');
  console.warn('[configure-livekit] Set LIVEKIT_NODE_IP=<your LAN IP> in .env for cross-device testing.');
}
