import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dmy } from '../api.js'
import { useApp } from '../App.jsx'

export default function Dashboard() {
  const { meta } = useApp()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api('/dashboard').then(setD).catch((e) => setErr(e.message)) }, [])
  if (err) return <div className="flash error">{err}</div>
  if (!d) return <p className="muted">Loading…</p>
  const s = d.stats
  const tiles = [
    ['Total customers', s.total, '/customers', ''], ['Added in last 7 days', s.new_last_7_days, '/customers', ''],
    ['Not contacted', s.not_contacted, '/customers?status=Not%20Contacted', ''], ['Due today', s.due_today, '/customers?due=today', 'warn'],
    ['Overdue', s.overdue, '/customers?due=overdue', 'bad'], ['Upcoming (7 days)', s.upcoming, '/customers?due=upcoming', ''],
    ['Paid conversions', s.paid, '/customers?status=Converted%20to%20Paid', 'good'],
  ]
  return (<>
    <h1>Dashboard</h1>
    <div className="stats">{tiles.map(([l, n, to, c]) => <Link key={l} to={to} className={'stat ' + c}><b>{n}</b>{l}</Link>)}</div>
    <h2>Follow-ups due or overdue</h2>
    {d.due.length === 0 ? <p className="muted">Nothing due.</p> : (
      <div className="scroll"><table><thead><tr><th>Business</th><th>Customer</th><th>Phone</th><th>Next follow-up</th><th>Status</th><th>Staff</th></tr></thead><tbody>
        {d.due.map((c) => <tr key={c.id}>
          <td><Link to={'/customers/' + c.id}>{c.business_name || '(no name)'}</Link></td><td>{c.customer_name || '—'}</td>
          <td><a href={'tel:' + c.phone}>{c.phone}</a></td>
          <td className={c.next_followup_date < meta.today ? 'bad-text' : ''}>{dmy(c.next_followup_date)}</td><td>{c.status}</td><td>{c.staff || '—'}</td></tr>)}
      </tbody></table></div>)}
  </>)
}
