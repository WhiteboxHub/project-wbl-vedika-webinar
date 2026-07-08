#!/usr/bin/env node

/**
 * Vedika Webinar Platform — Startup Script
 *
 * - Auto-detects LAN IP
 * - Updates .env with BASE_URL and LIVEKIT_NODE_IP (preserving other vars)
 * - Runs configure-livekit.mjs if it exists
 * - Prints a startup banner with all URLs
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ── LAN IP Detection ────────────────────────────────────────────────────────

function detectLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name];
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return 'localhost';
}

const lanIp = detectLanIp();

// ── .env File Handling ──────────────────────────────────────────────────────

const envPath = path.join(ROOT, '.env');

function readEnvFile() {
  if (!fs.existsSync(envPath)) return {};
  const vars = {};
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    vars[key] = value;
  }
  return vars;
}

function writeEnvFile(vars) {
  // Preserve the original file structure: read raw lines and patch known keys
  let lines = [];

  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  }

  const keysToSet = { ...vars };
  const updatedLines = [];
  const seenKeys = new Set();

  for (const line of lines) {
    const trimmed = line.trim();

    // Preserve comments and blank lines as-is
    if (!trimmed || trimmed.startsWith('#')) {
      updatedLines.push(line);
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      updatedLines.push(line);
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim();
    seenKeys.add(key);

    if (key in keysToSet) {
      updatedLines.push(`${key}=${keysToSet[key]}`);
    } else {
      updatedLines.push(line);
    }
  }

  // Append any new keys that weren't already in the file
  for (const [key, value] of Object.entries(keysToSet)) {
    if (!seenKeys.has(key)) {
      updatedLines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envPath, updatedLines.join('\n'), 'utf8');
}

// Read existing env, update only the keys we care about
const existingEnv = readEnvFile();
const appPort = existingEnv.VITE_PORT || '5173';
const apiPort = existingEnv.API_PORT || '3000';

existingEnv.BASE_URL = `http://${lanIp}:${appPort}`;
existingEnv.PUBLIC_APP_URL = `http://${lanIp}:${appPort}`;
existingEnv.LIVEKIT_NODE_IP = lanIp;

writeEnvFile(existingEnv);

console.log(`[startup] .env updated: BASE_URL=${existingEnv.BASE_URL}, LIVEKIT_NODE_IP=${lanIp}`);

// ── LiveKit Configuration ───────────────────────────────────────────────────

const livekitScript = path.join(__dirname, 'configure-livekit.mjs');
if (fs.existsSync(livekitScript)) {
  try {
    console.log('[startup] Running configure-livekit.mjs…');
    execSync(`node "${livekitScript}"`, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, LIVEKIT_NODE_IP: lanIp },
    });
  } catch (error) {
    console.error(`[startup] configure-livekit.mjs failed: ${error.message}`);
  }
} else {
  console.log('[startup] configure-livekit.mjs not found — skipping LiveKit config');
}

// ── Banner ──────────────────────────────────────────────────────────────────

function pad(text, width) {
  const padLen = width - text.length;
  return padLen > 0 ? text + ' '.repeat(padLen) : text;
}

const W = 46; // inner width

const appUrl = `http://${lanIp}:${appPort}`;
const apiUrl = `http://${lanIp}:${apiPort}`;
const shareUrl = `http://${lanIp}:${appPort}/w/{slug}`;

const lines2 = [
  '  Vedika Webinar Platform',
  `  App:    ${appUrl}`,
  `  API:    ${apiUrl}`,
  `  Share:  ${shareUrl}`,
];

const top = '╔' + '═'.repeat(W) + '╗';
const bot = '╚' + '═'.repeat(W) + '╝';

console.log('');
console.log(top);
for (const line of lines2) {
  console.log('║' + pad(line, W) + '║');
}
console.log(bot);
console.log('');
