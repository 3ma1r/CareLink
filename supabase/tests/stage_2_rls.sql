-- Run against a disposable/local Supabase database. Everything is rolled back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'caregiver-one@example.invalid', '', now(), '{}', '{"full_name":"Caregiver One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'caregiver-two@example.invalid', '', now(), '{}', '{"full_name":"Caregiver Two"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

insert into public.patients (caregiver_id, full_name, date_of_birth)
values ('11111111-1111-4111-8111-111111111111', 'Patient One', date '1950-01-01');

do $$
begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'caregiver one could not read exactly their own profile';
  end if;
  if (select count(*) from public.patients) <> 1 then
    raise exception 'caregiver one could not read their own patient';
  end if;
end $$;

do $$
begin
  begin
    update public.patients
    set caregiver_id = '22222222-2222-4222-8222-222222222222'
    where caregiver_id = '11111111-1111-4111-8111-111111111111';
    raise exception 'caregiver_id reassignment unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
begin
  if (select count(*) from public.patients) <> 0 then
    raise exception 'caregiver two could read caregiver one patient';
  end if;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform * from public.profiles;
    raise exception 'anonymous role could read profiles';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.patients;
    raise exception 'anonymous role could read patients';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
