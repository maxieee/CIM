import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from './client.js';
import { env } from '../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate(): Promise<void> {
  console.log('Starting database migration...');

  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  // Parse SQL statements properly handling function bodies with semicolons
  const statements: string[] = [];
  let current = '';
  let inFunction = false;
  let dollarQuote = '';

  const lines = schema.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('--')) {
      continue;
    }

    // Detect function start
    if (trimmed.match(/^CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i)) {
      inFunction = true;
    }

    // Detect dollar quote start/end
    const dollarMatch = line.match(/\$([a-zA-Z0-9_]*)\$/);
    if (dollarMatch) {
      if (!dollarQuote) {
        dollarQuote = dollarMatch[0];
      } else if (dollarMatch[0] === dollarQuote) {
        dollarQuote = '';
      }
    }

    // Detect function end (END $$ LANGUAGE)
    if (inFunction && trimmed.match(/^END\s*;?\s*$/i) && !dollarQuote) {
      inFunction = false;
    }

    current += line + '\n';

    // Check for statement end (semicolon not inside function or dollar quote)
    if (trimmed.endsWith(';') && !inFunction && !dollarQuote) {
      statements.push(current.trim());
      current = '';
    }
  }

  // Add any remaining
  if (current.trim()) {
    statements.push(current.trim());
  }

  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await query(statement);
        console.log('✓ Executed:', statement.slice(0, 80).replace(/\n/g, ' ') + '...');
      } catch (err: any) {
        // Ignore "already exists" errors
        if (err.code === '42P07' || err.code === '42710' || err.message?.includes('already exists')) {
          console.log('⊘ Skipped (exists):', statement.slice(0, 80).replace(/\n/g, ' ') + '...');
        } else {
          console.error('✗ Failed:', statement.slice(0, 100).replace(/\n/g, ' '));
          console.error('  Error:', err.message);
          throw err;
        }
      }
    }
  }

  console.log('Migration complete!');
}

export async function seedAdmin(): Promise<void> {
  console.log('Seeding admin user...');

  const bcrypt = await import('bcryptjs');
  const { hash } = bcrypt.default;

  // Use env var or default password
  const defaultPassword = 'ChangeMe123!';
  const passwordHash = await hash(defaultPassword, 12);

  try {
    await query(
      `INSERT INTO admins (username, password_hash, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [env.ADMIN_USERNAME, passwordHash]
    );
    console.log(`✓ Admin user "${env.ADMIN_USERNAME}" ready`);
    if (env.NODE_ENV === 'development') {
      console.log(`  Default password: ${defaultPassword}`);
      console.log(`  Password hash stored in ADMIN_PASSWORD_HASH env var`);
    }
  } catch (err) {
    console.error('Failed to seed admin:', err);
    throw err;
  }
}

async function main() {
  try {
    await migrate();
    await seedAdmin();
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();