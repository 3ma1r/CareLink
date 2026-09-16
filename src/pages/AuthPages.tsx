import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Eye, EyeOff, Heart, WifiOff } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Brand, ThemeToggle } from '../components/UI'
import { useAuth } from '../auth/AuthProvider'
import { validateEmail, validatePassword } from '../auth/validation'

export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-shell"><header className="auth-header"><Brand /><ThemeToggle /></header><main className="auth-main">{children}</main><footer className="auth-footer">CareLink · Stage 2 prototype</footer></div>
}

function PasswordField({ id, label, value, onChange, error, autoComplete }: { id: string; label: string; value: string; onChange(value: string): void; error?: string; autoComplete: string }) {
  const [visible, setVisible] = useState(false)
  return <div className="field-group"><label htmlFor={id}>{label}</label><span className="password-wrap"><input id={id} type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} /><button type="button" className="password-toggle" onClick={() => setVisible(!visible)} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{error && <span id={`${id}-error`} className="field-error">{error}</span>}</div>
}

function AuthCard({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return <section className="auth-card card"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="auth-intro">{intro}</p>{children}</section>
}

export function Welcome() {
  return <AuthCard eyebrow="CAREGIVER MONITORING PROTOTYPE" title="Care, connected." intro="A calm place for caregivers to view an elderly patient’s CareLink updates."><div className="welcome-mark"><Heart size={36} aria-hidden="true" /><span>Account, patient details and paired wearable readings are protected with Supabase.</span></div><div className="auth-actions"><Link className="button primary" to="/sign-in">Sign in</Link><Link className="button secondary" to="/register">Create account</Link></div></AuthCard>
}

export function SignIn() {
  const auth = useAuth(); const navigate = useNavigate(); const location = useLocation()
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [errors, setErrors] = useState<Record<string,string>>({}); const [busy, setBusy] = useState(false); const [server, setServer] = useState('')
  async function submit(e: FormEvent) { e.preventDefault(); const next: Record<string,string> = {}; if (!validateEmail(email)) next.email = 'Enter a valid email address.'; if (!password) next.password = 'Enter your password.'; setErrors(next); if (Object.keys(next).length) return; setBusy(true); setServer(''); const result = await auth.signIn(email,password); setBusy(false); if (result.error) setServer(result.error); else navigate((location.state as { from?: string } | null)?.from ?? '/', { replace:true }) }
  return <AuthCard eyebrow="WELCOME BACK" title="Sign in to CareLink" intro="Use your caregiver account to continue."><form className="auth-form" onSubmit={submit} noValidate><label htmlFor="signin-email">Email<input id="signin-email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email?'signin-email-error':undefined}/>{errors.email&&<span id="signin-email-error" className="field-error">{errors.email}</span>}</label><PasswordField id="signin-password" label="Password" value={password} onChange={setPassword} error={errors.password} autoComplete="current-password"/><Link className="form-link" to="/forgot-password">Forgot password?</Link>{server&&<p className="form-error" role="alert">{server}</p>}<button className="button primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form><p className="auth-switch">New to CareLink? <Link to="/register">Create an account</Link></p></AuthCard>
}

export function Register() {
  const auth=useAuth(); const [values,setValues]=useState({name:'',email:'',password:'',confirm:''}); const [errors,setErrors]=useState<Record<string,string>>({}); const [busy,setBusy]=useState(false); const [server,setServer]=useState(''); const [checkEmail,setCheckEmail]=useState(false)
  async function submit(e:FormEvent){e.preventDefault();const next:Record<string,string>={};if(!values.name.trim())next.name='Enter your full name.';else if(values.name.trim().length>100)next.name='Use 100 characters or fewer.';if(!validateEmail(values.email))next.email='Enter a valid email address.';if(!validatePassword(values.password))next.password='Use at least 8 characters.';if(values.confirm!==values.password)next.confirm='Passwords do not match.';setErrors(next);if(Object.keys(next).length)return;setBusy(true);setServer('');const result=await auth.register(values.name,values.email,values.password);setBusy(false);if(result.error)setServer(result.error);else setCheckEmail(result.confirmationRequired)}
  if(checkEmail)return <AuthCard eyebrow="ONE MORE STEP" title="Check your email" intro={`We sent a confirmation link to ${values.email}. Open it to finish creating your account.`}><p className="auth-notice" role="status">CareLink will only sign you in after Supabase confirms a valid session.</p><Link className="button secondary" to="/sign-in">Back to sign in</Link></AuthCard>
  const set=(key:keyof typeof values,value:string)=>setValues({...values,[key]:value})
  return <AuthCard eyebrow="CREATE CAREGIVER ACCOUNT" title="Begin your care circle" intro="We only need the details required for your account."><form className="auth-form" onSubmit={submit} noValidate><label htmlFor="register-name">Full name<input id="register-name" value={values.name} onChange={(e)=>set('name',e.target.value)} maxLength={100} autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name?'register-name-error':undefined}/>{errors.name&&<span id="register-name-error" className="field-error">{errors.name}</span>}</label><label htmlFor="register-email">Email<input id="register-email" type="email" value={values.email} onChange={(e)=>set('email',e.target.value)} autoComplete="email" aria-invalid={!!errors.email}/>{errors.email&&<span className="field-error">{errors.email}</span>}</label><PasswordField id="register-password" label="Password" value={values.password} onChange={(v)=>set('password',v)} error={errors.password} autoComplete="new-password"/><PasswordField id="register-confirm" label="Confirm password" value={values.confirm} onChange={(v)=>set('confirm',v)} error={errors.confirm} autoComplete="new-password"/>{server&&<p className="form-error" role="alert">{server}</p>}<button className="button primary" disabled={busy}>{busy?'Creating account…':'Create account'}</button></form><p className="auth-switch">Already registered? <Link to="/sign-in">Sign in</Link></p></AuthCard>
}

export function ForgotPassword() {
  const auth=useAuth(); const [email,setEmail]=useState(''); const [error,setError]=useState(''); const [sent,setSent]=useState(false); const [busy,setBusy]=useState(false)
  async function submit(e:FormEvent){e.preventDefault();if(!validateEmail(email)){setError('Enter a valid email address.');return}setBusy(true);setError('');const result=await auth.requestReset(email);setBusy(false);if(result.error)setError(result.error);else setSent(true)}
  return <AuthCard eyebrow="PASSWORD HELP" title="Reset your password" intro="Enter your caregiver email and we’ll send a secure reset link.">{sent?<><p className="auth-notice" role="status">If an account exists for that email, a reset link is on its way.</p><Link className="button secondary" to="/sign-in">Back to sign in</Link></>:<form className="auth-form" onSubmit={submit} noValidate><label htmlFor="reset-email">Email<input id="reset-email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="email" aria-invalid={!!error}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'Sending…':'Send reset link'}</button></form>}</AuthCard>
}

export function ResetPassword() {
  const auth=useAuth();const navigate=useNavigate();const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false)
  async function submit(e:FormEvent){e.preventDefault();if(!validatePassword(password)){setError('Use at least 8 characters.');return}if(password!==confirm){setError('Passwords do not match.');return}setBusy(true);const result=await auth.updatePassword(password);setBusy(false);if(result.error)setError(result.error);else{setDone(true);setTimeout(()=>navigate('/',{replace:true}),800)}}
  if(auth.status!=='signed-in'&&!auth.recovery&&!auth.testMode)return <AuthCard eyebrow="RESET LINK" title="This link is no longer valid" intro="Request a new password-reset email and use its latest link."><Link className="button primary" to="/forgot-password">Request another link</Link></AuthCard>
  return <AuthCard eyebrow="SECURE YOUR ACCOUNT" title="Choose a new password" intro="Use at least eight characters."><form className="auth-form" onSubmit={submit}><PasswordField id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password"/><PasswordField id="new-password-confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password"/>{error&&<p className="form-error" role="alert">{error}</p>}{done&&<p className="auth-notice" role="status">Password updated. Returning to CareLink…</p>}<button className="button primary" disabled={busy||done}>{busy?'Updating…':'Update password'}</button></form></AuthCard>
}

export function AuthStatusScreen() {
  const auth=useAuth()
  if(auth.status==='loading')return <AuthLayout><div className="auth-status" role="status"><span className="loading-ring"/>Securing your CareLink session…</div></AuthLayout>
  if(auth.status==='configured-error')return <AuthLayout><AuthCard eyebrow="DEVELOPMENT CONFIGURATION" title="Supabase setup needed" intro={auth.error??'The application is missing its Supabase configuration.'}><p className="auth-notice">Copy .env.example to .env and add the CareLink project URL and publishable key. Never use a service-role key here.</p></AuthCard></AuthLayout>
  return <AuthLayout><AuthCard eyebrow="OFFLINE" title="Connect to verify your session" intro="The cached CareLink shell cannot prove who you are."><div className="welcome-mark"><WifiOff/><span>Reconnect before viewing account or patient information.</span></div><button className="button primary" onClick={()=>void auth.retry()}>Try again</button></AuthCard></AuthLayout>
}

export function PublicOnly({children}:{children:ReactNode}) { const auth=useAuth(); if(auth.status==='loading'||auth.status==='configured-error'||auth.status==='offline')return <AuthStatusScreen/>; if(auth.status==='signed-in')return <Navigate to={auth.patient?'/':'/patient-setup'} replace/>; return <AuthLayout>{children}</AuthLayout> }
