-- Stage 5B outbox, ownership, retry and invalidation tests. Everything is rolled back.
begin;

-- Keep the worker fixture isolated when production already has real delivery
-- rows. These temporary scheduling changes are held only inside this rollback.
create temporary table stage5b_preexisting_deliveries on commit drop as
select id from private.push_notification_deliveries;
update private.push_notification_deliveries delivery set
  next_attempt_at=greatest(delivery.next_attempt_at,now()+interval '1 day'),
  lease_expires_at=case when delivery.status='processing'
    then greatest(coalesce(delivery.lease_expires_at,now()),now()+interval '1 day')
    else delivery.lease_expires_at end
where delivery.id in (select id from stage5b_preexisting_deliveries);

-- The subscription Edge Function uses service_role after it validates the
-- caregiver JWT. Missing table grants make every status/register request fail.
do $$ begin
  if not has_table_privilege('service_role', 'public.push_subscriptions', 'SELECT') then
    raise exception 'service_role cannot read push subscriptions';
  end if;
  if not has_table_privilege('service_role', 'public.push_subscriptions', 'INSERT') then
    raise exception 'service_role cannot register push subscriptions';
  end if;
  if not has_table_privilege('service_role', 'public.push_subscriptions', 'UPDATE') then
    raise exception 'service_role cannot refresh push subscriptions';
  end if;
end $$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','77777777-7777-4777-8777-777777777777','authenticated','authenticated','stage5b-owner@example.invalid','',now(),'{}','{"full_name":"Stage 5B Owner"}',now(),now()),
('00000000-0000-0000-0000-000000000000','88888888-8888-4888-8888-888888888888','authenticated','authenticated','stage5b-other@example.invalid','',now(),'{}','{"full_name":"Stage 5B Other"}',now(),now());

insert into public.patients(id,caregiver_id,full_name,date_of_birth) values
('77777777-0000-4000-8000-000000000001','77777777-7777-4777-8777-777777777777','Stage 5B Patient','1950-01-01'),
('88888888-0000-4000-8000-000000000001','88888888-8888-4888-8888-888888888888','Other Patient','1951-01-01');

insert into public.devices(id,device_identifier,display_name,device_model,paired_patient_id,paired_at) values
('77777777-0000-4000-8000-000000000002','CL-STAGE5B00001','Stage 5B Band','CL-TEST','77777777-0000-4000-8000-000000000001',now());

insert into public.device_measurements(device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,quality,heart_rate_quality,spo2_quality,temperature_quality)
values ('77777777-0000-4000-8000-000000000002','stage5b-measurement-0001',now(),72,97,36.5,'good','good','good','good');

create function pg_temp.stage5b_alert(p_rule text) returns uuid language plpgsql as $$
declare created_id uuid;
begin
  insert into public.care_alerts(
    patient_id,device_id,source_measurement_id,rule_id,rule_version,alert_type,metric,severity,
    title,message,measurement_quality,threshold_metadata,measurement_at,first_triggered_at,last_seen_at
  ) values (
    '77777777-0000-4000-8000-000000000001','77777777-0000-4000-8000-000000000002',
    (select id from public.device_measurements where message_id='stage5b-measurement-0001'),
    p_rule,1,'fall','fall','critical','Test alert','Private alert detail','not_applicable','{}',now(),now(),now()
  ) returning id into created_id;
  return created_id;
end;
$$;

-- An alert that predates subscription registration is never backfilled.
select pg_temp.stage5b_alert('stage5b-before-subscription');
insert into public.push_subscriptions(caregiver_id,endpoint,p256dh,auth_key,device_label) values
('77777777-7777-4777-8777-777777777777','https://push.example/owner-one',repeat('A',65),repeat('B',22),'Owner phone'),
('77777777-7777-4777-8777-777777777777','https://push.example/owner-two',repeat('C',65),repeat('D',22),'Owner tablet'),
('88888888-8888-4888-8888-888888888888','https://push.example/other-one',repeat('E',65),repeat('F',22),'Other phone');

do $$ begin
  if exists(
    select 1 from private.push_notification_deliveries delivery
    join public.care_alerts alert on alert.id=delivery.alert_id
    where alert.rule_id='stage5b-before-subscription'
  ) then raise exception 'existing alert was backfilled'; end if;
  if exists(select 1 from information_schema.columns where table_schema='private' and table_name='push_notification_deliveries' and column_name='payload') then
    raise exception 'outbox stores a notification payload';
  end if;
end $$;

-- One genuinely new alert creates one row for each active subscription owned by its caregiver.
create temporary table stage5b_alerts(id uuid) on commit drop;
insert into stage5b_alerts values(pg_temp.stage5b_alert('stage5b-new-alert'));
grant select on stage5b_alerts to authenticated;
do $$ begin
  if (select count(*) from private.push_notification_deliveries where caregiver_id='77777777-7777-4777-8777-777777777777') <> 2 then raise exception 'new alert did not enqueue two owner devices'; end if;
  if exists(select 1 from private.push_notification_deliveries where caregiver_id='88888888-8888-4888-8888-888888888888') then
    raise exception 'cross-caregiver delivery was enqueued';
  end if;
end $$;

-- Occurrence updates, acknowledgement and resolution do not enqueue again.
update public.care_alerts set occurrence_count=occurrence_count+1,last_seen_at=now() where id=(select id from stage5b_alerts);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
update public.care_alerts set status='acknowledged' where id=(select id from stage5b_alerts);
update public.care_alerts set status='resolved' where id=(select id from stage5b_alerts);
reset role;
do $$ begin
  if (select count(*) from private.push_notification_deliveries where caregiver_id='77777777-7777-4777-8777-777777777777') <> 2 then raise exception 'alert update generated another delivery'; end if;
end $$;

-- Subscription RLS exposes only the signed-in caregiver's own rows.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 2 then raise exception 'owner cannot read own subscriptions'; end if;
end $$;
select set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 1 then raise exception 'cross-caregiver subscription read'; end if;
  delete from public.push_subscriptions where endpoint='https://push.example/owner-one';
  if found then raise exception 'cross-caregiver subscription delete'; end if;
end $$;
reset role;

-- Claims are leased once. Success completes one row; HTTP 410 permanently fails and revokes the endpoint.
create temporary table stage5b_claimed on commit drop as
select * from public.claim_carelink_push_deliveries('77777777-0000-4000-8000-000000000010',20);
do $$ declare first_row stage5b_claimed; second_row stage5b_claimed; begin
  if (select count(*) from stage5b_claimed) <> 2 then raise exception 'worker did not claim both deliveries'; end if;
  if exists(select 1 from public.claim_carelink_push_deliveries('77777777-0000-4000-8000-000000000011',20)) then
    raise exception 'leased delivery was claimed concurrently';
  end if;
  select * into first_row from stage5b_claimed order by delivery_id limit 1;
  select * into second_row from stage5b_claimed order by delivery_id desc limit 1;
  if not public.complete_carelink_push_delivery(first_row.delivery_id,'77777777-0000-4000-8000-000000000010','delivered',201,null) then
    raise exception 'successful delivery was not completed';
  end if;
  if not public.complete_carelink_push_delivery(second_row.delivery_id,'77777777-0000-4000-8000-000000000010','permanent_failure',410,'expired_endpoint') then
    raise exception 'expired delivery was not completed';
  end if;
  if exists(select 1 from public.push_subscriptions where id=second_row.subscription_id and active) then
    raise exception 'HTTP 410 did not deactivate subscription';
  end if;
end $$;

-- Only the remaining active owner device receives later alerts. Temporary failures back off and cap at five attempts.
insert into stage5b_alerts values(pg_temp.stage5b_alert('stage5b-retry-alert'));
do $$ begin
  if (select count(*) from private.push_notification_deliveries where alert_id=(select id from public.care_alerts where rule_id='stage5b-retry-alert')) <> 1 then
    raise exception 'inactive subscription received a later alert';
  end if;
end $$;

create temporary table stage5b_retry_claim on commit drop as
select * from public.claim_carelink_push_deliveries('77777777-0000-4000-8000-000000000020',20);
do $$ declare retry_row stage5b_retry_claim; begin
  select * into retry_row from stage5b_retry_claim limit 1;
  if not public.complete_carelink_push_delivery(retry_row.delivery_id,'77777777-0000-4000-8000-000000000020','retryable',503,'temporary') then
    raise exception 'temporary failure not recorded';
  end if;
  if not exists(select 1 from private.push_notification_deliveries where id=retry_row.delivery_id and status='retryable' and next_attempt_at>now()) then
    raise exception 'retry backoff missing';
  end if;
  update private.push_notification_deliveries set attempt_count=4,next_attempt_at=now()-interval '1 second' where id=retry_row.delivery_id;
end $$;

create temporary table stage5b_final_claim on commit drop as
select * from public.claim_carelink_push_deliveries('77777777-0000-4000-8000-000000000021',20);
do $$ declare final_row stage5b_final_claim; begin
  select * into final_row from stage5b_final_claim limit 1;
  if final_row.attempt_number<>5 then raise exception 'maximum attempt was not claimed'; end if;
  perform public.complete_carelink_push_delivery(final_row.delivery_id,'77777777-0000-4000-8000-000000000021','retryable',503,'temporary');
  if not exists(select 1 from private.push_notification_deliveries where id=final_row.delivery_id and status='permanent_failure' and last_error_category='max_attempts') then
    raise exception 'maximum retry was not made permanent';
  end if;
end $$;

-- A crash on the fifth claim is finalized after its lease expires rather than remaining stuck.
select pg_temp.stage5b_alert('stage5b-expired-final-lease');
create temporary table stage5b_crash_claim on commit drop as
select * from public.claim_carelink_push_deliveries('77777777-0000-4000-8000-000000000030',20);
do $$ declare crash_row stage5b_crash_claim; begin
  select * into crash_row from stage5b_crash_claim limit 1;
  update private.push_notification_deliveries
  set attempt_count=5,lease_expires_at=now()-interval '1 second'
  where id=crash_row.delivery_id;
  perform * from public.claim_carelink_push_deliveries('77777777-0000-4000-8000-000000000031',20);
  if not exists(select 1 from private.push_notification_deliveries where id=crash_row.delivery_id and status='permanent_failure' and last_error_category='max_attempts') then
    raise exception 'expired final lease remained stuck';
  end if;
end $$;

-- Anonymous clients have no subscription access.
set local role anon;
do $$ begin
  begin perform * from public.push_subscriptions; raise exception 'anonymous subscription read succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
