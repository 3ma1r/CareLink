-- CareLink Stage 3: secure device pairing and protected ingestion.
create extension if not exists pgcrypto with schema extensions;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  device_identifier text not null unique check (device_identifier ~ '^CL-[A-Z0-9]{12}$'),
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  device_model text not null check (char_length(btrim(device_model)) between 1 and 80),
  provisioned_at timestamptz not null default now(),
  paired_patient_id uuid unique references public.patients(id) on delete set null,
  paired_at timestamptz,
  last_contact_at timestamptz,
  firmware_version text check (firmware_version is null or char_length(firmware_version) between 1 and 40),
  status text not null default 'active' check (status in ('active','disabled','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((paired_patient_id is null and paired_at is null) or (paired_patient_id is not null and paired_at is not null))
);

create table private.device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  credential_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique nulls not distinct (device_id, revoked_at)
);

create table private.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  locked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index pairing_codes_one_open_per_device on private.pairing_codes(device_id)
where consumed_at is null and locked_at is null;

create table public.device_measurements (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices(id) on delete restrict,
  message_id text not null check (char_length(message_id) between 8 and 80),
  measured_at timestamptz not null,
  received_at timestamptz not null default now(),
  heart_rate smallint check (heart_rate is null or heart_rate between 20 and 250),
  spo2 numeric(5,2) check (spo2 is null or spo2 between 50 and 100),
  sensor_temperature numeric(5,2) check (sensor_temperature is null or sensor_temperature between -20 and 85),
  movement numeric(10,3) check (movement is null or movement between 0 and 1000000),
  latitude numeric(9,6),
  longitude numeric(9,6),
  gps_fix_at timestamptz,
  quality text not null default 'missing' check (quality in ('good','unstable','missing')),
  battery_percent numeric(5,2) check (battery_percent is null or battery_percent between 0 and 100),
  created_at timestamptz not null default now(),
  unique(device_id,message_id),
  check ((latitude is null and longitude is null and gps_fix_at is null) or
         (latitude between -90 and 90 and longitude between -180 and 180 and gps_fix_at is not null))
);
create index device_measurements_device_measured_idx on public.device_measurements(device_id,measured_at desc);

create trigger devices_set_updated_at before update on public.devices
for each row execute function private.set_updated_at();

alter table public.devices enable row level security;
alter table public.devices force row level security;
alter table public.device_measurements enable row level security;
alter table public.device_measurements force row level security;
revoke all on public.devices, public.device_measurements from public, anon, authenticated;
grant select on public.devices, public.device_measurements to authenticated;

create policy devices_select_owned on public.devices for select to authenticated
using (exists (
  select 1 from public.patients p
  where p.id = devices.paired_patient_id and p.caregiver_id = (select auth.uid())
));
create policy device_measurements_select_owned on public.device_measurements for select to authenticated
using (exists (
  select 1 from public.devices d join public.patients p on p.id=d.paired_patient_id
  where d.id=device_measurements.device_id and p.caregiver_id=(select auth.uid())
));

revoke all on private.device_credentials, private.pairing_codes from public, anon, authenticated;

create or replace function public.provision_carelink_device(
  p_display_name text default 'CareLink Band', p_device_model text default 'CL-BAND-DEV',
  p_pairing_minutes integer default 30
) returns table(device_identifier text, device_credential text, pairing_code text, expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_device public.devices; v_credential text; v_code text;
begin
  if p_pairing_minutes not between 5 and 1440 then raise exception 'invalid pairing lifetime'; end if;
  v_credential := encode(extensions.gen_random_bytes(32),'hex');
  v_code := upper(encode(extensions.gen_random_bytes(5),'hex'));
  insert into public.devices(device_identifier,display_name,device_model)
  values ('CL-'||upper(encode(extensions.gen_random_bytes(6),'hex')),left(btrim(p_display_name),80),left(btrim(p_device_model),80))
  returning * into v_device;
  insert into private.device_credentials(device_id,credential_hash)
  values(v_device.id,extensions.crypt(v_credential,extensions.gen_salt('bf',12)));
  insert into private.pairing_codes(device_id,code_hash,expires_at)
  values(v_device.id,extensions.crypt(v_code,extensions.gen_salt('bf',12)),now()+make_interval(mins=>p_pairing_minutes));
  return query select v_device.device_identifier,v_credential,v_code,now()+make_interval(mins=>p_pairing_minutes);
end $$;

create or replace function public.pair_carelink_device(
 p_user_id uuid,p_device_identifier text,p_pairing_code text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_device public.devices; v_code private.pairing_codes; v_patient uuid;
begin
 select id into v_patient from public.patients where caregiver_id=p_user_id;
 if v_patient is null then return jsonb_build_object('ok',false); end if;
 select * into v_device from public.devices where device_identifier=upper(btrim(p_device_identifier)) for update;
 if v_device.id is null or v_device.status<>'active' or v_device.paired_patient_id is not null then return jsonb_build_object('ok',false); end if;
 select * into v_code from private.pairing_codes where device_id=v_device.id and consumed_at is null and locked_at is null order by created_at desc limit 1 for update;
 if v_code.id is null or v_code.expires_at<=now() then return jsonb_build_object('ok',false); end if;
 if extensions.crypt(upper(btrim(p_pairing_code)),v_code.code_hash)<>v_code.code_hash then
   update private.pairing_codes set failed_attempts=failed_attempts+1,
     locked_at=case when failed_attempts+1>=5 then now() else null end where id=v_code.id;
   return jsonb_build_object('ok',false);
 end if;
 update public.devices set paired_patient_id=v_patient,paired_at=now() where id=v_device.id;
 update private.pairing_codes set consumed_at=now() where id=v_code.id;
 return jsonb_build_object('ok',true,'device_identifier',v_device.device_identifier);
end $$;

create or replace function public.unpair_carelink_device(p_user_id uuid,p_device_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_found uuid;
begin
 select d.id into v_found from public.devices d join public.patients p on p.id=d.paired_patient_id
 where d.id=p_device_id and p.caregiver_id=p_user_id for update of d;
 if v_found is null then return false; end if;
 update public.devices set paired_patient_id=null,paired_at=null,status='revoked' where id=v_found;
 update private.device_credentials set revoked_at=now() where device_id=v_found and revoked_at is null;
 update private.pairing_codes set locked_at=coalesce(locked_at,now()) where device_id=v_found and consumed_at is null;
 return true;
end $$;

create or replace function public.ingest_carelink_measurements(
 p_device_identifier text,p_device_credential text,p_firmware_version text,p_measurements jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_device_id uuid; v_hash text; v_item jsonb; v_inserted int:=0; v_duplicates int:=0; v_rows int;
begin
 select d.id,c.credential_hash into v_device_id,v_hash
 from public.devices d join private.device_credentials c on c.device_id=d.id and c.revoked_at is null
 where d.device_identifier=upper(btrim(p_device_identifier)) and d.status='active' for update of d;
 if v_device_id is null or v_hash is null or extensions.crypt(p_device_credential,v_hash)<>v_hash then
   return jsonb_build_object('ok',false);
 end if;
 if jsonb_typeof(p_measurements)<>'array' or jsonb_array_length(p_measurements) not between 1 and 10 then
   return jsonb_build_object('ok',false,'invalid_payload',true);
 end if;
 for v_item in select value from jsonb_array_elements(p_measurements) loop
   if (v_item->>'measured_at')::timestamptz < now()-interval '30 days'
      or (v_item->>'measured_at')::timestamptz > now()+interval '5 minutes' then
      return jsonb_build_object('ok',false,'invalid_payload',true);
   end if;
   insert into public.device_measurements(device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,latitude,longitude,gps_fix_at,quality,battery_percent)
   values(v_device_id,v_item->>'message_id',(v_item->>'measured_at')::timestamptz,
     (v_item->>'heart_rate')::smallint,(v_item->>'spo2')::numeric,(v_item->>'sensor_temperature')::numeric,
     (v_item->>'movement')::numeric,(v_item->>'latitude')::numeric,(v_item->>'longitude')::numeric,
     (v_item->>'gps_fix_at')::timestamptz,coalesce(v_item->>'quality','missing'),(v_item->>'battery_percent')::numeric)
   on conflict(device_id,message_id) do nothing;
   get diagnostics v_rows=row_count;
   if v_rows=1 then v_inserted:=v_inserted+1; else v_duplicates:=v_duplicates+1; end if;
 end loop;
 update public.devices set last_contact_at=now(),firmware_version=nullif(left(btrim(p_firmware_version),40),'') where id=v_device_id;
 return jsonb_build_object('ok',true,'inserted',v_inserted,'duplicates',v_duplicates);
exception when others then
 return jsonb_build_object('ok',false,'invalid_payload',true);
end $$;

revoke all on function public.provision_carelink_device(text,text,integer) from public,anon,authenticated;
revoke all on function public.pair_carelink_device(uuid,text,text) from public,anon,authenticated;
revoke all on function public.unpair_carelink_device(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ingest_carelink_measurements(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.provision_carelink_device(text,text,integer) to service_role;
grant execute on function public.pair_carelink_device(uuid,text,text) to service_role;
grant execute on function public.unpair_carelink_device(uuid,uuid) to service_role;
grant execute on function public.ingest_carelink_measurements(text,text,text,jsonb) to service_role;
