-- CareLink AI Part 1 synthetic database, lifecycle, privilege and RLS tests.
-- Every fixture row is rolled back.
begin;

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000001','authenticated','authenticated',
   'ai-part1-owner@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000002','authenticated','authenticated',
   'ai-part1-other@example.invalid','',now(),'{}','{}',now(),now());

insert into public.patients(id,caregiver_id,full_name,date_of_birth) values
  ('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','AI Fixture Owner','1950-01-01'),
  ('a1000000-0000-4000-8000-000000000012','a1000000-0000-4000-8000-000000000002','AI Fixture Other','1951-01-01');

insert into public.devices(
  id,device_identifier,display_name,device_model,paired_patient_id,paired_at
) values
  ('a1000000-0000-4000-8000-000000000021','CL-AIPART100001','AI fixture band','CL-TEST',
   'a1000000-0000-4000-8000-000000000011',now()),
  ('a1000000-0000-4000-8000-000000000022','CL-AIPART100002','Other fixture band','CL-TEST',
   'a1000000-0000-4000-8000-000000000012',now());

create function pg_temp.ai_activation() returns timestamptz language sql stable as $$
  select activated_at from private.carelink_personalized_analysis_config where active
$$;

-- Twenty-nine HR samples and thirty samples for each other metric span more than
-- three UTC days. SpO2 contains one isolated outlier; temperature has zero MAD.
insert into public.device_measurements(
  device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,quality,
  heart_rate_quality,spo2_quality,temperature_quality,confirmed_fall,created_at
)
select
  'a1000000-0000-4000-8000-000000000021',
  'ai-base-'||lpad(series::text,3,'0'),
  statement_timestamp()-interval '7 days'+series*interval '4 hours',
  case when series=30 then null else 69+(series%3) end,
  case when series=1 then 70 else 97 end,
  36.5,0,'good',
  case when series=30 then 'missing' else 'good' end,'good','good',false,
  pg_temp.ai_activation()-interval '1 second'
from generate_series(1,30) series;

-- These rows must not enter any baseline: unstable, missing or outside the
-- versioned sensor-valid analysis ranges.
insert into public.device_measurements(
  device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,quality,
  heart_rate_quality,spo2_quality,temperature_quality,confirmed_fall,created_at
) values
  ('a1000000-0000-4000-8000-000000000021','ai-filter-001',statement_timestamp()-interval '30 hours',200,80,40,0,'unstable','unstable','unstable','unstable',false,pg_temp.ai_activation()-interval '1 second'),
  ('a1000000-0000-4000-8000-000000000021','ai-filter-002',statement_timestamp()-interval '29 hours',null,null,null,0,'missing','missing','missing','missing',false,pg_temp.ai_activation()-interval '1 second'),
  ('a1000000-0000-4000-8000-000000000021','ai-filter-003',statement_timestamp()-interval '28 hours',20,60,80,0,'good','good','good','good',false,pg_temp.ai_activation()-interval '1 second');

-- A resolved deterministic-alert period is explicitly excluded from baseline training.
insert into public.device_measurements(
  device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,quality,
  heart_rate_quality,spo2_quality,temperature_quality,confirmed_fall,created_at
) values
  ('a1000000-0000-4000-8000-000000000021','ai-alert-001',statement_timestamp()-interval '26 hours',null,null,40,0,'good','missing','missing','good',false,pg_temp.ai_activation()-interval '1 second'),
  ('a1000000-0000-4000-8000-000000000021','ai-alert-002',statement_timestamp()-interval '25 hours 55 minutes',null,null,40.2,0,'good','missing','missing','good',false,pg_temp.ai_activation()-interval '1 second');

insert into public.care_alerts(
  patient_id,device_id,source_measurement_id,rule_id,rule_version,alert_type,metric,severity,
  title,message,observed_value,unit,measurement_quality,threshold_metadata,measurement_at,
  first_triggered_at,last_seen_at,occurrence_count,status,resolved_at
) values (
  'a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000021',
  (select id from public.device_measurements where message_id='ai-alert-001'),
  'temperature_high',1,'vital','temperature','high','Fixture alert','Fixture only',40,'°C','good','{}',
  statement_timestamp()-interval '26 hours',statement_timestamp()-interval '26 hours',
  statement_timestamp()-interval '25 hours 55 minutes',2,'resolved',statement_timestamp()-interval '25 hours 50 minutes'
);

select private.refresh_carelink_personalized_baseline(
  'a1000000-0000-4000-8000-000000000021','a1000000-0000-4000-8000-000000000011',
  metric,statement_timestamp()
) from unnest(array['heart_rate','spo2','temperature']) metric;

do $$ begin
  if not exists(select 1 from public.personalized_baselines where device_id='a1000000-0000-4000-8000-000000000021' and metric='heart_rate' and readiness='learning' and sample_count=29) then
    raise exception 'heart-rate baseline ignored the independent minimum sample requirement';
  end if;
  if not exists(select 1 from public.personalized_baselines where device_id='a1000000-0000-4000-8000-000000000021' and metric='spo2' and readiness='ready' and sample_count=30 and baseline_median=97) then
    raise exception 'SpO2 readiness or single-outlier resistance failed';
  end if;
  if not exists(select 1 from public.personalized_baselines where device_id='a1000000-0000-4000-8000-000000000021' and metric='temperature' and readiness='ready' and sample_count=30 and median_absolute_deviation=0 and robust_scale=0.2) then
    raise exception 'temperature zero-MAD fallback or deterministic-alert exclusion failed';
  end if;
  if exists(select 1 from public.personalized_insights where device_id='a1000000-0000-4000-8000-000000000021') then
    raise exception 'historical insights were generated during readiness refresh';
  end if;
end $$;

-- A thirtieth historical HR value makes HR independently ready.
insert into public.device_measurements(
  device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,quality,
  heart_rate_quality,spo2_quality,temperature_quality,confirmed_fall,created_at
) values (
  'a1000000-0000-4000-8000-000000000021','ai-base-hr030',statement_timestamp()-interval '27 hours',
  70,null,null,0,'good','good','missing','missing',false,pg_temp.ai_activation()-interval '1 second'
);
select private.refresh_carelink_personalized_baseline(
  'a1000000-0000-4000-8000-000000000021','a1000000-0000-4000-8000-000000000011',
  'heart_rate',statement_timestamp()
);

-- Thirty readings in one short session are not sufficient despite their count.
insert into public.device_measurements(
  device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,quality,
  heart_rate_quality,spo2_quality,temperature_quality,confirmed_fall,created_at
)
select 'a1000000-0000-4000-8000-000000000022','ai-short-'||lpad(series::text,3,'0'),
  statement_timestamp()-interval '2 days'+series*interval '1 minute',70,97,36.5,0,'good',
  'good','good','good',false,pg_temp.ai_activation()-interval '1 second'
from generate_series(1,30) series;
select private.refresh_carelink_personalized_baseline(
  'a1000000-0000-4000-8000-000000000022','a1000000-0000-4000-8000-000000000012',
  metric,statement_timestamp()
) from unnest(array['heart_rate','spo2','temperature']) metric;

do $$ begin
  if not exists(select 1 from public.personalized_baselines where device_id='a1000000-0000-4000-8000-000000000021' and metric='heart_rate' and readiness='ready' and sample_count=30 and distinct_day_count>=3 and coverage_hours>=48) then
    raise exception 'heart-rate baseline did not become ready at all three requirements';
  end if;
  if exists(select 1 from public.personalized_baselines where device_id='a1000000-0000-4000-8000-000000000022' and readiness='ready') then
    raise exception 'one short session incorrectly became ready';
  end if;
end $$;

-- Three small HR shifts have a score above 3.5 but stay below the 10 bpm
-- absolute-deviation floor, so they must remain usual.
insert into public.device_measurements(
  device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,quality,
  heart_rate_quality,spo2_quality,temperature_quality,confirmed_fall
) values
  ('a1000000-0000-4000-8000-000000000021','ai-floor-001',statement_timestamp()-interval '60 minutes',78,null,null,0,'good','good','missing','missing',false),
  ('a1000000-0000-4000-8000-000000000021','ai-floor-002',statement_timestamp()-interval '55 minutes',78,null,null,0,'good','good','missing','missing',false),
  ('a1000000-0000-4000-8000-000000000021','ai-floor-003',statement_timestamp()-interval '50 minutes',78,null,null,0,'good','good','missing','missing',false);
select private.analyze_carelink_personalized_measurement(id)
from public.device_measurements where message_id like 'ai-floor-%' order by measured_at,id;

do $$ begin
  if exists(select 1 from public.personalized_insights where device_id='a1000000-0000-4000-8000-000000000021' and metric='heart_rate') then
    raise exception 'absolute-deviation safeguard did not suppress a tiny shift';
  end if;
  if not exists(select 1 from private.personalized_anomaly_evaluations where source_measurement_id=(select id from public.device_measurements where message_id='ai-floor-003') and metric='heart_rate' and result_state='usual' and robust_score>=3.5) then
    raise exception 'absolute-deviation floor fixture did not exercise a high statistical score';
  end if;
end $$;

-- Three repeated, directionally consistent readings create one higher HR and
-- one lower temperature insight while remaining inside fixed alert thresholds.
create temporary table ai_push_before(value bigint) on commit drop;
insert into ai_push_before select count(*) from private.push_notification_deliveries;
insert into public.device_measurements(
  device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,quality,
  heart_rate_quality,spo2_quality,temperature_quality,confirmed_fall
) values
  ('a1000000-0000-4000-8000-000000000021','ai-anomaly-001',statement_timestamp()-interval '12 minutes',95,null,35.5,0,'good','good','missing','good',false),
  ('a1000000-0000-4000-8000-000000000021','ai-anomaly-002',statement_timestamp()-interval '7 minutes',95,null,35.5,0,'good','good','missing','good',false),
  ('a1000000-0000-4000-8000-000000000021','ai-anomaly-003',statement_timestamp()-interval '2 minutes',95,null,35.5,0,'good','good','missing','good',false);

select private.analyze_carelink_personalized_measurement(id)
from public.device_measurements where message_id in ('ai-anomaly-001','ai-anomaly-002') order by measured_at,id;
do $$ begin
  if exists(select 1 from public.personalized_insights where device_id='a1000000-0000-4000-8000-000000000021' and metric in ('heart_rate','temperature')) then
    raise exception 'a single or two readings created an insight';
  end if;
end $$;
select private.analyze_carelink_personalized_measurement(
  (select id from public.device_measurements where message_id='ai-anomaly-003')
);

do $$ declare v_hr_occurrences integer;v_eval_count integer; begin
  if not exists(select 1 from public.personalized_insights where device_id='a1000000-0000-4000-8000-000000000021' and metric='heart_rate' and direction='higher' and status='active' and recent_sample_count=3) then
    raise exception 'repeated higher HR readings did not create one explainable insight';
  end if;
  if not exists(select 1 from public.personalized_insights where device_id='a1000000-0000-4000-8000-000000000021' and metric='temperature' and direction='lower' and status='active') then
    raise exception 'lower direction was not stored';
  end if;
  select occurrence_count into v_hr_occurrences from public.personalized_insights where device_id='a1000000-0000-4000-8000-000000000021' and metric='heart_rate' and status='active';
  select count(*) into v_eval_count from private.personalized_anomaly_evaluations where source_measurement_id=(select id from public.device_measurements where message_id='ai-anomaly-003');
  perform private.analyze_carelink_personalized_measurement((select id from public.device_measurements where message_id='ai-anomaly-003'));
  if v_hr_occurrences<>(select occurrence_count from public.personalized_insights where device_id='a1000000-0000-4000-8000-000000000021' and metric='heart_rate' and status='active')
     or v_eval_count<>(select count(*) from private.personalized_anomaly_evaluations where source_measurement_id=(select id from public.device_measurements where message_id='ai-anomaly-003')) then
    raise exception 'measurement reprocessing was not idempotent';
  end if;
  if (select count(*) from public.personalized_insights where device_id='a1000000-0000-4000-8000-000000000021' and metric='heart_rate' and status='active')<>1 then
    raise exception 'active insight uniqueness failed';
  end if;
  if (select count(*) from private.push_notification_deliveries)<>(select value from ai_push_before) then
    raise exception 'personalized insight enqueued a push notification';
  end if;
end $$;

-- Missing and unstable readings do not resolve the active HR insight.
insert into public.device_measurements(
  device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,quality,
  heart_rate_quality,spo2_quality,temperature_quality,confirmed_fall
) values
  ('a1000000-0000-4000-8000-000000000021','ai-recovery-bad1',statement_timestamp(),null,null,null,0,'missing','missing','missing','missing',false),
  ('a1000000-0000-4000-8000-000000000021','ai-recovery-bad2',statement_timestamp()+interval '1 minute',70,null,null,0,'unstable','unstable','missing','missing',false);
select private.analyze_carelink_personalized_measurement(id)
from public.device_measurements where message_id like 'ai-recovery-bad%' order by measured_at,id;

do $$ begin
  if not exists(select 1 from public.personalized_insights where device_id='a1000000-0000-4000-8000-000000000021' and metric='heart_rate' and status='active') then
    raise exception 'missing or unstable data resolved an insight';
  end if;
end $$;

-- Three later good readings close to baseline resolve the HR insight.
insert into public.device_measurements(
  device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,quality,
  heart_rate_quality,spo2_quality,temperature_quality,confirmed_fall
) values
  ('a1000000-0000-4000-8000-000000000021','ai-recovery-001',statement_timestamp()+interval '5 minutes',70,null,null,0,'good','good','missing','missing',false),
  ('a1000000-0000-4000-8000-000000000021','ai-recovery-002',statement_timestamp()+interval '10 minutes',71,null,null,0,'good','good','missing','missing',false),
  ('a1000000-0000-4000-8000-000000000021','ai-recovery-003',statement_timestamp()+interval '15 minutes',70,null,null,0,'good','good','missing','missing',false);
select private.analyze_carelink_personalized_measurement(id)
from public.device_measurements where message_id like 'ai-recovery-0%' order by measured_at,id;

do $$ begin
  if not exists(select 1 from public.personalized_insights where device_id='a1000000-0000-4000-8000-000000000021' and metric='heart_rate' and status='resolved' and resolved_at is not null) then
    raise exception 'three close good readings did not resolve the insight';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='personalized_insights_one_active_metric' and indexdef like 'CREATE UNIQUE INDEX%') then
    raise exception 'concurrent active-insight uniqueness is not constraint-backed';
  end if;
end $$;

-- Fixed deterministic alert behavior remains exactly unchanged.
do $$ begin
  if not exists(select 1 from private.care_alert_rule_definitions where rule_id='heart_rate_low' and threshold=50 and confirmation_count=2) or
     not exists(select 1 from private.care_alert_rule_definitions where rule_id='heart_rate_high' and threshold=120 and confirmation_count=2) or
     not exists(select 1 from private.care_alert_rule_definitions where rule_id='spo2_low' and threshold=90 and confirmation_count=2) or
     not exists(select 1 from private.care_alert_rule_definitions where rule_id='temperature_low' and threshold=35 and confirmation_count=2) or
     not exists(select 1 from private.care_alert_rule_definitions where rule_id='temperature_high' and threshold=38 and confirmation_count=2) then
    raise exception 'deterministic alert constants changed';
  end if;
end $$;

-- Browser roles can only select their own calculated rows and cannot forge them.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
do $$ begin
  if exists(select 1 from public.personalized_baselines where device_id='a1000000-0000-4000-8000-000000000022') then
    raise exception 'cross-caregiver baseline access succeeded';
  end if;
  if exists(select 1 from public.personalized_insights where patient_id='a1000000-0000-4000-8000-000000000012') then
    raise exception 'cross-caregiver insight access succeeded';
  end if;
  begin
    insert into public.personalized_baselines(patient_id,device_id,metric,readiness,sample_count,required_sample_count,distinct_day_count,required_day_count,coverage_hours,required_coverage_hours,baseline_excluded_before,algorithm_version)
    values('a1000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000021','heart_rate','ready',99,30,9,3,200,48,now(),'forged');
    raise exception 'browser forged a baseline';
  exception when insufficient_privilege then null; end;
  begin
    update public.personalized_insights set robust_score=999 where patient_id='a1000000-0000-4000-8000-000000000011';
    raise exception 'browser modified a calculated insight';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform * from public.personalized_baselines;raise exception 'anonymous baseline read succeeded';
  exception when insufficient_privilege then null;end;
  begin perform * from public.personalized_insights;raise exception 'anonymous insight read succeeded';
  exception when insufficient_privilege then null;end;
end $$;
reset role;

-- Internal analysis entry points and write access are unavailable to browser and service roles.
do $$ begin
  if has_function_privilege('authenticated','private.run_carelink_personalized_analysis(integer)','EXECUTE')
     or has_function_privilege('anon','private.run_carelink_personalized_analysis(integer)','EXECUTE')
     or has_function_privilege('service_role','private.run_carelink_personalized_analysis(integer)','EXECUTE') then
    raise exception 'internal scheduler function is executable by an API role';
  end if;
  if has_table_privilege('authenticated','public.personalized_insights','INSERT')
     or has_table_privilege('authenticated','public.personalized_insights','UPDATE')
     or has_table_privilege('service_role','public.personalized_insights','SELECT')
     or has_table_privilege('service_role','private.personalized_anomaly_evaluations','SELECT') then
    raise exception 'calculated insight privileges are broader than intended';
  end if;
  if not has_table_privilege('authenticated','public.personalized_insights','SELECT')
     or not has_table_privilege('authenticated','public.personalized_baselines','SELECT') then
    raise exception 'caregiver read privileges are missing';
  end if;
  if not exists(select 1 from cron.job where jobname='carelink-personalized-analysis'
    and command='select private.run_carelink_personalized_analysis(100);') then
    raise exception 'direct database analysis Cron job is missing';
  end if;
end $$;

rollback;
