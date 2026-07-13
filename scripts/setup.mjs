/**
 * Vedika Webinar — Local Setup Script
 *
 * Run:  pnpm setup
 *
 * What it does:
 *   1. Auto-detects your LAN IP address
 *   2. Writes APP_HOST, PUBLIC_APP_URL, LIVEKIT_NODE_IP into .env
 *   3. Regenerates docker/livekit.yaml from template
 *   4. Prints the shareable attendee URL
 *
 * Run this once, then every time your network changes (new WiFi, VPN, etc).
 * After running: pnpm docker:up && pnpm dev
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.join(__dirname, '..');
const envPath   = path.join(root, '.env');

// ─── Detect LAN IP ──────────────────────────────────────────────────────────

function detectLanIp() {
  const ifaces = os.networkInterfaces();
  for (const addrs of Object.values(ifaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}

// ─── .env helpers ───────────────────────────────────────────────────────────

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function writeEnvKey(filePath, key, value) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line  = `${key}=${value}`;
  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    // Append after the last non-empty line
    content = content.trimEnd() + `\n${line}\n`;
  }
  fs.writeFileSync(filePath, content);
}

// ─── LiveKit yaml regeneration ───────────────────────────────────────────────

function regenerateLiveKitYaml(nodeIp) {
  const templatePath = path.join(root, 'docker', 'livekit.yaml.template');
  const outPath      = path.join(root, 'docker', 'livekit.yaml');
  if (!fs.existsSync(templatePath)) {
    console.warn('  ⚠  docker/livekit.yaml.template not found — skipping LiveKit config.');
    return;
  }
  const yaml = fs.readFileSync(templatePath, 'utf8').replaceAll('{{NODE_IP}}', nodeIp);
  fs.writeFileSync(outPath, yaml);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const existingEnv = readEnv(envPath);

// Allow overriding via CLI arg:  node scripts/setup.mjs 192.168.1.99
const lanIp    = process.argv[2] || existingEnv.LIVEKIT_NODE_IP || detectLanIp();
const protocol = 'http';
const port     = 80;
const publicUrl = `${protocol}://${lanIp}`;

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║         Vedika Webinar — Local Setup                         ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`  Detected LAN IP  :  ${lanIp}`);
console.log(`  Public URL       :  ${publicUrl}`);
console.log(`  Webinar link     :  ${publicUrl}/w/{your-session-slug}`);
console.log('');

// Write all derived values into .env
const updates = {
  APP_HOST:        lanIp,
  APP_PORT:        port,
  APP_PROTOCOL:    protocol,
  PUBLIC_APP_URL:  publicUrl,
  BASE_URL:        publicUrl,
  LIVEKIT_NODE_IP: lanIp,
};

for (const [key, value] of Object.entries(updates)) {
  writeEnvKey(envPath, key, value);
}

regenerateLiveKitYaml(lanIp);

console.log('  ✓ .env updated');
console.log('  ✓ docker/livekit.yaml regenerated');
console.log('');
console.log('  Next steps:');
console.log('    pnpm docker:up    ← start infra + Caddy reverse proxy');
console.log('    pnpm dev          ← start API + frontend (hot reload)');
console.log('');
console.log('  Then share with attendees:');
console.log(`    ${publicUrl}/w/{slug}     (permanent per-session link)`);
console.log('');
console.log('  To use a custom IP or domain:');
console.log('    node scripts/setup.mjs 192.168.x.x');
console.log('    node scripts/setup.mjs webinar.yourdomain.com');
console.log('');
