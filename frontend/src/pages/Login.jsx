import React, { useState } from 'react'
import { api, setCsrf } from '../api.js'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } })
      setCsrf(r.csrf)
      await onLogin()
    } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }
  return (
    <main><div className="card narrow"><h1>Sign in</h1>
      {err && <div className="flash error">{err}</div>}
      <form onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
        <button className="btn" disabled={busy}>Sign in</button>
      </form></div></main>
  )
}
