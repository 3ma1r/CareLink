/* global process, console, fetch */
import { randomUUID } from 'node:crypto';import { readFile,writeFile } from 'node:fs/promises'
const endpoint=process.env.CARELINK_INGEST_URL,id=process.env.CARELINK_DEVICE_ID,credential=process.env.CARELINK_DEVICE_CREDENTIAL
if(!endpoint||!id||!credential){console.error('Set CARELINK_INGEST_URL, CARELINK_DEVICE_ID and CARELINK_DEVICE_CREDENTIAL.');process.exit(2)}
const args=new Set(process.argv.slice(2)),cache='.carelink-simulator-message.json'
function reading(i=0){const missing=args.has('--missing');const gps=args.has('--gps');const t=new Date(Date.now()-i*60000).toISOString();return{message_id:randomUUID(),measured_at:t,heart_rate:missing?null:72+i,spo2:missing?null:97,sensor_temperature:missing?null:34.2,movement:missing?null:18,quality:missing?'missing':args.has('--unstable')?'unstable':'good',...(gps?{latitude:23.588,longitude:58.4059,gps_fix_at:t}:{})}}
let measurements
if(args.has('--resend')){try{measurements=JSON.parse(await readFile(cache,'utf8'))}catch{console.error('No previous message to resend.');process.exit(2)}}else{measurements=Array.from({length:args.has('--batch')?3:1},(_,i)=>reading(i));await writeFile(cache,JSON.stringify(measurements))}
const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-carelink-device-id':id,authorization:`Device ${credential}`},body:JSON.stringify({firmware_version:process.env.CARELINK_FIRMWARE_VERSION||'simulator-1',measurements})})
let result={};try{result=await response.json()}catch{result={error:'Invalid server response'}}
console.log(`Upload status ${response.status}: inserted=${result.inserted??0}, duplicates=${result.duplicates??0}${result.error?`, error=${result.error}`:''}`)
if(!response.ok)process.exit(1)
