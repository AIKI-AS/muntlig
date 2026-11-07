-- Creates ONE tenant with ONE teacher and ONE student for LOCAL testing. Sign-ups are disabled, so
-- this is the only way accounts come into existence. Credentials are passed on the command line and
-- are never stored in this repo. Run it only against the local Supabase database:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:56322/postgres" -v ON_ERROR_STOP=1 \
--     -v tenant_name='Testskole (syntetisk)' \
--     -v teacher_email='<teacher@example.test>' -v teacher_password='<min 10 chars>' \
--     -v student_email='<student@example.test>' -v student_password='<min 10 chars>' \
--     -f supabase/scripts/bootstrap-disposable-users.sql
--
-- Re-running with the same e-mail addresses fails on the unique constraint (nothing is changed).

\if :{?tenant_name}
\else
  \echo tenant_name mangler
  \quit
\endif
\if :{?teacher_email}
\else
  \echo teacher_email mangler
  \quit
\endif
\if :{?teacher_password}
\else
  \echo teacher_password mangler
  \quit
\endif
\if :{?student_email}
\else
  \echo student_email mangler
  \quit
\endif
\if :{?student_password}
\else
  \echo student_password mangler
  \quit
\endif
with tenant as (
  insert into public.tenants (name) values (:'tenant_name') returning id
), people as (
  select gen_random_uuid() as id, :'teacher_email'::text as email, :'teacher_password'::text as password,
         'teacher'::text as role, 'Test Lærer'::text as display_name
  union all
  select gen_random_uuid(), :'student_email', :'student_password', 'student', 'Test Elev'
), users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', lower(email),
         extensions.crypt(password, extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
  from people
  returning id, email
), identities as (
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), id, id::text,
         jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now()
  from users
  returning user_id
)
insert into public.profiles (id, tenant_id, role, display_name)
select p.id, tenant.id, p.role, p.display_name from people p cross join tenant;
