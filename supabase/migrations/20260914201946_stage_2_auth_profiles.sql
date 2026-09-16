-- CareLink Stage 2: caregiver profiles and one patient per caregiver.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 100),
  phone text check (phone is null or char_length(btrim(phone)) between 1 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 100),
  date_of_birth date not null check (date_of_birth >= date '1900-01-01'),
  gender text check (gender is null or gender in ('female', 'male', 'non_binary', 'other', 'prefer_not_to_say')),
  emergency_contact_name text check (
    emergency_contact_name is null or char_length(btrim(emergency_contact_name)) between 1 and 100
  ),
  emergency_contact_phone text check (
    emergency_contact_phone is null or char_length(btrim(emergency_contact_phone)) between 1 and 32
  ),
  health_notes text check (health_notes is null or char_length(btrim(health_notes)) between 1 and 1000),
  avatar_path text check (avatar_path is null or char_length(avatar_path) between 1 and 512),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.validate_patient_birth_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.date_of_birth > current_date then
    raise exception 'date_of_birth cannot be in the future' using errcode = '22007';
  end if;
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger patients_set_updated_at
before update on public.patients
for each row execute function private.set_updated_at();

create trigger patients_validate_birth_date
before insert or update of date_of_birth on public.patients
for each row execute function private.validate_patient_birth_date();

-- This privileged trigger is required because confirmed-email registrations may not
-- have a browser session yet. It inserts only the new auth user's own profile row.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Caregiver'), 100)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.validate_patient_birth_date() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.patients enable row level security;
alter table public.patients force row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.patients from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.patients to authenticated;

create policy profiles_select_own
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_insert_own
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy patients_select_own
on public.patients for select to authenticated
using ((select auth.uid()) = caregiver_id);

create policy patients_insert_own
on public.patients for insert to authenticated
with check ((select auth.uid()) = caregiver_id);

create policy patients_update_own
on public.patients for update to authenticated
using ((select auth.uid()) = caregiver_id)
with check ((select auth.uid()) = caregiver_id);

create policy patients_delete_own
on public.patients for delete to authenticated
using ((select auth.uid()) = caregiver_id);

-- Remove API access to a pre-existing database helper reported by the security advisor.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
