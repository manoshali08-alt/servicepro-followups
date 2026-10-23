import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, dmy, dt, fmtDuration, followupDueText } from '../api.js'
import { useApp } from '../App.jsx'

const blank = {
  phone: '', business_name: '', customer_name: '', trial_end_date: '',
  status: 'Not Contacted', feedback: '', next_followup_date: '', notes: '',
  assigned_to: '', last_contact_date: '', contact_method: '',
  subscription_type: '', user_status: '', usage_count: 0, plan_name: '',
  city: '', campaign: '', last_activity: '', signup_date: ''
}

const toForm = (c) => Object.fromEntries(Object.keys(blank).map((k) => [k, c[k] ?? '']))
const toBody = (f) => ({ ...f, assigned_to: f.assigned_to === '' ? null : Number(f.assigned_to) })

export default function Customer() {
  const { id } = useParams()
  const isNew = !id
  const { meta, user, reloadMeta } = useApp()
  const nav = useNavigate()
  const [f, setF] = useState(blank)
  const [history, setHistory] = useState([])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  // Call timer state
  const [timerActive, setTimerActive] = useState(false)
  const [callSeconds, setCallSeconds] = useState(0)
  const timerRef = useRef(null)

  // Dynamic outcome state
  const [showAddOutcome, setShowAddOutcome] = useState(false)
  const [newOutcomeName, setNewOutcomeName] = useState('')
  const [outcomeSaving, setOutcomeSaving] = useState(false)

  const handleSaveNewOutcome = async () => {
    const name = newOutcomeName.trim()
    if (!name) return
    setOutcomeSaving(true)
    try {
      await api('/outcomes', { method: 'POST', body: { name } })
      if (reloadMeta) await reloadMeta()
      setFu((x) => ({ ...x, outcome: name }))
      setShowAddOutcome(false)
      setNewOutcomeName('')
      setMsg({ t: 'ok', m: `Call outcome "${name}" added and selected!` })
    } catch (e) {
      setMsg({ t: 'error', m: e.message })
    } finally {
      setOutcomeSaving(false)
    }
  }

  const handleQuickClose = async () => {
    if (!window.confirm('Close this customer? They will be marked as Closed and next follow-up will be cleared so they cannot be reached again.')) return
    setBusy(true)
    try {
      await api('/customers/' + id, {
        method: 'PUT',
        body: toBody({ ...f, status: 'Closed', next_followup_date: null })
      })
      setMsg({ t: 'ok', m: 'Customer has been marked as Closed (Do Not Reach).' })
      load()
    } catch (e) {
      setMsg({ t: 'error', m: e.message })
    } finally {
      setBusy(false)
    }
  }

  const fu0 = {
    contact_date: meta.today, method: 'Call', outcome: 'Answered',
    feedback: '', issue_type: '', issue: '', next_action: '',
    next_followup_date: '', status: '', duration_seconds: 0
  }
  const [fu, setFu] = useState(fu0)

  const onFuStatusChange = (e) => {
    const newStatus = e.target.value
    setFu((x) => ({
      ...x,
      status: newStatus,
      next_followup_date: newStatus === 'Closed' ? '' : x.next_followup_date
    }))
  }

  // Timer interval handling
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setCallSeconds((s) => s + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [timerActive])

  const startCall = () => {
    setCallSeconds(0)
    setTimerActive(true)
    setFu((x) => ({ ...x, method: 'Call', outcome: 'Answered' }))
    if (f.phone) {
      window.location.href = `tel:${f.phone}`
    }
  }

  const stopCall = () => {
    setTimerActive(false)
    setFu((x) => ({ ...x, duration_seconds: callSeconds, outcome: x.outcome || 'Answered' }))
  }

  const resetTimer = () => {
    setTimerActive(false)
    setCallSeconds(0)
    setFu((x) => ({ ...x, duration_seconds: 0 }))
  }

  const formatTimer = (totalSec) => {
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Quick days helper for follow-up date
  const addDaysToFollowup = (days) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    const dateStr = d.toISOString().slice(0, 10)
    setFu((x) => ({
      ...x,
      next_followup_date: dateStr,
      status: x.status || 'Follow-up Scheduled'
    }))
  }

  const load = useCallback(async () => {
    if (isNew) return
    try {
      const r = await api('/customers/' + id)
      setF(toForm(r.customer))
      setHistory(r.history)
      setFu((x) => ({ ...x, status: r.customer.status }))
    } catch (e) {
      setMsg({ t: 'error', m: e.message })
    }
  }, [id, isNew])

  useEffect(() => { load() }, [load])

  const on = (setter) => (e) => setter((x) => ({ ...x, [e.target.name]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    try {
      if (isNew) {
        const r = await api('/customers', { method: 'POST', body: toBody(f) })
        nav('/customers/' + r.id)
      } else {
        await api('/customers/' + id, { method: 'PUT', body: toBody(f) })
        setMsg({ t: 'ok', m: 'Customer details updated.' })
        load()
      }
    } catch (ex) {
      if (ex.status === 409 && ex.detail && ex.detail.existing_id && isNew) {
        nav('/customers/' + ex.detail.existing_id)
      } else {
        setMsg({ t: 'error', m: ex.message })
      }
    } finally {
      setBusy(false)
    }
  }

  const addFollowup = async (e) => {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    try {
      const payload = {
        ...fu,
        duration_seconds: Number(fu.duration_seconds || 0),
        next_followup_date: fu.next_followup_date || null
      }
      await api(`/customers/${id}/followups`, { method: 'POST', body: payload })
      setFu({ ...fu0, status: fu.status || f.status })
      setCallSeconds(0)
      setTimerActive(false)
      setMsg({ t: 'ok', m: `Follow-up saved! (Call duration: ${fmtDuration(payload.duration_seconds)})` })
      load()
    } catch (ex) {
      setMsg({ t: 'error', m: ex.message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Permanently delete this customer and their complete follow-up history?')) return
    try {
      await api('/customers/' + id, { method: 'DELETE' })
      nav('/customers')
    } catch (ex) {
      setMsg({ t: 'error', m: ex.message })
    }
  }

  const opts = (arr) => arr.map((o) => <option key={o}>{o}</option>)

  const dueInfo = f.next_followup_date ? followupDueText(f.next_followup_date, meta.today) : null
  const formDueInfo = fu.next_followup_date ? followupDueText(fu.next_followup_date, meta.today) : null

  return (
    <>
      <p><Link to="/customers">← Back to All Customers</Link></p>

      {/* Header and Quick Call Action */}
      <div className="row" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>
            {isNew ? 'Add Customer' : f.business_name || f.customer_name || f.phone}
          </h1>
          {!isNew && f.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{f.phone}</span>
              <a
                href={`https://wa.me/${f.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="wa-link"
                title="Chat on WhatsApp"
              >
                💬 Chat on WhatsApp
              </a>
            </div>
          )}
        </div>

        {!isNew && f.phone && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!timerActive ? (
              <button
                type="button"
                className="btn success"
                onClick={startCall}
                style={{ padding: '0.65rem 1.25rem', fontSize: '1rem' }}
              >
                📞 Start Call &amp; Timer
              </button>
            ) : (
              <button
                type="button"
                className="btn danger"
                onClick={stopCall}
                style={{ padding: '0.65rem 1.25rem', fontSize: '1rem' }}
              >
                ⏹️ End Call &amp; Save Duration
              </button>
            )}
          </div>
        )}
      </div>

      {/* Live Call Duration Banner */}
      {!isNew && (timerActive || callSeconds > 0) && (
        <div className="call-timer-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {timerActive && <div className="call-pulse" title="Call in progress" />}
            <div>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {timerActive ? '📞 Live Call Recording' : '⏱️ Recorded Call Duration'}
              </span>
              <div className="timer-display">
                {formatTimer(callSeconds)}
                <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 500 }}>
                  ({callSeconds}s)
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {timerActive ? (
              <button type="button" className="btn danger" onClick={stopCall}>
                ⏹️ Stop &amp; Record
              </button>
            ) : (
              <button type="button" className="btn success" onClick={startCall}>
                ▶️ Resume Call
              </button>
            )}
            <button type="button" className="btn alt" onClick={resetTimer} style={{ color: '#fff', borderColor: '#475569' }}>
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Follow-up Due Alert Banner */}
      {dueInfo && !meta.closed.includes(f.status) && (
        <div className={'flash ' + (dueInfo.kind === 'bad' ? 'error' : dueInfo.kind === 'warn' ? 'ok' : '')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <b>Next Follow-up: </b>
            <span>{dmy(f.next_followup_date)}</span> — <span style={{ fontWeight: 700 }}>{dueInfo.text}</span>
          </div>
          {f.next_action && <small>Action: <i>{f.next_action}</i></small>}
        </div>
      )}

      {msg && <div className={'flash ' + msg.t}>{msg.m}</div>}

      {/* PostHog Live Insights Card */}
      {!isNew && (f.usage_count || f.subscription_type || f.city || f.plan_name) && (
        <div className="card" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
          <h3 style={{ margin: '0 0 0.65rem 0', fontSize: '0.95rem', color: 'var(--muted)' }}>
            📊 PostHog User Activity &amp; Plan Insights
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <div>
              <b>Subscription:</b>{' '}
              <span className={'badge sub-' + (f.subscription_type || 'Free').toLowerCase()}>
                {f.subscription_type || 'Free'}
              </span>
            </div>
            <div>
              <b>Status:</b>{' '}
              <span className={'badge ' + (f.user_status === 'Active' ? 's4' : 'status-expired')}>
                {f.user_status || 'Inactive'}
              </span>
            </div>
            <div>
              <b>Total Usage:</b> <span className="badge usage">⚡ {f.usage_count || 1} uses</span>
            </div>
            {f.plan_name && <div><b>Plan:</b> {f.plan_name}</div>}
            {f.signup_stage && <div><b>Stage:</b> {f.signup_stage}</div>}
            {f.city && <div><b>City:</b> 📍 {f.city}</div>}
            {f.last_activity && <div><b>Last Active:</b> {dt(f.last_activity)}</div>}
            {f.signup_date && <div><b>Signed Up:</b> {dt(f.signup_date)}</div>}
          </div>
        </div>
      )}

      <div className="grid2">
        {/* Customer Details Form */}
        <section className="card">
          <h2>Customer Profile</h2>
          <form onSubmit={save}>
            <label>
              Business name
              <input name="business_name" maxLength={200} value={f.business_name} onChange={on(setF)} />
            </label>
            <label>
              Customer name
              <input name="customer_name" maxLength={200} value={f.customer_name} onChange={on(setF)} />
            </label>
            <label>
              Phone *
              <input name="phone" required value={f.phone} onChange={on(setF)} placeholder="98765 43210 or +91…" />
            </label>
            {f.status === 'Closed' && (
              <div className="flash" style={{ background: '#f1f5f9', borderLeft: '4px solid #64748b', color: '#334155', fontWeight: 600, marginBottom: '1rem' }}>
                🔒 <b>Customer is Closed:</b> This customer is closed and cannot be reached for follow-ups.
              </div>
            )}
            <label>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Status</span>
                {!isNew && f.status !== 'Closed' && (
                  <button
                    type="button"
                    className="link"
                    style={{ fontSize: '0.8rem', color: 'var(--bad)', fontWeight: 600 }}
                    onClick={handleQuickClose}
                  >
                    🔒 Close Customer
                  </button>
                )}
              </div>
              <select
                name="status"
                value={f.status}
                onChange={(e) => {
                  const val = e.target.value
                  setF((prev) => ({
                    ...prev,
                    status: val,
                    next_followup_date: val === 'Closed' ? '' : prev.next_followup_date
                  }))
                }}
              >
                {opts(meta.statuses)}
              </select>
            </label>
            <label>
              Assigned to
              <select name="assigned_to" value={f.assigned_to} onChange={on(setF)}>
                <option value="">Unassigned</option>
                {meta.staff.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <div className="two">
              <label>
                Trial end date
                <input type="date" name="trial_end_date" value={f.trial_end_date} onChange={on(setF)} />
              </label>
              <label>
                Next follow-up
                <input type="date" name="next_followup_date" value={f.next_followup_date} onChange={on(setF)} />
              </label>
            </div>
            <div className="two">
              <label>
                Last contact date
                <input type="date" name="last_contact_date" value={f.last_contact_date} onChange={on(setF)} />
              </label>
              <label>
                Contact method
                <select name="contact_method" value={f.contact_method} onChange={on(setF)}>
                  <option value="">—</option>
                  {opts(meta.methods)}
                </select>
              </label>
            </div>
            <label>
              Feedback / problem note
              <textarea name="feedback" rows={2} value={f.feedback} onChange={on(setF)} />
            </label>
            <label>
              Notes
              <textarea name="notes" rows={2} value={f.notes} onChange={on(setF)} />
            </label>
            {!isNew && (
              <p className="muted">
                Paid: <b>{f.status === 'Converted to Paid' || f.paid ? 'Yes' : 'No'}</b>
              </p>
            )}
            <button className="btn" disabled={busy}>
              {isNew ? 'Add customer' : 'Save changes'}
            </button>
          </form>

          {!isNew && user.role === 'admin' && (
            <p className="top">
              <button className="btn danger" onClick={remove}>
                Delete customer
              </button>
            </p>
          )}
        </section>

        {/* Log a Follow-up Section */}
        {!isNew && (
          <section>
            <div className="card" style={{ borderTop: '4px solid var(--pri)' }}>
              <h2>Log a Call / Follow-up</h2>
              <form onSubmit={addFollowup}>
                <div className="two">
                  <label>
                    Contact date *
                    <input type="date" name="contact_date" required value={fu.contact_date} onChange={on(setFu)} />
                  </label>
                  <label>
                    Method
                    <select name="method" value={fu.method} onChange={on(setFu)}>
                      <option value="">—</option>
                      {opts(meta.methods)}
                    </select>
                  </label>
                </div>

                <div className="two">
                  <label>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Call Outcome</span>
                      <button
                        type="button"
                        className="link"
                        style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--pri)' }}
                        onClick={() => setShowAddOutcome((prev) => !prev)}
                      >
                        {showAddOutcome ? '✕ Cancel' : '➕ Add Custom Outcome'}
                      </button>
                    </div>
                    <select
                      name="outcome"
                      value={fu.outcome}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setShowAddOutcome(true)
                        } else {
                          on(setFu)(e)
                        }
                      }}
                    >
                      <option value="">—</option>
                      {opts(meta.outcomes)}
                      <option value="__NEW__">➕ Add new custom outcome...</option>
                    </select>
                  </label>
                  <label>
                    Call Duration (seconds)
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        name="duration_seconds"
                        value={fu.duration_seconds}
                        onChange={on(setFu)}
                        placeholder="e.g. 90"
                      />
                      <span className="badge dur" style={{ flexShrink: 0 }}>
                        {fmtDuration(fu.duration_seconds)}
                      </span>
                    </div>
                  </label>
                </div>

                {showAddOutcome && (
                  <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                      Add New Call Outcome:
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="e.g. Left Voicemail, Callback Requested, Interested..."
                        value={newOutcomeName}
                        onChange={(e) => setNewOutcomeName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewOutcome() } }}
                        style={{ margin: 0, padding: '0.45rem 0.65rem', fontSize: '0.9rem' }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn pri"
                        disabled={outcomeSaving || !newOutcomeName.trim()}
                        style={{ margin: 0, padding: '0.45rem 0.85rem', fontSize: '0.85rem', flexShrink: 0 }}
                        onClick={handleSaveNewOutcome}
                      >
                        {outcomeSaving ? 'Saving…' : 'Save & Select'}
                      </button>
                      <button
                        type="button"
                        className="btn alt"
                        style={{ margin: 0, padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}
                        onClick={() => setShowAddOutcome(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <label>
                  Customer Feedback / Discussion Summary
                  <textarea
                    name="feedback"
                    rows={2}
                    placeholder="What did the customer say? What are they looking for?"
                    value={fu.feedback}
                    onChange={on(setFu)}
                  />
                </label>

                <div className="two">
                  <label>
                    Issue type
                    <select name="issue_type" value={fu.issue_type} onChange={on(setFu)}>
                      <option value="">None / General</option>
                      {opts(meta.issue_types)}
                    </select>
                  </label>
                  <label>
                    Issue summary
                    <input name="issue" maxLength={200} placeholder="e.g. Needs discount, Mobile app bug" value={fu.issue} onChange={on(setFu)} />
                  </label>
                </div>

                <label>
                  Next action item
                  <input name="next_action" maxLength={300} placeholder="e.g. Call back with offer, send demo link" value={fu.next_action} onChange={on(setFu)} />
                </label>

                {/* Quick Next Follow-up in Days Buttons (Disabled if Closed) */}
                {fu.status !== 'Closed' && (
                  <div>
                    <label>
                      Next follow-up date
                      {formDueInfo && (
                        <span className={'badge ' + (formDueInfo.kind === 'bad' ? 'status-expired' : formDueInfo.kind === 'warn' ? 's3' : 's4')} style={{ marginLeft: '0.5rem' }}>
                          {formDueInfo.text}
                        </span>
                      )}
                    </label>
                    <div className="date-quick-bar">
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)', alignSelf: 'center' }}>Quick set:</span>
                      <button type="button" className="date-pill" onClick={() => addDaysToFollowup(1)}>+1 Day (Tomorrow)</button>
                      <button type="button" className="date-pill" onClick={() => addDaysToFollowup(2)}>+2 Days</button>
                      <button type="button" className="date-pill" onClick={() => addDaysToFollowup(3)}>+3 Days</button>
                      <button type="button" className="date-pill" onClick={() => addDaysToFollowup(7)}>+1 Week</button>
                      <button type="button" className="date-pill" onClick={() => addDaysToFollowup(14)}>+2 Weeks</button>
                    </div>
                    <input type="date" name="next_followup_date" value={fu.next_followup_date} onChange={on(setFu)} />
                  </div>
                )}

                <label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Update Customer Status</span>
                    {fu.status !== 'Closed' && (
                      <button
                        type="button"
                        className="link"
                        style={{ fontSize: '0.8rem', color: 'var(--bad)', fontWeight: 600 }}
                        onClick={() => setFu((x) => ({ ...x, status: 'Closed', next_followup_date: '' }))}
                      >
                        🔒 Close Customer (Do Not Reach)
                      </button>
                    )}
                  </div>
                  <select name="status" value={fu.status} onChange={onFuStatusChange}>
                    {opts(meta.statuses)}
                  </select>
                </label>

                {fu.status === 'Closed' && (
                  <div className="flash warn" style={{ margin: '0.5rem 0 1rem', fontSize: '0.88rem', borderLeft: '4px solid var(--bad)', background: '#fffbeb' }}>
                    🔒 <b>Customer Marked as Closed:</b> Next follow-up is cleared. This customer is closed and will not be contacted again.
                  </div>
                )}

                <button className="btn success" disabled={busy} style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}>
                  💾 Save Follow-up &amp; Record Call
                </button>
              </form>
            </div>

            {/* Follow-up Timeline History */}
            <h2>Call &amp; Follow-up History ({history.length})</h2>
            {history.length === 0 ? (
              <p className="muted">No calls or follow-ups logged yet.</p>
            ) : (
              history.map((h) => {
                const nextDue = h.next_followup_date ? followupDueText(h.next_followup_date, meta.today) : null
                return (
                  <div className="card hist" key={h.id} style={{ borderLeft: '4px solid var(--pri)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <b>{dmy(h.contact_date)}</b> · {h.method || 'Call'}
                        {h.outcome && (
                          <span className="badge s2" style={{ marginLeft: '0.4rem' }}>
                            {h.outcome}
                          </span>
                        )}
                        {h.duration_seconds > 0 && (
                          <span className="badge dur" style={{ marginLeft: '0.4rem' }}>
                            ⏱️ {fmtDuration(h.duration_seconds)}
                          </span>
                        )}
                      </div>
                      <span className="muted" style={{ fontSize: '0.85rem' }}>by {h.staff || 'Staff'}</span>
                    </div>

                    {h.feedback && (
                      <p style={{ marginTop: '0.5rem', background: '#f8fafc', padding: '0.5rem', borderRadius: '6px' }}>
                        💬 {h.feedback}
                      </p>
                    )}

                    {h.issue && (
                      <p>
                        <span className={'badge ' + (h.issue_type === 'Problem' ? 'tag-problem' : h.issue_type === 'Feature request' ? 'tag-feature' : 'tag-objection')}>
                          {h.issue_type || 'Issue'}:
                        </span>{' '}
                        {h.issue}
                      </p>
                    )}

                    {(h.next_action || h.next_followup_date) && (
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>
                        <b>Next Action:</b> {h.next_action || 'Follow up'}
                        {h.next_followup_date && (
                          <span> (due: {dmy(h.next_followup_date)} {nextDue && `· ${nextDue.text}`})</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </section>
        )}
      </div>
    </>
  )
}
