-- CareLink Stage 5A: deterministic, transactionally generated in-app alerts.
-- These are conservative prototype monitoring controls, not diagnostic criteria.

alter table public.device_measurements
  add column confirmed_fall boolean not null default false;

create table private.care_alert_rule_definitions (
  id bigint generated always as identity primary key,
  patient_id uuid references public.patients(id) on delete cascade,
  rule_id text not null,
  rule_version smallint not null check (rule_version > 0),
  alert_type text not null check (alert_type in ('vital','fall')),
  metric text not null check (metric in ('heart_rate','spo2','temperature','fall')),
  comparison text not null check (comparison in ('lt','gt','eq')),
  threshold numeric not null,
  unit text,
  severity text not null check (severity in ('moderate','high','critical')),
  confirmation_count smallint not null check (confirmation_count > 0),
  confirmation_window_seconds integer not null check (confirmation_window_seconds >= 0),
  cooldown_seconds integer not null check (cooldown_seconds >= 0),
  normal_resolution_count smallint not null check (normal_resolution_count >= 0),
  title text not null check (char_length(title) between 1 and 120),
  message_template text not null check (char_length(message_template) between 1 and 500),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique nulls not distinct (patient_id,rule_id,rule_version),
  check ((alert_type='fall' and metric='fall' and normal_resolution_count=0)
      or (alert_type='vital' and metric<>'fall' and normal_resolution_count>0))
);

revoke all on private.care_alert_rule_definitions from public,anon,authenticated;

-- Version 1 mirrors the thresholds already used by the wearable and web status labels.
-- Vital warnings require two recent good-quality readings; two later normal
-- good-quality readings resolve an open vital alert. Cooldown applies after closure.
insert into private.care_alert_rule_definitions
  (rule_id,rule_version,alert_type,metric,comparison,threshold,unit,severity,
   confirmation_count,confirmation_window_seconds,cooldown_seconds,
   normal_resolution_count,title,message_template)
values
  ('heart_rate_low',1,'vital','heart_rate','lt',50,'bpm','high',2,900,3600,2,
   'Low heart rate','A good-quality heart rate of %s %s was below the prototype threshold of %s %s.'),
  ('heart_rate_high',1,'vital','heart_rate','gt',120,'bpm','high',2,900,3600,2,
   'High heart rate','A good-quality heart rate of %s %s was above the prototype threshold of %s %s.'),
  ('spo2_low',1,'vital','spo2','lt',90,'%','critical',2,900,3600,2,
   'Low blood oxygen','A good-quality SpO2 reading of %s%s was below the prototype threshold of %s%s.'),
  ('temperature_low',1,'vital','temperature','lt',35,'°C','moderate',2,900,3600,2,
   'Low sensor temperature','A good-quality sensor temperature of %s%s was below the prototype threshold of %s%s.'),
  ('temperature_high',1,'vital','temperature','gt',38,'°C','high',2,900,3600,2,
   'High sensor temperature','A good-quality sensor temperature of %s%s was above the prototype threshold of %s%s.'),
  ('confirmed_fall',1,'fall','fall','eq',1,null,'critical',1,0,0,0,
   'Confirmed fall detected','The wearable reported a confirmed fall event. Caregiver review is required.');

create table public.care_alerts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  device_id uuid not null references public.devices(id) on delete restrict,
  source_measurement_id bigint not null references public.device_measurements(id) on delete restrict,
  rule_id text not null,
  rule_version smallint not null check (rule_version > 0),
  alert_type text not null check (alert_type in ('vital','fall')),
  metric text not null check (metric in ('heart_rate','spo2','temperature','fall')),
  severity text not null check (severity in ('moderate','high','critical')),
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 1 and 500),
  observed_value numeric,
  unit text,
  measurement_quality text not null check (measurement_quality in ('good','not_applicable')),
  threshold_metadata jsonb not null,
  measurement_at timestamptz not null,
  first_triggered_at timestamptz not null,
  last_seen_at timestamptz not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  status text not null default 'active' check (status in ('active','acknowledged','resolved')),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_measurement_id,rule_id,rule_version),
  check ((status='active' and acknowledged_at is null and acknowledged_by is null and resolved_at is null)
      or (status='acknowledged' and acknowledged_at is not null and acknowledged_by is not null and resolved_at is null)
      or (status='resolved' and resolved_at is not null)),
  check ((alert_type='fall' and metric='fall' and observed_value is null and measurement_quality='not_applicable')
      or (alert_type='vital' and metric<>'fall' and observed_value is not null and measurement_quality='good')),
  check (first_triggered_at <= last_seen_at)
);

create index care_alerts_patient_created_idx
  on public.care_alerts(patient_id,created_at desc);
create index care_alerts_device_rule_seen_idx
  on public.care_alerts(device_id,rule_id,rule_version,last_seen_at desc);
create unique index care_alerts_one_open_vital_rule
  on public.care_alerts(patient_id,device_id,rule_id,rule_version)
  where alert_type='vital' and status in ('active','acknowledged');

create or replace function private.care_alerts_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.status=old.status then
    new.acknowledged_at:=old.acknowledged_at;
    new.acknowledged_by:=old.acknowledged_by;
    new.resolved_at:=old.resolved_at;
  elsif old.status='active' and new.status='acknowledged' then
    if (select auth.uid()) is null then
      raise exception 'caregiver identity required' using errcode='42501';
    end if;
    new.acknowledged_at:=now();
    new.acknowledged_by:=(select auth.uid());
    new.resolved_at:=null;
  elsif old.status in ('active','acknowledged') and new.status='resolved' then
    new.resolved_at:=now();
    if old.status='acknowledged' then
      new.acknowledged_at:=old.acknowledged_at;
      new.acknowledged_by:=old.acknowledged_by;
    else
      new.acknowledged_at:=null;
      new.acknowledged_by:=null;
    end if;
  else
    raise exception 'invalid alert status transition' using errcode='22023';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

create trigger care_alerts_lifecycle_before_update
before update on public.care_alerts
for each row execute function private.care_alerts_lifecycle();

revoke all on function private.care_alerts_lifecycle() from public,anon,authenticated;

alter table public.care_alerts enable row level security;
alter table public.care_alerts force row level security;
revoke all on public.care_alerts from public,anon,authenticated;
grant select on public.care_alerts to authenticated;
grant update(status) on public.care_alerts to authenticated;

create policy care_alerts_select_owned
on public.care_alerts for select to authenticated
using (exists (
  select 1 from public.patients p
  where p.id=care_alerts.patient_id and p.caregiver_id=(select auth.uid())
));

create policy care_alerts_update_owned
on public.care_alerts for update to authenticated
using (exists (
  select 1 from public.patients p
  where p.id=care_alerts.patient_id and p.caregiver_id=(select auth.uid())
))
with check (exists (
  select 1 from public.patients p
  where p.id=care_alerts.patient_id and p.caregiver_id=(select auth.uid())
));

create or replace function private.analyze_carelink_measurement(p_measurement_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_measurement public.device_measurements%rowtype;
  v_patient_id uuid;
  v_rule record;
  v_open_alert public.care_alerts%rowtype;
  v_value numeric;
  v_quality text;
  v_abnormal boolean;
  v_confirmed boolean;
  v_first_confirmed_at timestamptz;
  v_normal_confirmed boolean;
  v_message text;
begin
  select m.* into v_measurement
  from public.device_measurements m where m.id=p_measurement_id;

  select d.paired_patient_id into v_patient_id
  from public.devices d where d.id=v_measurement.device_id;

  if v_measurement.id is null or v_patient_id is null then return; end if;

  if v_measurement.confirmed_fall then
    select * into v_rule from private.care_alert_rule_definitions r
    where r.enabled and r.patient_id is null and r.rule_id='confirmed_fall'
    order by r.rule_version desc limit 1;

    insert into public.care_alerts(
      patient_id,device_id,source_measurement_id,rule_id,rule_version,alert_type,metric,
      severity,title,message,observed_value,unit,measurement_quality,threshold_metadata,
      measurement_at,first_triggered_at,last_seen_at,occurrence_count
    ) values (
      v_patient_id,v_measurement.device_id,v_measurement.id,v_rule.rule_id,v_rule.rule_version,
      v_rule.alert_type,v_rule.metric,v_rule.severity,v_rule.title,v_rule.message_template,
      null,null,'not_applicable',
      jsonb_build_object('comparison','eq','confirmed_fall',true,'confirmation_count',1,
        'cooldown_seconds',0,'prototype_monitoring',true),
      v_measurement.measured_at,v_measurement.measured_at,v_measurement.measured_at,1
    ) on conflict(source_measurement_id,rule_id,rule_version) do nothing;
  end if;

  for v_rule in
    select distinct on (r.rule_id) r.*
    from private.care_alert_rule_definitions r
    where r.enabled and r.alert_type='vital'
      and (r.patient_id is null or r.patient_id=v_patient_id)
    order by r.rule_id,r.patient_id nulls last,r.rule_version desc
  loop
    v_value:=case v_rule.metric
      when 'heart_rate' then v_measurement.heart_rate
      when 'spo2' then v_measurement.spo2
      when 'temperature' then v_measurement.sensor_temperature
    end;
    v_quality:=case v_rule.metric
      when 'heart_rate' then coalesce(v_measurement.heart_rate_quality,v_measurement.quality)
      when 'spo2' then coalesce(v_measurement.spo2_quality,v_measurement.quality)
      when 'temperature' then coalesce(v_measurement.temperature_quality,v_measurement.quality)
    end;

    if v_quality<>'good' or v_value is null then continue; end if;

    v_abnormal:=case v_rule.comparison
      when 'lt' then v_value<v_rule.threshold
      when 'gt' then v_value>v_rule.threshold
      else v_value=v_rule.threshold
    end;

    if v_abnormal then
      select count(*)=v_rule.confirmation_count
             and bool_and(case v_rule.comparison
               when 'lt' then recent.metric_value<v_rule.threshold
               when 'gt' then recent.metric_value>v_rule.threshold
               else recent.metric_value=v_rule.threshold end),
             min(recent.measured_at)
      into v_confirmed,v_first_confirmed_at
      from (
        select m.measured_at,
          case v_rule.metric when 'heart_rate' then m.heart_rate::numeric
            when 'spo2' then m.spo2
            when 'temperature' then m.sensor_temperature end as metric_value
        from public.device_measurements m
        where m.device_id=v_measurement.device_id
          and m.measured_at<=v_measurement.measured_at
          and m.measured_at>=v_measurement.measured_at-make_interval(secs=>v_rule.confirmation_window_seconds)
          and case v_rule.metric
            when 'heart_rate' then coalesce(m.heart_rate_quality,m.quality)='good' and m.heart_rate is not null
            when 'spo2' then coalesce(m.spo2_quality,m.quality)='good' and m.spo2 is not null
            when 'temperature' then coalesce(m.temperature_quality,m.quality)='good' and m.sensor_temperature is not null
          end
        order by m.measured_at desc,m.id desc
        limit v_rule.confirmation_count
      ) recent;

      if not coalesce(v_confirmed,false) then continue; end if;

      v_open_alert.id:=null;
      select * into v_open_alert from public.care_alerts a
      where a.patient_id=v_patient_id and a.device_id=v_measurement.device_id
        and a.rule_id=v_rule.rule_id and a.rule_version=v_rule.rule_version
        and a.status in ('active','acknowledged')
      order by a.created_at desc limit 1 for update;

      if v_open_alert.id is not null then
        update public.care_alerts set
          last_seen_at=greatest(last_seen_at,v_measurement.measured_at),
          occurrence_count=occurrence_count+1
        where id=v_open_alert.id;
      elsif not exists (
        select 1 from public.care_alerts a
        where a.patient_id=v_patient_id and a.device_id=v_measurement.device_id
          and a.rule_id=v_rule.rule_id and a.rule_version=v_rule.rule_version
          and a.last_seen_at>=v_measurement.measured_at-make_interval(secs=>v_rule.cooldown_seconds)
      ) then
        v_message:=format(v_rule.message_template,v_value,v_rule.unit,v_rule.threshold,v_rule.unit);
        insert into public.care_alerts(
          patient_id,device_id,source_measurement_id,rule_id,rule_version,alert_type,metric,
          severity,title,message,observed_value,unit,measurement_quality,threshold_metadata,
          measurement_at,first_triggered_at,last_seen_at,occurrence_count
        ) values (
          v_patient_id,v_measurement.device_id,v_measurement.id,v_rule.rule_id,v_rule.rule_version,
          v_rule.alert_type,v_rule.metric,v_rule.severity,v_rule.title,v_message,v_value,v_rule.unit,'good',
          jsonb_build_object('comparison',v_rule.comparison,'threshold',v_rule.threshold,'unit',v_rule.unit,
            'confirmation_count',v_rule.confirmation_count,
            'confirmation_window_seconds',v_rule.confirmation_window_seconds,
            'cooldown_seconds',v_rule.cooldown_seconds,
            'normal_resolution_count',v_rule.normal_resolution_count,
            'prototype_monitoring',true),
          v_measurement.measured_at,v_first_confirmed_at,v_measurement.measured_at,
          v_rule.confirmation_count
        ) on conflict(source_measurement_id,rule_id,rule_version) do nothing;
      end if;
    else
      v_open_alert.id:=null;
      select * into v_open_alert from public.care_alerts a
      where a.patient_id=v_patient_id and a.device_id=v_measurement.device_id
        and a.rule_id=v_rule.rule_id and a.rule_version=v_rule.rule_version
        and a.status in ('active','acknowledged')
      order by a.created_at desc limit 1 for update;

      if v_open_alert.id is null then continue; end if;

      select count(*)=v_rule.normal_resolution_count
             and bool_and(not case v_rule.comparison
               when 'lt' then recent.metric_value<v_rule.threshold
               when 'gt' then recent.metric_value>v_rule.threshold
               else recent.metric_value=v_rule.threshold end)
      into v_normal_confirmed
      from (
        select case v_rule.metric when 'heart_rate' then m.heart_rate::numeric
            when 'spo2' then m.spo2
            when 'temperature' then m.sensor_temperature end as metric_value
        from public.device_measurements m
        where m.device_id=v_measurement.device_id
          and m.measured_at>v_open_alert.last_seen_at
          and m.measured_at<=v_measurement.measured_at
          and m.measured_at>=v_measurement.measured_at-make_interval(secs=>v_rule.confirmation_window_seconds)
          and case v_rule.metric
            when 'heart_rate' then coalesce(m.heart_rate_quality,m.quality)='good' and m.heart_rate is not null
            when 'spo2' then coalesce(m.spo2_quality,m.quality)='good' and m.spo2 is not null
            when 'temperature' then coalesce(m.temperature_quality,m.quality)='good' and m.sensor_temperature is not null
          end
        order by m.measured_at desc,m.id desc
        limit v_rule.normal_resolution_count
      ) recent;

      if coalesce(v_normal_confirmed,false) then
        update public.care_alerts set status='resolved' where id=v_open_alert.id;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function private.analyze_carelink_measurement(bigint) from public,anon,authenticated;
grant execute on function private.analyze_carelink_measurement(bigint) to service_role;

create or replace function public.ingest_carelink_measurements(
 p_device_identifier text,p_device_credential text,p_firmware_version text,p_measurements jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_device_id uuid; v_hash text; v_item jsonb; v_inserted int:=0; v_duplicates int:=0; v_rows int;
 v_hr_quality text; v_spo2_quality text; v_temp_quality text; v_measurement_id bigint;
 v_inserted_ids bigint[]:=array[]::bigint[];
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
      or (v_item->>'measured_at')::timestamptz > now()+interval '5 minutes'
      or (v_item ? 'confirmed_fall' and jsonb_typeof(v_item->'confirmed_fall')<>'boolean') then
      return jsonb_build_object('ok',false,'invalid_payload',true);
   end if;
   v_hr_quality:=coalesce(v_item->>'heart_rate_quality',case when v_item->>'heart_rate' is null then 'missing' else coalesce(v_item->>'quality','missing') end);
   v_spo2_quality:=coalesce(v_item->>'spo2_quality',case when v_item->>'spo2' is null then 'missing' else coalesce(v_item->>'quality','missing') end);
   v_temp_quality:=coalesce(v_item->>'temperature_quality',case when v_item->>'sensor_temperature' is null then 'missing' else coalesce(v_item->>'quality','missing') end);
   if v_hr_quality not in ('good','unstable','missing') or v_spo2_quality not in ('good','unstable','missing') or v_temp_quality not in ('good','unstable','missing')
      or ((v_item->>'heart_rate' is null) <> (v_hr_quality='missing'))
      or ((v_item->>'spo2' is null) <> (v_spo2_quality='missing'))
      or ((v_item->>'sensor_temperature' is null) <> (v_temp_quality='missing')) then
      return jsonb_build_object('ok',false,'invalid_payload',true);
   end if;
   v_measurement_id:=null;
   insert into public.device_measurements(device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,latitude,longitude,gps_fix_at,quality,battery_percent,heart_rate_quality,spo2_quality,temperature_quality,confirmed_fall)
   values(v_device_id,v_item->>'message_id',(v_item->>'measured_at')::timestamptz,
     round((v_item->>'heart_rate')::numeric)::smallint,(v_item->>'spo2')::numeric,(v_item->>'sensor_temperature')::numeric,
     (v_item->>'movement')::numeric,(v_item->>'latitude')::numeric,(v_item->>'longitude')::numeric,
     (v_item->>'gps_fix_at')::timestamptz,coalesce(v_item->>'quality','missing'),(v_item->>'battery_percent')::numeric,
     v_hr_quality,v_spo2_quality,v_temp_quality,coalesce((v_item->>'confirmed_fall')::boolean,false))
   on conflict(device_id,message_id) do nothing returning id into v_measurement_id;
   get diagnostics v_rows=row_count;
   if v_rows=1 then
     v_inserted:=v_inserted+1;
     v_inserted_ids:=array_append(v_inserted_ids,v_measurement_id);
   else v_duplicates:=v_duplicates+1; end if;
 end loop;
 for v_measurement_id in
   select m.id from public.device_measurements m
   where m.id=any(v_inserted_ids) order by m.measured_at,m.id
 loop
   perform private.analyze_carelink_measurement(v_measurement_id);
 end loop;
 update public.devices set last_contact_at=now(),firmware_version=nullif(left(btrim(p_firmware_version),40),'') where id=v_device_id;
 return jsonb_build_object('ok',true,'inserted',v_inserted,'duplicates',v_duplicates);
exception when others then
 return jsonb_build_object('ok',false,'invalid_payload',true);
end $$;

revoke all on function public.ingest_carelink_measurements(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_carelink_measurements(text,text,text,jsonb) to service_role;
