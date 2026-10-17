import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dmy } from '../api.js'

export default function Report() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api('/report').then(setD).catch((e) => setErr(e.message)) }, [])
  if (err) return <div className="flash error">{err}</div>
  if (!d) return <p className="muted">Loading…</p>
  const name = (r) => r.business_name || r.customer_name || 'Customer'
  return (<>
    <h1>Feedback report</h1>
    <p className="muted">Built from the Issue type and Issue fields on logged follow-ups. Identical wording is grouped, so keep issue text short and consistent.</p>
    <div className="grid3">{Object.entries(d.groups).map(([t, items]) => <section className="card" key={t}><h2>{t}s</h2>
      {items.length === 0 ? <p className="muted">None logged yet.</p> : items.map((x, i) => <p key={i}><b>{x.n}×</b> {x.text} <span className="muted">({x.customers} customer{x.customers !== 1 ? 's' : ''})</span></p>)}</section>)}</div>
    <h2>Recent feedback from follow-ups</h2>
    {d.recent.length === 0 ? <p className="muted">None yet.</p> : d.recent.map((r, i) => <div className="card hist" key={i}><Link to={'/customers/' + r.customer_id}>{name(r)}</Link> <span className="muted">{dmy(r.contact_date)}</span><p>{r.feedback}</p></div>)}
    <h2>Feedback / problems on customer records</h2>
    {d.customer_feedback.length === 0 ? <p className="muted">None yet.</p> : d.customer_feedback.map((r) => <div className="card hist" key={r.customer_id}><Link to={'/customers/' + r.customer_id}>{name(r)}</Link><p>{r.feedback}</p></div>)}
  </>)
}
