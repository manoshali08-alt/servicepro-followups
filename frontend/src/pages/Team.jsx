import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../App.jsx'

export default function Team() {
  const { user, reloadMeta } = useApp()
  const [users, setUsers] = useState([])
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'staff' })
  const [msg, setMsg] = useState(null)
  const load = useCallback(() => api('/users').then(setUsers).catch((e) => setMsg({ t: 'error', m: e.message })), [])
  useEffect(() => { load() }, [load])
  const on = (e) => setF((x) => ({ ...x, [e.target.name]: e.target.value }))
  const create = async (e) => {
    e.preventDefault(); setMsg(null)
    try { await api('/users', { method: 'POST', body: f }); setF({ name: '', email: '', password: '', role: 'staff' }); setMsg({ t: 'ok', m: 'User created.' }); load(); reloadMeta() }
    catch (ex) { setMsg({ t: 'error', m: ex.message }) }
  }
  const toggle = async (id) => { try { await api(`/users/${id}/toggle`, { method: 'POST' }); load(); reloadMeta() } catch (ex) { setMsg({ t: 'error', m: ex.message }) } }
  return (<>
    <h1>Team</h1>{msg && <div className={'flash ' + msg.t}>{msg.m}</div>}
    <div className="scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th></th></tr></thead><tbody>
      {users.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.active ? 'Yes' : 'No'}</td>
        <td>{u.id !== user.id && <button className="link" onClick={() => toggle(u.id)}>{u.active ? 'Deactivate' : 'Reactivate'}</button>}</td></tr>)}
    </tbody></table></div>
    <div className="card narrow top"><h2>Add team member</h2><form onSubmit={create}>
      <label>Name<input name="name" value={f.name} onChange={on} required /></label>
      <label>Email<input type="email" name="email" value={f.email} onChange={on} required /></label>
      <label>Temporary password (min 10 characters)<input type="password" name="password" value={f.password} onChange={on} minLength={10} required autoComplete="new-password" /></label>
      <label>Role<select name="role" value={f.role} onChange={on}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
      <button className="btn">Create user</button></form></div>
    <div className="card narrow top" style={{ borderColor: 'var(--bad)' }}>
      <h2 style={{ color: 'var(--bad)', margin: '0 0 0.5rem 0' }}>Database Management</h2>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Delete all customer leads, follow-up history, and import records to start fresh. Admin accounts will not be deleted.
      </p>
      <button
        type="button"
        className="btn danger"
        onClick={async () => {
          if (!window.confirm('⚠️ WARNING: Are you sure you want to delete ALL customer and follow-up data? This action cannot be undone.')) return
          try {
            const r = await api('/admin/clear-data', { method: 'POST' })
            setMsg({ t: 'ok', m: r.message })
          } catch (e) {
            setMsg({ t: 'error', m: e.message })
          }
        }}
      >
        🗑️ Clear All Customer Data
      </button>
    </div>
  </>)
}
