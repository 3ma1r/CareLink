-- Hosted/local integration test. All generated secrets and records stay inside this rolled-back transaction.
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','33333333-3333-4333-8333-333333333333','authenticated','authenticated','stage3-one@example.invalid','',now(),'{}','{"full_name":"Stage Three One"}',now(),now()),
('00000000-0000-0000-0000-000000000000','44444444-4444-4444-8444-444444444444','authenticated','authenticated','stage3-two@example.invalid','',now(),'{}','{"full_name":"Stage Three Two"}',now(),now());
insert into public.patients(caregiver_id,full_name,date_of_birth) values
('33333333-3333-4333-8333-333333333333','Test Patient One','1950-01-01'),
('44444444-4444-4444-8444-444444444444','Test Patient Two','1951-01-01');

create temporary table stage3_secrets(device_identifier text,device_credential text,pairing_code text) on commit drop;
insert into stage3_secrets select device_identifier,device_credential,pairing_code from public.provision_carelink_device('RLS Test Band','CL-TEST',30);

do $$ declare s record;r jsonb;t timestamptz;begin
 select * into s from stage3_secrets;
 r:=public.pair_carelink_device('33333333-3333-4333-8333-333333333333',s.device_identifier,'WRONGCODE');
 if (r->>'ok')::boolean then raise exception 'wrong code paired';end if;
 r:=public.pair_carelink_device('33333333-3333-4333-8333-333333333333',s.device_identifier,s.pairing_code);
 if not (r->>'ok')::boolean or r ? 'pairing_code' or r ? 'device_credential' then raise exception 'pairing response unsafe';end if;
 r:=public.pair_carelink_device('44444444-4444-4444-8444-444444444444',s.device_identifier,s.pairing_code);
 if (r->>'ok')::boolean then raise exception 'consumed code reused';end if;
 r:=public.ingest_carelink_measurements(s.device_identifier,s.device_credential,'test-1',jsonb_build_array(jsonb_build_object('message_id','message-stage3-0001','measured_at',now()-interval '1 minute','heart_rate',null,'spo2',97,'quality','unstable')));
 if (r->>'inserted')::int<>1 then raise exception 'first ingest failed';end if;
 r:=public.ingest_carelink_measurements(s.device_identifier,s.device_credential,'test-1',jsonb_build_array(jsonb_build_object('message_id','message-stage3-0002','measured_at',now()-interval '1 minute','heart_rate',72.5,'spo2',97,'quality','good')));
 if (r->>'inserted')::int<>1 then raise exception 'fractional heart-rate ingest failed';end if;
 if (select heart_rate from public.device_measurements m join public.devices d on d.id=m.device_id where d.device_identifier=s.device_identifier and m.message_id='message-stage3-0002')<>73 then raise exception 'fractional heart-rate rounding failed';end if;
 r:=public.ingest_carelink_measurements(s.device_identifier,s.device_credential,'test-1',jsonb_build_array(jsonb_build_object('message_id','message-stage3-0003','measured_at',now()-interval '1 minute','heart_rate',89.6,'spo2',97,'sensor_temperature',null,'quality','unstable','heart_rate_quality','unstable','spo2_quality','good','temperature_quality','missing')));
 if (r->>'inserted')::int<>1 then raise exception 'independent quality ingest failed';end if;
 if not exists(select 1 from public.device_measurements m join public.devices d on d.id=m.device_id where d.device_identifier=s.device_identifier and m.message_id='message-stage3-0003' and m.heart_rate=90 and m.spo2=97 and m.sensor_temperature is null and m.heart_rate_quality='unstable' and m.spo2_quality='good' and m.temperature_quality='missing') then raise exception 'independent quality was not stored';end if;
 select last_contact_at into t from public.devices where device_identifier=s.device_identifier;
 r:=public.ingest_carelink_measurements(s.device_identifier,s.device_credential,'test-1',jsonb_build_array(jsonb_build_object('message_id','message-stage3-0001','measured_at',now()-interval '1 minute','heart_rate',null,'spo2',97,'quality','unstable')));
 if (r->>'duplicates')::int<>1 or (select count(*) from public.device_measurements m join public.devices d on d.id=m.device_id where d.device_identifier=s.device_identifier)<>3 then raise exception 'deduplication failed';end if;
 r:=public.ingest_carelink_measurements(s.device_identifier,'incorrect-credential','test-1','[]');
 if (r->>'ok')::boolean then raise exception 'incorrect credential accepted';end if;
 if (select heart_rate is not null from public.device_measurements m join public.devices d on d.id=m.device_id where d.device_identifier=s.device_identifier and m.message_id='message-stage3-0001') then raise exception 'null became non-null';end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
 if (select count(*) from public.devices)<>1 or (select count(*) from public.device_measurements)<>3 then raise exception 'owner reads failed';end if;
 begin insert into public.device_measurements(device_id,message_id,measured_at) values(gen_random_uuid(),'blocked-message',now());raise exception 'browser insert succeeded';exception when insufficient_privilege then null;end;
 begin perform * from private.device_credentials;raise exception 'credential hashes readable';exception when insufficient_privilege then null;end;
 begin perform * from private.pairing_codes;raise exception 'pairing hashes readable';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$ begin if (select count(*) from public.devices)<>0 or (select count(*) from public.device_measurements)<>0 then raise exception 'cross-caregiver read succeeded';end if;end $$;
reset role;
set local role anon;
do $$ begin begin perform * from public.devices;raise exception 'anon read succeeded';exception when insufficient_privilege then null;end;end $$;
reset role;

do $$ declare s record;d uuid;begin select * into s from stage3_secrets;select id into d from public.devices where device_identifier=s.device_identifier;if not public.unpair_carelink_device('33333333-3333-4333-8333-333333333333',d) then raise exception 'unpair failed';end if;if exists(select 1 from private.device_credentials where device_id=d and revoked_at is null) then raise exception 'credential not revoked';end if;if (select count(*) from public.device_measurements where device_id=d)<>3 then raise exception 'history deleted';end if;end $$;
rollback;
