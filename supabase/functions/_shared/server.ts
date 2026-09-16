import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { corsHeadersForOrigin } from './cors.ts'

function namedKey(name: string, fallback: string) {
  const raw = Deno.env.get(name)
  if (raw) {
    try { return JSON.parse(raw).default as string } catch { /* legacy single-key env */ }
  }
  return Deno.env.get(fallback) ?? ''
}

export function clients(authHeader?: string) {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const publishable = namedKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY')
  const secret = namedKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY')
  return {
    user: createClient(url,publishable,{global:{headers:authHeader?{Authorization:authHeader}:{}}}),
    admin: createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),
  }
}

export function json(body: unknown, status=200, headers: Record<string,string>={}) {
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}})
}

export function cors(req: Request) {
  return corsHeadersForOrigin(req.headers.get('origin'), Deno.env.get('ALLOWED_ORIGIN'))
}
