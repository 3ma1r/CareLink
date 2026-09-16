/* global process, console */
import { createClient } from '@supabase/supabase-js'
const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY
if(!url||!secret){console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.provisioning.local');process.exit(2)}
const client=createClient(url,secret,{auth:{persistSession:false}})
const {data,error}=await client.rpc('provision_carelink_device',{p_display_name:process.env.DEVICE_DISPLAY_NAME||'CareLink Test Band',p_device_model:process.env.DEVICE_MODEL||'CL-BAND-DEV',p_pairing_minutes:Number(process.env.PAIRING_CODE_MINUTES||30)})
if(error||!data?.[0]){console.error('Provisioning failed. No secrets were written.');process.exit(1)}
const device=data[0]
console.log('Provisioned device. Store these values securely; the credential and code are shown once.')
console.log(`Device ID: ${device.device_identifier}`)
console.log(`Device credential: ${device.device_credential}`)
console.log(`Pairing code: ${device.pairing_code}`)
console.log(`Pairing code expires: ${device.expires_at}`)
