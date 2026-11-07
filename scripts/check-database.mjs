import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Disposable synthetic users only. Never use this script against a remote database.
const status = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
assert.equal(status.API_URL, 'http://127.0.0.1:56321', 'Expected the dedicated local Muntlig stack');
const sql = input => execFileSync('docker', ['exec', '-i', 'supabase_db_muntlig-mvp', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const password = randomBytes(24).toString('hex');
const marker = randomUUID();
const teacherEmail = `gate.teacher.${marker}@example.test`;
const studentEmail = `gate.student.${marker}@example.test`;
let tenantId;
try {
  const fixture = readFileSync(new URL('../supabase/scripts/bootstrap-disposable-users.sql', import.meta.url), 'utf8');
  sql(`begin;\n\\set tenant_name 'Gate fixture ${marker}'\n\\set teacher_email '${teacherEmail}'\n\\set teacher_password '${password}'\n\\set student_email '${studentEmail}'\n\\set student_password '${password}'\n${fixture}\ncommit;`);
  tenantId = sql(`select tenant_id from public.profiles where id=(select id from auth.users where email='${teacherEmail}');`);
  const client = headers => createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, { global: { headers }, auth: { persistSession: false, autoRefreshToken: false } });
  const teacher = client({}), student = client({});
  const t = await teacher.auth.signInWithPassword({ email: teacherEmail, password });
  const s = await student.auth.signInWithPassword({ email: studentEmail, password });
  assert.equal(t.error, null, 'Synthetic teacher sign-in');
  assert.equal(s.error, null, 'Synthetic student sign-in');
  tenantId = sql(`select tenant_id from public.profiles where id='${t.data.user.id}';`);
  const packId = randomUUID(), sessionId = randomUUID();
  const goals = [0, 1, 2].map(i => ({ id: `goal-${i}`, title: `Testmål ${i}`, prompt: 'Kun syntetisk sikkerhetstest', sourceIds: ['source'] }));
  const sources = [{ id: 'source', title: 'Testkilde', page: 1, text: 'Kun syntetiske testdata.' }];
  const pack = { id: packId, title: 'Sikkerhetsfixture — ikke KI', subject: 'Test', level: 'VG1', description: '', minutes: 3, goals, sources, rights: 'teacher_owned', status: 'published', version: 1, createdAt: new Date().toISOString(), publishedAt: new Date().toISOString() };
  sql(`insert into public.packs(id,tenant_id,created_by,title,subject,level,description,minutes,goals,sources,rights) values ('${packId}','${tenantId}','${t.data.user.id}','Test','Test','VG1','',3,'${JSON.stringify(goals)}','${JSON.stringify(sources)}','teacher_owned'); update public.packs set status='published',published_at=now() where id='${packId}'; insert into public.practice_sessions(id,tenant_id,student_id,pack_id,pack_version,pack,mode,active_goal_id) values ('${sessionId}','${tenantId}','${s.data.user.id}','${packId}',1,'${JSON.stringify(pack)}','voice','goal-0');`);
  const assistant = { id: randomUUID(), role: 'assistant', text: 'Forfalsket KI-tur: kun sikkerhetstest.', goalId: 'goal-0', sourceIds: [], hint: false, at: new Date().toISOString() };
  const user = { ...assistant, id: randomUUID(), role: 'user', text: 'Dette er et selvlaget elevutsagn for testing.' };
  const evidence = { id: randomUUID(), goalId: 'goal-0', turnId: user.id, quote: user.text, status: 'independent', sourceIds: ['source'] };
  const forgedTurn = await student.from('practice_sessions').update({ turns: [assistant] }).eq('id', sessionId).select('id');
  const forgedEvidence = await student.from('practice_sessions').update({ turns: [assistant, user], evidence: [evidence] }).eq('id', sessionId).select('id');
  const bypass = { assistantWritten: Boolean(forgedTurn.data?.length), evidenceWritten: Boolean(forgedEvidence.data?.length) };
  console.log('Direct PostgREST mutation:', bypass);
  assert.deepEqual(bypass, { assistantWritten: false, evidenceWritten: false }, 'Students must not forge tutor turns or evidence');
  const readable = await student.from('practice_sessions').select('turns,evidence').eq('id', sessionId).single();
  assert.deepEqual(readable.data, { turns: [], evidence: [] }, 'Own data remains readable and unchanged');
  const teacherPrivate = await teacher.from('practice_sessions').select('id').eq('id', sessionId);
  assert.deepEqual(teacherPrivate.data, [], 'Teacher cannot read private student sessions');
  const hiddenKey = await student.schema('muntlig_private').from('write_key').select('*');
  assert.ok(hiddenKey.error, 'The write key is not exposed by PostgREST');
  const wrong = client({ 'x-muntlig-write-key': '0'.repeat(64) });
  await wrong.auth.setSession(s.data.session);
  const wrongWrite = await wrong.from('practice_sessions').update({ turns: [assistant] }).eq('id', sessionId).select('id');
  assert.equal(wrongWrite.data?.length || 0, 0, 'A guessed key grants no write access');
  const blockedInsert = await student.from('practice_sessions').insert({ id: randomUUID(), tenant_id: tenantId, student_id: s.data.user.id, pack_id: packId, pack_version: 1, pack, mode: 'text', active_goal_id: 'goal-0' });
  assert.equal(blockedInsert.status, 403, 'The browser cannot create unvalidated sessions');
  const key = sql('select value from muntlig_private.write_key where singleton;');
  assert.match(key, /^[a-f0-9]{64}$/);
  const server = client({ 'x-muntlig-write-key': key });
  await server.auth.setSession(s.data.session);
  const saved = await server.from('practice_sessions').update({ turns: [assistant] }).eq('id', sessionId).eq('revision', 0).select('revision').single();
  assert.equal(saved.error, null, 'Server writes with the same user identity');
  assert.equal(saved.data.revision, 1);
  const stale = await server.from('practice_sessions').update({ turns: [assistant] }).eq('id', sessionId).eq('revision', 0).select('id');
  assert.deepEqual(stale.data, [], 'Stale writes cannot replace a newer revision');
  const wrongOwner = client({ 'x-muntlig-write-key': key });
  await wrongOwner.auth.setSession(t.data.session);
  const denied = await wrongOwner.from('practice_sessions').update({ turns: [assistant] }).eq('id', sessionId).select('id');
  assert.deepEqual(denied.data, [], 'The server gate does not bypass owner RLS');
  sql(`update public.profiles set role='teacher' where id='${s.data.user.id}';`);
  const preview = await server.from('practice_sessions').insert({ id: randomUUID(), tenant_id: tenantId, student_id: s.data.user.id, pack_id: packId, pack_version: 1, pack, mode: 'text', active_goal_id: 'goal-0' });
  assert.equal(preview.status, 403, 'Teacher preview is limited to their own packs even with the server gate');
  sql(`update public.profiles set role='student' where id='${s.data.user.id}';`);
  const allowedQuota = await server.rpc('take_quota', { p_scope: 'gate-check', p_limit: 1, p_seconds: 3600 });
  const exhaustedQuota = await server.rpc('take_quota', { p_scope: 'gate-check', p_limit: 1, p_seconds: 3600 });
  assert.equal(allowedQuota.data, true);
  assert.equal(exhaustedQuota.data, false, 'Server calls still enforce the atomic quota');
  const quota = await student.rpc('take_quota', { p_scope: 'turn', p_limit: 100000, p_seconds: 1 });
  assert.ok(quota.error, 'The browser cannot alter paid-call quota counters');
  if (process.argv.includes('--api')) {
    const base = 'http://127.0.0.1:3210';
    const login = async email => {
      const response = await fetch(base + '/api/auth/sign-in', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      assert.equal(response.status, 200, 'The app signs in a synthetic account');
      return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    };
    const call = (path, cookie, body, origin = base) => fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const teacherCookie = await login(teacherEmail), studentCookie = await login(studentEmail);
    const bootstrap = await (await call('/api/bootstrap', teacherCookie)).json();
    assert.equal(bootstrap.integrations.llm, false, 'This smoke must not enable or spend on providers');
    const input = { title: 'API boundary check', subject: 'Test', level: 'VG1', description: '', minutes: 3, goals, sources, rights: 'teacher_owned' };
    const createdResponse = await call('/api/packs', teacherCookie, input);
    assert.equal(createdResponse.status, 200, 'Teacher creates a pack through the app and write gate');
    const created = await createdResponse.json();
    const published = await call('/api/packs/' + created.id + '/publish', teacherCookie, {});
    assert.equal(published.status, 200);
    assert.equal((await published.json()).status, 'published');
    const studentPacks = await (await call('/api/bootstrap', studentCookie)).json();
    assert.ok(studentPacks.packs.some(pack => pack.id === created.id), 'Published content reaches the same-school student');
    assert.equal((await call('/api/packs', studentCookie, input)).status, 403, 'Student cannot publish teacher content');
    assert.equal((await call('/api/packs', teacherCookie, input, 'https://invalid.example')).status, 403, 'Cross-origin writes are blocked');
    assert.equal((await call('/api/bootstrap', '')).status, 401);
    assert.equal((await call('/api/sessions', studentCookie, { packId: created.id, mode: 'text' })).status, 503, 'No fake provider fallback');
    const html = await (await fetch(base, { headers: { Cookie: teacherCookie } })).text();
    assert.ok(!html.includes(key), 'The server write key never enters rendered HTML');
    const chunks = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]).filter(path => path.startsWith('/_next/static/')))];
    for (const path of chunks) assert.ok(!(await (await fetch(base + path)).text()).includes(key), 'The server write key never enters client bundles');
    console.log('PASS: actual app login, create, publish, student access, role/CSRF/anonymous guards, provider-off and client-key leak check.');
  }
  console.log('PASS: forged turns/evidence, session insertion, guessed/private key, owner/teacher isolation, revision CAS and atomic quota. No provider calls.');
} catch (error) {
  // Subprocess errors can contain credentials: never print their stdout, stderr or command.
  console.error(error instanceof assert.AssertionError ? error.message : 'Database boundary check failed (details suppressed).');
  process.exitCode = 1;
} finally {
  if (tenantId) sql(`begin; delete from public.practice_sessions where tenant_id='${tenantId}'; alter table public.packs disable trigger packs_guard; delete from public.packs where tenant_id='${tenantId}'; alter table public.packs enable trigger packs_guard; delete from public.profiles where tenant_id='${tenantId}'; delete from auth.users where email in ('${teacherEmail}','${studentEmail}'); delete from public.tenants where id='${tenantId}'; commit;`);
}
