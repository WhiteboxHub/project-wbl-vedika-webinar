import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Auto-migration runner — called at API startup before NestJS boots.
 *
 * Splits each SQL file into individual statements while correctly handling:
 * - Dollar-quoted PL/pgSQL blocks ($$...$$)
 * - Line comments (--)
 * - Standard semicolon delimiters
 *
 * Each statement is executed independently so one failure doesn't block others.
 * "already exists" errors are treated as success (idempotent re-runs).
 */
export async function runMigrationsOnStartup(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });

  // __dirname is dist/database in compiled mode and src/database in ts-node mode.
  // The .sql files always live alongside the TypeScript sources in src/database/migrations,
  // so we walk up until we find the migrations directory.
  const candidates = [
    path.join(__dirname, 'migrations'),                        // src/database/migrations (ts-node)
    path.join(__dirname, '..', 'src', 'database', 'migrations'), // from dist/database -> src
    path.join(__dirname, '..', '..', 'src', 'database', 'migrations'), // from dist -> src
  ];
  const migrationsDir = candidates.find((p) => fs.existsSync(p));

  if (!migrationsDir) {
    console.warn('[Migrations] Could not find migrations directory. Searched:', candidates);
    await pool.end();
    return;
  }

  console.log('[Migrations] Using directory:', migrationsDir);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`[Migrations] Running ${files.length} migration files...`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const statements = splitSqlStatements(sql);

    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      try {
        await pool.query(stmt);
      } catch (err: any) {
        const msg: string = err.message || '';
        const isExpected =
          msg.includes('already exists') ||
          msg.includes('duplicate key') ||
          msg.includes('does not exist') && msg.includes('skipping');
        if (!isExpected) {
          // Log but don't throw — some statements depend on earlier ones that
          // may not have run yet on a partial DB. Next startup will retry.
          console.error(`[Migrations] ✗ ${file}: ${msg.split('\n')[0]}`);
        }
      }
    }
    console.log(`[Migrations] ✓ ${file}`);
  }

  await pool.end();
  console.log('[Migrations] Done.');
}

/**
 * Splits a SQL string into individual executable statements.
 * Handles dollar-quoted blocks ($$...$$) so PL/pgSQL functions are kept intact.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';
  let i = 0;

  while (i < sql.length) {
    // Check for start/end of dollar-quote block (e.g. $$ or $tag$)
    if (!inDollarQuote) {
      const dollarMatch = sql.slice(i).match(/^(\$[^$]*\$)/);
      if (dollarMatch) {
        dollarTag = dollarMatch[1];
        inDollarQuote = true;
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    } else {
      if (sql.slice(i).startsWith(dollarTag)) {
        current += dollarTag;
        i += dollarTag.length;
        inDollarQuote = false;
        dollarTag = '';
        continue;
      }
    }

    const ch = sql[i];

    // Semicolon outside a dollar-quote = statement boundary
    if (ch === ';' && !inDollarQuote) {
      current += ch;
      const trimmed = current.replace(/--[^\n]*/g, '').trim();
      if (trimmed && trimmed !== ';') {
        statements.push(current.trim());
      }
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  // Flush remaining content (no trailing semicolon)
  const trimmed = current.replace(/--[^\n]*/g, '').trim();
  if (trimmed) statements.push(current.trim());

  return statements;
}
