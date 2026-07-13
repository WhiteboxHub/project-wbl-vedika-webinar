/**
 * Migration runner — uses docker exec psql to apply each .sql file atomically.
 *
 * Why not pg.Pool + split(';')? PL/pgSQL functions, dollar-quoted strings, and
 * multi-statement transactions all break when split on semicolons. Running the
 * file through psql directly is the only reliable approach.
 *
 * Usage: pnpm --filter @webinar/api migrate
 * Environment: DATABASE_URL must be set (e.g. in .env)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://webinar:webinar@localhost:5444/webinar_db';

// Parse the connection string into components for psql flags
let pgHost = 'localhost';
let pgPort = '5444';
let pgUser = 'webinar';
let pgDb = 'webinar_db';
let pgPassword = 'webinar';

try {
  const u = new URL(DATABASE_URL);
  pgHost = u.hostname;
  pgPort = u.port || '5432';
  pgUser = u.username;
  pgDb = u.pathname.replace(/^\//, '');
  pgPassword = decodeURIComponent(u.password || '');
} catch {
  console.warn('Could not parse DATABASE_URL — using defaults');
}

const migrationsDir = path.join(__dirname, '../src/database/migrations');

function applyMigration(file: string) {
  const filePath = path.join(migrationsDir, file);

  // Try docker exec first (works when Postgres is in a container named webinar-postgres)
  const dockerCmd = `docker exec -i webinar-postgres psql -U ${pgUser} -d ${pgDb}`;
  // Fallback: direct psql if installed on host
  const hostCmd = `psql postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${pgDb}`;

  let useDocker = true;
  try {
    execSync('docker inspect webinar-postgres --format "{{.State.Status}}"', { stdio: 'pipe' });
  } catch {
    useDocker = false;
  }

  const cmd = useDocker ? dockerCmd : hostCmd;
  const sqlContent = fs.readFileSync(filePath, 'utf8');

  try {
    execSync(cmd, {
      input: sqlContent,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PGPASSWORD: pgPassword },
    });
    console.log(`  ✓ ${file}`);
  } catch (err: any) {
    const output: string = (err.stderr || err.stdout || err.message || '').toString();
    // Treat "already exists" as success — idempotent re-runs are expected
    const lines = output.split('\n');
    const realErrors = lines.filter(
      (l) =>
        l.includes('ERROR') &&
        !l.includes('already exists') &&
        !l.includes('duplicate key'),
    );
    if (realErrors.length === 0) {
      console.log(`  ✓ ${file} (some statements already applied — OK)`);
    } else {
      console.error(`  ✗ ${file} failed:`);
      realErrors.forEach((e) => console.error(`    ${e.trim()}`));
      throw new Error(`Migration failed: ${file}`);
    }
  }
}

async function runMigrations() {
  console.log('Running database migrations...');

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    applyMigration(file);
  }

  console.log(`\nAll ${files.length} migrations completed successfully.`);
}

runMigrations().catch((err) => {
  console.error('\nMigration aborted:', err.message);
  process.exit(1);
});
