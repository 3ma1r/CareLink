-- The Edge Function accepts finite heart-rate numbers, while the storage column
-- intentionally stores whole BPM. Convert accepted decimal JSON numbers through
-- numeric before rounding to smallint so an otherwise valid batch is not rejected.
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
     round((v_item->>'heart_rate')::numeric)::smallint,(v_item->>'spo2')::numeric,(v_item->>'sensor_temperature')::numeric,
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
