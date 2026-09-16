import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { clients, cors, json } from '../_shared/server.ts'

Deno.serve(async(req:Request)=>{
  const corsHeaders=cors(req)
  if(req.method==='OPTIONS') {
    if(!('Access-Control-Allow-Origin' in corsHeaders)) return json({error:'Origin not allowed'},403,corsHeaders)
    return new Response(null,{status:204,headers:{...corsHeaders,'Cache-Control':'no-store'}})
  }
  try {
    if(req.method!=='POST') return json({error:'Method not allowed'},405,corsHeaders)
    if(req.headers.get('content-type')?.split(';')[0]!=='application/json') return json({error:'JSON required'},415,corsHeaders)
    const authorization=req.headers.get('authorization')??''
    if(!authorization.startsWith('Bearer ')) return json({error:'Authentication required'},401,corsHeaders)
    const {user,admin}=clients(authorization)
    const verified=await user.auth.getUser()
    if(verified.error||!verified.data.user) return json({error:'Authentication required'},401,corsHeaders)
    let body:Record<string,unknown>
    try{body=await req.json()}catch{return json({error:'Invalid request'},400,corsHeaders)}
    if(body.action==='unpair'){
      if(typeof body.device_id!=='string') return json({error:'Invalid request'},400,corsHeaders)
      const result=await admin.rpc('unpair_carelink_device',{p_user_id:verified.data.user.id,p_device_id:body.device_id})
      if(result.error||!result.data) return json({error:'Unable to unpair wearable'},400,corsHeaders)
      return json({ok:true},200,corsHeaders)
    }
    if(typeof body.device_id!=='string'||typeof body.pairing_code!=='string'||body.device_id.length>40||body.pairing_code.length>40) return json({error:'Invalid pairing details'},400,corsHeaders)
    const result=await admin.rpc('pair_carelink_device',{p_user_id:verified.data.user.id,p_device_identifier:body.device_id,p_pairing_code:body.pairing_code})
    if(result.error||!result.data?.ok) return json({error:'Invalid pairing details'},400,corsHeaders)
    return json({ok:true,device_identifier:result.data.device_identifier},200,corsHeaders)
  } catch {
    return json({error:'Unable to process pairing request'},500,corsHeaders)
  }
})
