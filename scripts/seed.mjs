import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const sql = readFileSync('supabase/seed.sql', 'utf8');

execSync('npx supabase db query --linked', {
  input: sql,
  stdio: ['pipe', 'inherit', 'inherit'],
});
