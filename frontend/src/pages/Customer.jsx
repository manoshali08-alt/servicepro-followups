import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, dmy } from '../api.js'
import { useApp } from '../App.jsx'

const blank = { phone: '', business_name: '', customer_name: '', trial_end_date: '', status: 'Not Contacted', feedback: '',
  next_followup_date: '', notes: '', assigned_to: '', last_contact_date: '', contact_method: '' }
const toForm = (c) => Object.fromEntries(Object.keys(blank).map((k) => [k, c[k] ?? '']))
const toBody = (f) => ({ ...f, assigned_to: f.assigned_to === '' ? null : Number(f.assigned_to) })

export default function Customer() {
  const { id } = useParams()
  const isNew = !id
  const { meta, user } = useApp()
  const nav = useNavigate()
  const [f, setF] = useState(blank)
  const [history, setHistory] = useState([])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const fu0 = { contact_date: meta.today, method: '', outcome: '', feedback: '', issue_type: '', issue: '', next_action: '', next_followup_date: '', status: '' }
  const [fu, setFu] = useState(fu0)

  const load = useCallback(async () => {
    if (isNew) return
    try {
      const r = await api('/customers/' + id)
      setF(toForm(r.customer)); setHistory(r.history); setFu((x) => ({ ...x, status: r.customer.status }))
    } catch (e) { setMsg({ t: 'error', m: e.message }) }
  }, [id, isNew])
  useEffect(() => { load() }, [load])

  const on = (setter) => (e) => setter((x) => ({ ...x, [e.target.name]: e.target.value }))

  const save = async (e) => {
    e.preventDefault(); setMsg(null); setBusy(true)
    try {
      if (isNew) { const r = await api('/customers', { method: 'POST', body: toBody(f) }); nav('/customers/' + r.id) }
      else { await api('/customers/' + id, { method: 'PUT', body: toBody(f) }); setMsg({ t: 'ok', m: 'Saved.' }); load() }
    } catch (ex) {
      if (ex.status === 409 && ex.detail && ex.detail.existing_id && isNew) nav('/customers/' + ex.detail.existing_id)
      else setMsg({ t: 'error', m: ex.message })
    } finally { setBusy(false) }
  }

  const addFollowup = async (e) => {
    e.preventDefault(); setMsg(null); setBusy(true)
    try {
      await api(`/customers/${id}/followups`, { method: 'POST', body: { ...fu, next_followup_date: fu.next_followup_date || null } })
      setFu({ ...fu0, status: fu.status }); setMsg({ t: 'ok', m: 'Follow-up saved.' }); load()
    } catch (ex) { setMsg({ t: 'error', m: ex.message }) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!window.confirm('Permanently delete this customer and their history?')) return
    try { await api('/customers/' + id, { method: 'DELETE' }); nav('/customers') } catch (ex) { setMsg({ t: 'error', m: ex.message }) }
  }

  const opts = (arr) => arr.map((o) => <option key={o}>{o}</option>)
  return (<>
    <p><Link to="/customers">← All customers</Link></p>
    <h1>{isNew ? 'Add customer' : f.business_name || f.customer_name || f.phone}</h1>
    {msg && <div className={'flash ' + msg.t}>{msg.m}</div>}
    <div className="grid2">
      <section className="card"><h2>Details</h2>
        <form onSubmit={save}>
          <label>Business name<input name="business_name" maxLength={200} value={f.business_name} onChange={on(setF)} /></label>
          <label>Customer name<input name="customer_name" maxLength={200} value={f.customer_name} onChange={on(setF)} /></label>
          <label>Phone *<input name="phone" required value={f.phone} onChange={on(setF)} placeholder="98765 43210 or +91…" /></label>
          <label>Status<select name="status" value={f.status} onChange={on(setF)}>{opts(meta.statuses)}</select></label>
          <label>Assigned to<select name="assigned_to" value={f.assigned_to} onChange={on(setF)}><option value="">Unassigned</option>
            {meta.staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <div className="two">
            <label>Trial end date<input type="date" name="trial_end_date" value={f.trial_end_date} onChange={on(setF)} /></label>
            <label>Next follow-up<input type="date" name="next_followup_date" value={f.next_followup_date} onChange={on(setF)} /></label></div>
          <div className="two">
            <label>Last contact date<input type="date" name="last_contact_date" value={f.last_contact_date} onChange={on(setF)} /></label>
            <label>Contact method<select name="contact_method" value={f.contact_method} onChange={on(setF)}><option value="">—</option>{opts(meta.methods)}</select></label></div>
          <label>Feedback / problem<textarea name="feedback" rows={3} value={f.feedback} onChange={on(setF)} /></label>
          <label>Notes<textarea name="notes" rows={3} value={f.notes} onChange={on(setF)} /></label>
          {!isNew && <p className="muted">Paid: <b>{f.status === 'Converted to Paid' ? 'Yes' : 'No'}</b> (set by status “Converted to Paid”)</p>}
          <button className="btn" disabled={busy}>{isNew ? 'Add customer' : 'Save changes'}</button>
        </form>
        {!isNew && user.role === 'admin' && <p className="top"><button className="btn danger" onClick={remove}>Delete customer</button></p>}
      </section>
      {!isNew && <section>
        <div className="card"><h2>Log a follow-up</h2>
          <form onSubmit={addFollowup}>
            <div className="two">
              <label>Contact date *<input type="date" name="contact_date" required value={fu.contact_date} onChange={on(setFu)} /></label>
              <label>Method<select name="method" value={fu.method} onChange={on(setFu)}><option value="">—</option>{opts(meta.methods)}</select></label></div>
            <label>Outcome<select name="outcome" value={fu.outcome} onChange={on(setFu)}><option value="">—</option>{opts(meta.outcomes)}</select></label>
            <label>Feedback<textarea name="feedback" rows={2} value={fu.feedback} onChange={on(setFu)} /></label>
            <div className="two">
              <label>Issue type<select name="issue_type" value={fu.issue_type} onChange={on(setFu)}><option value="">None</option>{opts(meta.issue_types)}</select></label>
              <label>Issue (short)<input name="issue" maxLength={200} value={fu.issue} onChange={on(setFu)} /></label></div>
            <label>Next action<input name="next_action" maxLength={300} value={fu.next_action} onChange={on(setFu)} /></label>
            <div className="two">
              <label>Next follow-up date<input type="date" name="next_followup_date" value={fu.next_followup_date} onChange={on(setFu)} /></label>
              <label>Set status<select name="status" value={fu.status} onChange={on(setFu)}>{opts(meta.statuses)}</select></label></div>
            <button className="btn" disabled={busy}>Save follow-up</button>
          </form></div>
        <h2>History ({history.length})</h2>
        {history.length === 0 && <p className="muted">No follow-ups logged yet.</p>}
        {history.map((h) => <div className="card hist" key={h.id}>
          <b>{dmy(h.contact_date)}</b> · {h.method || '—'}{h.outcome ? ' · ' + h.outcome : ''} <span className="muted">by {h.staff || '—'}</span>
          {h.feedback && <p>{h.feedback}</p>}
          {h.issue && <p><span className="badge">{h.issue_type || 'Issue'}</span> {h.issue}</p>}
          {(h.next_action || h.next_followup_date) && <p className="muted">Next: {h.next_action || '—'} ({dmy(h.next_followup_date)})</p>}
        </div>)}
      </section>}
    </div>
  </>)
}
