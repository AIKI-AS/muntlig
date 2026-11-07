import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const providers = process.argv.includes('--providers');
if (process.argv.slice(2).some(arg => arg !== '--providers')) {
  console.error('Bruk: pnpm dev [--providers]');
  process.exit(1);
}
let local, writeKey;
try {
  local = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  if (local.API_URL !== 'http://127.0.0.1:56321') throw new Error('Wrong local stack');
  writeKey = execFileSync('docker', ['exec', 'supabase_db_muntlig-mvp', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atqc', 'select value from muntlig_private.write_key where singleton'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!/^[a-f0-9]{64}$/.test(writeKey)) throw new Error('Invalid write key');
} catch {
  console.error('Start lokal Supabase og bruk migrasjonene før pnpm dev. Ingen nøkler skrives til disk.');
  process.exit(1);
}
const env = {
  HOME: process.env.HOME,
  PATH: process.env.PATH,
  NODE_ENV: 'development',
  NEXT_TELEMETRY_DISABLED: '1',
  SUPABASE_URL: local.API_URL,
  SUPABASE_ANON_KEY: local.PUBLISHABLE_KEY || local.ANON_KEY,
  MUNTLIG_DATABASE_WRITE_KEY: writeKey,
  PROVIDER_CALLS_ENABLED: providers ? 'true' : 'false',
};
if (providers) {
  for (const name of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_BASE_URL', 'SIMLI_API_KEY', 'SIMLI_FACE_ID']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  console.log('Leverandørkall aktivert. Bruk bare godkjent tilgang og syntetiske data.');
} else {
  console.log('Lokalt arbeidsrom. Eksterne KI-, tale- og avatarkall er deaktivert.');
}
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3210'], { env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
