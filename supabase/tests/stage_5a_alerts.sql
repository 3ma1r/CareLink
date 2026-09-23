-- Stage 5A integration/security tests. All records and generated credentials are rolled back.
begin;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','55555555-5555-4555-8555-555555555555','authenticated','authenticated','stage5-owner@example.invalid','',now(),'{}','{"full_name":"Stage Five Owner"}',now(),now()),
('00000000-0000-0000-0000-000000000000','66666666-6666-4666-8666-666666666666','authenticated','authenticated','stage5-other@example.invalid','',now(),'{}','{"full_name":"Stage Five Other"}',now(),now());

insert into public.patients(caregiver_id,full_name,date_of_birth) values
('55555555-5555-4555-8555-555555555555','Stage Five Patient','1950-01-01'),
('66666666-6666-4666-8666-666666666666','Other Patient','1951-01-01');

create temporary table stage5_context(
  device_identifier text,device_credential text,patient_id uuid,device_id uuid,base_at timestamptz
) on commit drop;

create temporary table stage5_provisioned on commit drop as
select * from public.provision_carelink_device('Stage 5A Test Band','CL-TEST',30);

do $$ declare p stage5_provisioned; result jsonb; begin
  select * into p from stage5_provisioned;
  result:=public.pair_carelink_device(
    '55555555-5555-4555-8555-555555555555',p.device_identifier,p.pairing_code
  );
  if not (result->>'ok')::boolean then raise exception 'test device pairing failed'; end if;
end $$;

insert into stage5_context
select p.device_identifier,p.device_credential,pt.id,d.id,date_trunc('minute',now())-interval '20 days'
from stage5_provisioned p
join public.patients pt on pt.caregiver_id='55555555-5555-4555-8555-555555555555'
join public.devices d on d.device_identifier=p.device_identifier;

create function pg_temp.stage5_ingest(
  p_message_id text,p_at timestamptz,p_hr numeric,p_spo2 numeric,p_temp numeric,
  p_hr_quality text,p_spo2_quality text,p_temp_quality text,p_fall boolean default false,
  p_legacy boolean default false
) returns jsonb language plpgsql as $$
declare c stage5_context; payload jsonb; row_quality text;
begin
  select * into c from stage5_context;
  row_quality:=case
    when p_hr_quality='missing' and p_spo2_quality='missing' and p_temp_quality='missing' then 'missing'
    when p_hr_quality='good' and p_spo2_quality='good' and p_temp_quality='good' then 'good'
    else 'unstable' end;
  payload:=jsonb_build_object(
    'message_id',p_message_id,'measured_at',p_at,'heart_rate',p_hr,'spo2',p_spo2,
    'sensor_temperature',p_temp,'movement',10,'quality',row_quality,'confirmed_fall',p_fall
  );
  if not p_legacy then
    payload:=payload||jsonb_build_object('heart_rate_quality',p_hr_quality,
      'spo2_quality',p_spo2_quality,'temperature_quality',p_temp_quality);
  end if;
  return public.ingest_carelink_measurements(c.device_identifier,c.device_credential,
    'stage5a-test',jsonb_build_array(payload));
end;
$$;

do $$
declare c stage5_context; t timestamptz; r jsonb; alert_id uuid; before_count bigint;
begin
  select * into c from stage5_context;

  -- 1. Two normal good HR readings create no alert.
  t:=c.base_at;
  perform pg_temp.stage5_ingest('s5-normal-hr-0001',t,72,97,36.5,'good','good','good');
  perform pg_temp.stage5_ingest('s5-normal-hr-0002',t+interval '1 minute',73,97,36.5,'good','good','good');
  if exists(select 1 from public.care_alerts) then raise exception 'normal HR created an alert'; end if;

  -- 2. Confirmed low HR.
  t:=t+interval '2 hours';
  r:=pg_temp.stage5_ingest('s5-low-hr-000001',t,49,97,36.5,'good','good','good');
  if (r->>'inserted')::int<>1 then raise exception 'first low HR ingest failed: %',r; end if;
  if exists(select 1 from public.care_alerts where rule_id='heart_rate_low') then raise exception 'isolated low HR alerted'; end if;
  r:=pg_temp.stage5_ingest('s5-low-hr-000002',t+interval '1 minute',48,97,36.5,'good','good','good');
  if (r->>'inserted')::int<>1 then raise exception 'second low HR ingest failed: %',r; end if;
  if (select count(*) from public.care_alerts where rule_id='heart_rate_low')<>1 then
    raise exception 'confirmed low HR missing; total alerts %, rules %',
      (select count(*) from public.care_alerts),
      (select coalesce(string_agg(rule_id,','),'none') from public.care_alerts);
  end if;

  -- Resolve low HR so later scenarios remain independent.
  perform pg_temp.stage5_ingest('s5-low-resolve-01',t+interval '2 minute',72,97,36.5,'good','good','good');
  perform pg_temp.stage5_ingest('s5-low-resolve-02',t+interval '3 minute',73,97,36.5,'good','good','good');

  -- 3. Confirmed high HR.
  t:=t+interval '2 hours';
  perform pg_temp.stage5_ingest('s5-high-hr-00001',t,121,97,36.5,'good','good','good');
  perform pg_temp.stage5_ingest('s5-high-hr-00002',t+interval '1 minute',125,97,36.5,'good','good','good');
  if (select count(*) from public.care_alerts where rule_id='heart_rate_high')<>1 then raise exception 'confirmed high HR missing'; end if;

  -- 4. Confirmed low SpO2.
  t:=t+interval '2 hours';
  perform pg_temp.stage5_ingest('s5-low-spo2-0001',t,72,89,36.5,'good','good','good');
  perform pg_temp.stage5_ingest('s5-low-spo2-0002',t+interval '1 minute',72,88,36.5,'good','good','good');
  if not exists(select 1 from public.care_alerts where rule_id='spo2_low' and severity='critical' and observed_value=88) then raise exception 'confirmed low SpO2 missing'; end if;

  -- 5. Confirmed low temperature.
  t:=t+interval '2 hours';
  perform pg_temp.stage5_ingest('s5-low-temp-0001',t,72,97,34.9,'good','good','good');
  perform pg_temp.stage5_ingest('s5-low-temp-0002',t+interval '1 minute',72,97,34.8,'good','good','good');
  if not exists(select 1 from public.care_alerts where rule_id='temperature_low' and severity='moderate') then raise exception 'confirmed low temperature missing'; end if;

  -- 6. Confirmed high temperature.
  t:=t+interval '2 hours';
  perform pg_temp.stage5_ingest('s5-high-temp-001',t,72,97,38.1,'good','good','good');
  perform pg_temp.stage5_ingest('s5-high-temp-002',t+interval '1 minute',72,97,39,'good','good','good');
  if not exists(select 1 from public.care_alerts where rule_id='temperature_high' and severity='high') then raise exception 'confirmed high temperature missing'; end if;

  -- 7 and 13. A confirmed fall alerts immediately and retrying its message is idempotent.
  t:=t+interval '2 hours';
  r:=pg_temp.stage5_ingest('s5-fall-event-001',t,72,97,36.5,'good','good','good',true);
  if (r->>'inserted')::int<>1 or (select count(*) from public.care_alerts where rule_id='confirmed_fall')<>1 then raise exception 'confirmed fall missing'; end if;
  r:=pg_temp.stage5_ingest('s5-fall-event-001',t,72,97,36.5,'good','good','good',true);
  if (r->>'duplicates')::int<>1 or (select count(*) from public.care_alerts where rule_id='confirmed_fall')<>1 then raise exception 'duplicate fall alert'; end if;

  -- 8-10. Unstable abnormal values never alert.
  t:=t+interval '2 hours';
  perform pg_temp.stage5_ingest('s5-unstable-0001',t,45,85,40,'unstable','unstable','unstable');
  perform pg_temp.stage5_ingest('s5-unstable-0002',t+interval '1 minute',44,84,41,'unstable','unstable','unstable');
  if exists(select 1 from public.care_alerts where source_measurement_id in (
    select id from public.device_measurements where message_id like 's5-unstable-%'
  )) then raise exception 'unstable metric created alert'; end if;

  -- 11. Missing/null values never alert.
  t:=t+interval '2 hours';
  perform pg_temp.stage5_ingest('s5-missing-00001',t,null,null,null,'missing','missing','missing');
  perform pg_temp.stage5_ingest('s5-missing-00002',t+interval '1 minute',null,null,null,'missing','missing','missing');
  if exists(select 1 from public.care_alerts where source_measurement_id in (
    select id from public.device_measurements where message_id like 's5-missing-%'
  )) then raise exception 'missing metric created alert'; end if;

  -- 12. Unstable HR does not block independently good abnormal SpO2.
  t:=t+interval '2 hours';
  perform pg_temp.stage5_ingest('s5-mixed-quality1',t,45,89,null,'unstable','good','missing');
  perform pg_temp.stage5_ingest('s5-mixed-quality2',t+interval '1 minute',44,88,null,'unstable','good','missing');
  if not exists(select 1 from public.care_alerts a join public.device_measurements m on m.id=a.source_measurement_id
    where a.rule_id='spo2_low' and m.message_id='s5-mixed-quality2') then raise exception 'good metric was blocked by unstable metric'; end if;
  if exists(select 1 from public.care_alerts a join public.device_measurements m on m.id=a.source_measurement_id
    where a.rule_id like 'heart_rate_%' and m.message_id like 's5-mixed-quality%') then raise exception 'unstable HR alerted in mixed-quality input'; end if;

  -- 14-15. Confirmation, continuation and cooldown suppress alert spam.
  t:=t+interval '2 hours';
  perform pg_temp.stage5_ingest('s5-repeat-low-001',t,48,97,36.5,'good','good','good');
  perform pg_temp.stage5_ingest('s5-repeat-low-002',t+interval '1 minute',47,97,36.5,'good','good','good');
  select a.id into alert_id from public.care_alerts a join public.device_measurements m on m.id=a.source_measurement_id
    where a.rule_id='heart_rate_low' and m.message_id='s5-repeat-low-002';
  perform pg_temp.stage5_ingest('s5-repeat-low-003',t+interval '2 minute',46,97,36.5,'good','good','good');
  if (select occurrence_count from public.care_alerts where id=alert_id)<>3
     or (select count(*) from public.care_alerts where rule_id='heart_rate_low' and status in ('active','acknowledged'))<>1 then
    raise exception 'continued condition spam/occurrence failure';
  end if;

  -- 16. Two later good normal readings resolve the vital alert.
  perform pg_temp.stage5_ingest('s5-repeat-normal01',t+interval '3 minute',72,97,36.5,'good','good','good');
  if (select status from public.care_alerts where id=alert_id)<>'active' then raise exception 'vital resolved after one normal reading'; end if;
  perform pg_temp.stage5_ingest('s5-repeat-normal02',t+interval '4 minute',73,97,36.5,'good','good','good');
  if (select status from public.care_alerts where id=alert_id)<>'resolved' then raise exception 'vital did not resolve after two normal readings'; end if;
  before_count:=(select count(*) from public.care_alerts where rule_id='heart_rate_low');
  perform pg_temp.stage5_ingest('s5-cooldown-low-1',t+interval '10 minute',48,97,36.5,'good','good','good');
  perform pg_temp.stage5_ingest('s5-cooldown-low-2',t+interval '11 minute',47,97,36.5,'good','good','good');
  if (select count(*) from public.care_alerts where rule_id='heart_rate_low')<>before_count then raise exception 'cooldown created duplicate alert'; end if;

  -- 17. Normal vital readings do not auto-resolve falls.
  perform pg_temp.stage5_ingest('s5-after-fall-n01',t+interval '12 minute',72,97,36.5,'good','good','good');
  perform pg_temp.stage5_ingest('s5-after-fall-n02',t+interval '13 minute',73,97,36.5,'good','good','good');
  if (select status from public.care_alerts where rule_id='confirmed_fall')<>'active' then raise exception 'fall auto-resolved'; end if;

  -- 22. A mixed, out-of-order five-reading batch is analyzed in measurement order.
  t:=t+interval '2 hours';
  select public.ingest_carelink_measurements(c.device_identifier,c.device_credential,'stage5a-test',jsonb_build_array(
    jsonb_build_object('message_id','s5-batch-0000005','measured_at',t+interval '4 minute','heart_rate',72,'spo2',97,'sensor_temperature',39,'quality','good','heart_rate_quality','good','spo2_quality','good','temperature_quality','good'),
    jsonb_build_object('message_id','s5-batch-0000001','measured_at',t,'heart_rate',72,'spo2',97,'sensor_temperature',36.5,'quality','good','heart_rate_quality','good','spo2_quality','good','temperature_quality','good'),
    jsonb_build_object('message_id','s5-batch-0000003','measured_at',t+interval '2 minute','heart_rate',45,'spo2',97,'sensor_temperature',36.5,'quality','unstable','heart_rate_quality','unstable','spo2_quality','good','temperature_quality','good'),
    jsonb_build_object('message_id','s5-batch-0000002','measured_at',t+interval '1 minute','heart_rate',73,'spo2',97,'sensor_temperature',36.5,'quality','good','heart_rate_quality','good','spo2_quality','good','temperature_quality','good'),
    jsonb_build_object('message_id','s5-batch-0000004','measured_at',t+interval '3 minute','heart_rate',72,'spo2',97,'sensor_temperature',38.5,'quality','good','heart_rate_quality','good','spo2_quality','good','temperature_quality','good')
  )) into r;
  if (r->>'inserted')::int<>5 or not exists(select 1 from public.care_alerts a join public.device_measurements m on m.id=a.source_measurement_id
    where a.rule_id='temperature_high' and m.message_id='s5-batch-0000005') then raise exception 'mixed batch analysis failed'; end if;

  -- 23. Legacy row-level quality still confirms alerts when per-metric fields are absent.
  t:=t+interval '2 hours';
  perform pg_temp.stage5_ingest('s5-legacy-low-001',t,48,97,36.5,'good','good','good',false,true);
  perform pg_temp.stage5_ingest('s5-legacy-low-002',t+interval '1 minute',47,97,36.5,'good','good','good',false,true);
  if not exists(select 1 from public.care_alerts a join public.device_measurements m on m.id=a.source_measurement_id
    where a.rule_id='heart_rate_low' and m.message_id='s5-legacy-low-002') then raise exception 'legacy quality fallback failed'; end if;

  -- Preserve one active fall for RLS/lifecycle checks.
  select id into alert_id from public.care_alerts where rule_id='confirmed_fall';
  update stage5_context set base_at=t,device_id=c.device_id;
  create temporary table stage5_alert_target(id uuid) on commit drop;
  insert into stage5_alert_target values(alert_id);
end;
$$;

grant select on stage5_alert_target,stage5_context to authenticated;

-- 18. Owner can read and acknowledge, and audit metadata is server-generated.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$ begin
  if (select count(*) from public.care_alerts)=0 then raise exception 'owner cannot read alerts'; end if;
  update public.care_alerts set status='acknowledged' where id=(select id from stage5_alert_target);
  if not exists(select 1 from public.care_alerts where id=(select id from stage5_alert_target)
    and status='acknowledged' and acknowledged_by='55555555-5555-4555-8555-555555555555' and acknowledged_at is not null)
  then raise exception 'owner acknowledgement metadata missing'; end if;
end $$;

-- 19. Another caregiver cannot read, acknowledge or modify the owner's alert.
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$ begin
  if (select count(*) from public.care_alerts)<>0 then raise exception 'cross-caregiver alert read succeeded'; end if;
  update public.care_alerts set status='resolved' where id=(select id from stage5_alert_target);
  if found then raise exception 'cross-caregiver alert update succeeded'; end if;
end $$;

-- 21. Browser roles cannot create alerts or modify generated fields.
do $$ begin
  begin
    insert into public.care_alerts(patient_id,device_id,source_measurement_id,rule_id,rule_version,alert_type,metric,severity,title,message,measurement_quality,threshold_metadata,measurement_at,first_triggered_at,last_seen_at)
    select patient_id,device_id,1,'forged',1,'fall','fall','critical','Forged','Forged','not_applicable','{}',now(),now(),now() from stage5_context;
    raise exception 'browser alert insert succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.care_alerts set title='Forged' where id=(select id from stage5_alert_target);
    raise exception 'browser changed generated alert content';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 20. Anonymous clients have no alert access.
set local role anon;
do $$ begin
  begin perform * from public.care_alerts; raise exception 'anonymous alert read succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 24 is covered by running the complete existing Stage 1-4 suite alongside this file.
rollback;
