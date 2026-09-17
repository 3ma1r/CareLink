-- Preserve each sensor's quality independently. Null columns identify historical
-- rows written before per-metric quality was available; clients fall back to the
-- legacy row-level quality for those records.
alter table public.device_measurements
  add column heart_rate_quality text,
  add column spo2_quality text,
  add column temperature_quality text;

alter table public.device_measurements
  add constraint device_measurements_heart_rate_quality_check check (
    heart_rate_quality is null or (
      heart_rate_quality in ('good','unstable','missing') and
      ((heart_rate is null) = (heart_rate_quality = 'missing'))
    )
  ),
  add constraint device_measurements_spo2_quality_check check (
    spo2_quality is null or (
      spo2_quality in ('good','unstable','missing') and
      ((spo2 is null) = (spo2_quality = 'missing'))
    )
  ),
  add constraint device_measurements_temperature_quality_check check (
    temperature_quality is null or (
      temperature_quality in ('good','unstable','missing') and
      ((sensor_temperature is null) = (temperature_quality = 'missing'))
    )
  );

create or replace function public.ingest_carelink_measurements(
 p_device_identifier text,p_device_credential text,p_firmware_version text,p_measurements jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_device_id uuid; v_hash text; v_item jsonb; v_inserted int:=0; v_duplicates int:=0; v_rows int;
 v_hr_quality text; v_spo2_quality text; v_temp_quality text;
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
   v_hr_quality:=coalesce(v_item->>'heart_rate_quality',case when v_item->>'heart_rate' is null then 'missing' else coalesce(v_item->>'quality','missing') end);
   v_spo2_quality:=coalesce(v_item->>'spo2_quality',case when v_item->>'spo2' is null then 'missing' else coalesce(v_item->>'quality','missing') end);
   v_temp_quality:=coalesce(v_item->>'temperature_quality',case when v_item->>'sensor_temperature' is null then 'missing' else coalesce(v_item->>'quality','missing') end);
   if v_hr_quality not in ('good','unstable','missing') or v_spo2_quality not in ('good','unstable','missing') or v_temp_quality not in ('good','unstable','missing')
      or ((v_item->>'heart_rate' is null) <> (v_hr_quality='missing'))
      or ((v_item->>'spo2' is null) <> (v_spo2_quality='missing'))
      or ((v_item->>'sensor_temperature' is null) <> (v_temp_quality='missing')) then
      return jsonb_build_object('ok',false,'invalid_payload',true);
   end if;
   insert into public.device_measurements(device_id,message_id,measured_at,heart_rate,spo2,sensor_temperature,movement,latitude,longitude,gps_fix_at,quality,battery_percent,heart_rate_quality,spo2_quality,temperature_quality)
   values(v_device_id,v_item->>'message_id',(v_item->>'measured_at')::timestamptz,
     round((v_item->>'heart_rate')::numeric)::smallint,(v_item->>'spo2')::numeric,(v_item->>'sensor_temperature')::numeric,
     (v_item->>'movement')::numeric,(v_item->>'latitude')::numeric,(v_item->>'longitude')::numeric,
     (v_item->>'gps_fix_at')::timestamptz,coalesce(v_item->>'quality','missing'),(v_item->>'battery_percent')::numeric,
     v_hr_quality,v_spo2_quality,v_temp_quality)
   on conflict(device_id,message_id) do nothing;
   get diagnostics v_rows=row_count;
   if v_rows=1 then v_inserted:=v_inserted+1; else v_duplicates:=v_duplicates+1; end if;
 end loop;
 update public.devices set last_contact_at=now(),firmware_version=nullif(left(btrim(p_firmware_version),40),'') where id=v_device_id;
 return jsonb_build_object('ok',true,'inserted',v_inserted,'duplicates',v_duplicates);
exception when others then
 return jsonb_build_object('ok',false,'invalid_payload',true);
end $$;

revoke all on function public.ingest_carelink_measurements(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_carelink_measurements(text,text,text,jsonb) to service_role;
