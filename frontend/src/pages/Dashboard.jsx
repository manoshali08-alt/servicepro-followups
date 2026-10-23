import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dmy, dt, fmtDuration, followupDueText } from '../api.js'
import { useApp } from '../App.jsx'

export default function Dashboard() {
  const { meta, user } = useApp()
  const [tab, setTab] = useState('calls') // 'calls' | 'pipeline'
  const [dash, setDash] = useState(null)
  const [agentDash, setAgentDash] = useState(null)
  const [err, setErr] = useState('')

  // Calling tab filters
  const [selectedUser, setSelectedUser] = useState(user.role === 'admin' ? 'all' : 'my')
  const [selectedDate, setSelectedDate] = useState(meta?.today || new Date().toISOString().slice(0, 10))

  useEffect(() => {
    api('/dashboard')
      .then(setDash)
      .catch((e) => setErr(e.message))
  }, [])

  useEffect(() => {
    api(`/agent-dashboard?user_id=${selectedUser}&date=${selectedDate}`)
      .then(setAgentDash)
      .catch((e) => setErr(e.message))
  }, [selectedUser, selectedDate])

  if (err) return <div className="flash error">{err}</div>
  if (!dash || !agentDash) return <p className="muted">Loading dashboard…</p>

  const s = dash.stats
  const my = agentDash.my_stats
  const teamTotal = agentDash.team_total_calls
  const isAll = agentDash.is_all

  const pipelineTiles = [
    ['Total Customers', s.total, '/customers', 'pri'],
    ['Added in 7 Days', s.new_last_7_days, '/customers', ''],
    ['Expired (Follow up)', s.expired, '/customers?status=Expired', 'bad'],
    ['Not Contacted', s.not_contacted, '/customers?status=Not%20Contacted', 'warn'],
    ['Due Today', s.due_today, '/customers?due=today', 'warn'],
    ['Overdue', s.overdue, '/customers?due=overdue', 'bad'],
    ['Paid Conversions', s.paid, '/customers?status=Converted%20to%20Paid', 'good'],
    ['Closed (Archived)', s.closed || 0, '/customers?status=Closed', ''],
  ]

  const dateLabel = selectedDate === meta.today ? 'Today' : dmy(selectedDate)

  return (
    <>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <p className="muted" style={{ margin: '0.2rem 0 0' }}>
            Today is <b>{dmy(meta.today)}</b> · Logged in as <b>{user.name}</b> {user.role === 'admin' && <span className="badge s4">Admin</span>}
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '0.5rem', background: '#e2e8f0', padding: '0.3rem', borderEndStartRadius: '10px', borderRadius: '10px' }}>
          <button
            type="button"
            className={'btn ' + (tab === 'calls' ? 'pri' : 'alt')}
            style={{ margin: 0, padding: '0.45rem 1rem' }}
            onClick={() => setTab('calls')}
          >
            📞 {isAll ? "All Users' Calls" : "Calls"} ({my.calls_count})
          </button>
          <button
            type="button"
            className={'btn ' + (tab === 'pipeline' ? 'pri' : 'alt')}
            style={{ margin: 0, padding: '0.45rem 1rem' }}
            onClick={() => setTab('pipeline')}
          >
            📊 Pipeline &amp; Follow-up Due
          </button>
        </div>
      </div>

      {tab === 'calls' ? (
        <>
          {/* Admin / User Caller & Date Filter Bar */}
          <div className="card" style={{ background: '#ffffff', padding: '0.9rem 1.1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>View Calls For:</span>

                {user.role === 'admin' ? (
                  <>
                    <button
                      type="button"
                      className={'btn ' + (selectedUser === 'all' ? 'pri' : 'alt')}
                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.85rem', margin: 0 }}
                      onClick={() => setSelectedUser('all')}
                    >
                      👥 All Users / Team ({teamTotal})
                    </button>
                    <button
                      type="button"
                      className={'btn ' + (selectedUser === 'my' || selectedUser === String(user.id) ? 'pri' : 'alt')}
                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.85rem', margin: 0 }}
                      onClick={() => setSelectedUser('my')}
                    >
                      👤 My Calls Only
                    </button>
                    <select
                      value={selectedUser}
                      onChange={(e) => setSelectedUser(e.target.value)}
                      style={{ width: 'auto', display: 'inline-block', padding: '0.35rem 0.7rem', fontSize: '0.85rem', margin: 0 }}
                    >
                      <option value="all">Select Staff Member...</option>
                      {(meta.staff || []).map((st) => (
                        <option key={st.id} value={String(st.id)}>
                          👤 {st.name} {st.id === user.id ? '(You)' : ''}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="badge pri" style={{ padding: '0.35rem 0.75rem', fontSize: '0.88rem' }}>
                    👤 {user.name} (Your Calls)
                  </span>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Date:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    style={{ width: 'auto', display: 'inline-block', padding: '0.3rem 0.6rem', fontSize: '0.85rem', margin: 0 }}
                  />
                  {selectedDate !== meta.today && (
                    <button
                      type="button"
                      className="link"
                      style={{ fontSize: '0.82rem', marginLeft: '0.2rem' }}
                      onClick={() => setSelectedDate(meta.today)}
                    >
                      Today
                    </button>
                  )}
                </div>
              </div>

              {/* Take Report / Export Buttons */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <Link to="/call-reports" className="btn alt" style={{ padding: '0.35rem 0.8rem', fontSize: '0.85rem', margin: 0 }}>
                  📊 Detailed Reports
                </Link>
                <a
                  className="btn success"
                  href={`/api/call-reports/export?start_date=${selectedDate}&end_date=${selectedDate}&user_id=${selectedUser}&format=xlsx`}
                  download
                  style={{ padding: '0.35rem 0.8rem', fontSize: '0.85rem', margin: 0, fontWeight: 700 }}
                >
                  📥 Export Excel
                </a>
              </div>
            </div>
          </div>

          {/* Calling Performance Metrics Section */}
          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="stat pri">
              <b>{my.calls_count}</b>
              <span>Calls Handled ({isAll ? 'All Users' : 'Selected User'})</span>
              <small style={{ marginTop: '0.35rem', color: 'var(--muted)' }}>
                {dateLabel} · Team Total: <b>{teamTotal}</b>
              </small>
            </div>

            <div className="stat good">
              <b>{fmtDuration(my.total_duration_seconds)}</b>
              <span>Total Talk Time</span>
              <small style={{ marginTop: '0.35rem', color: 'var(--muted)' }}>
                Avg: <b>{fmtDuration(my.avg_duration_seconds)}</b> / call
              </small>
            </div>

            <div className="stat warn">
              <b>{my.scheduled_count}</b>
              <span>Follow-ups Scheduled</span>
              <small style={{ marginTop: '0.35rem', color: 'var(--muted)' }}>
                For upcoming days
              </small>
            </div>

            <div className="stat purple">
              <b>{my.conversions_count}</b>
              <span>Converted to Paid</span>
              <small style={{ marginTop: '0.35rem', color: 'var(--muted)' }}>
                Successful sales on {dateLabel}
              </small>
            </div>
          </div>

          {/* Outcomes Breakdown Bar */}
          <div className="card" style={{ background: '#ffffff' }}>
            <h3 style={{ margin: '0 0 0.75rem 0' }}>Call Outcomes ({my.calls_count} total on {dateLabel})</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {meta.outcomes.map((outcome) => {
                const count = my.outcomes[outcome] || 0
                return (
                  <div
                    key={outcome}
                    style={{
                      padding: '0.6rem 1rem',
                      background: count > 0 ? 'var(--pri-light)' : '#f8fafc',
                      border: count > 0 ? '1px solid var(--pri)' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      flex: '1 1 140px'
                    }}
                  >
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: count > 0 ? 'var(--pri)' : '#94a3b8' }}>
                      {count}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>{outcome}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* List of Calls Handled */}
          <div className="row" style={{ marginTop: '1.5rem', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>
              {isAll ? "All Users' Calls Handled" : "Calls Handled"} on {dateLabel} ({agentDash.my_calls.length})
            </h2>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <a
                className="btn alt"
                href={`/api/call-reports/export?start_date=${selectedDate}&end_date=${selectedDate}&user_id=${selectedUser}&format=csv`}
                download
                style={{ padding: '0.3rem 0.7rem', fontSize: '0.82rem', margin: 0 }}
              >
                📄 Export CSV
              </a>
            </div>
          </div>

          {agentDash.my_calls.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
              <p className="muted" style={{ margin: 0 }}>
                No calls logged for this selection on {dateLabel}. Go to{' '}
                <Link to="/customers" style={{ fontWeight: 600 }}>Customers</Link> to start calling!
              </p>
            </div>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Staff / Caller</th>
                    <th>Customer / Business</th>
                    <th>Phone</th>
                    <th>Outcome</th>
                    <th>Call Duration</th>
                    <th>Customer Feedback / Discussion</th>
                    <th>Next Action</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {agentDash.my_calls.map((c) => {
                    const waNum = (c.phone || '').replace(/\D/g, '')
                    return (
                      <tr key={c.id}>
                        <td>
                          <span className="badge pri" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                            👤 {c.staff || 'Staff'}
                          </span>
                        </td>
                        <td>
                          <Link to={'/customers/' + c.customer_id} style={{ fontWeight: 600 }}>
                            {c.business_name || c.customer_name || 'Customer'}
                          </Link>
                          {c.customer_name && c.business_name && (
                            <small>{c.customer_name}</small>
                          )}
                        </td>
                        <td>
                          <a href={'tel:' + c.phone}>{c.phone}</a>
                          {waNum && (
                            <a
                              href={`https://wa.me/${waNum}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="wa-link"
                            >
                              💬 WA
                            </a>
                          )}
                        </td>
                        <td>
                          <span className={'badge ' + (c.outcome === 'Answered' ? 's5' : c.outcome === 'Busy' || c.outcome === 'Not Answered' ? 's2' : 's1')}>
                            {c.outcome || '—'}
                          </span>
                        </td>
                        <td>
                          <span className="badge dur">
                            ⏱️ {fmtDuration(c.duration_seconds)}
                          </span>
                        </td>
                        <td style={{ maxWidth: '300px', whiteSpace: 'normal' }}>
                          {c.feedback || '—'}
                          {c.issue && (
                            <small style={{ color: 'var(--bad)', fontWeight: 600 }}>
                              [{c.issue_type || 'Issue'}] {c.issue}
                            </small>
                          )}
                        </td>
                        <td style={{ fontSize: '0.88rem' }}>
                          {c.next_action || '—'}
                          {c.next_followup_date && (
                            <small style={{ color: 'var(--pri)', fontWeight: 600 }}>
                              📅 {dmy(c.next_followup_date)}
                            </small>
                          )}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                          {dt(c.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Team Daily Calling Leaderboard */}
          <h2 style={{ marginTop: '2rem' }}>Team Calling Leaderboard ({dateLabel})</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Calls Handled</th>
                  <th>Total Talk Time</th>
                  <th>Answered Calls</th>
                  {user.role === 'admin' && <th>Quick Filter</th>}
                </tr>
              </thead>
              <tbody>
                {agentDash.leaderboard.map((lb) => (
                  <tr key={lb.id} style={{ fontWeight: lb.id === user.id ? 700 : 400, backgroundColor: lb.id === user.id ? '#f0fdf4' : 'transparent' }}>
                    <td>
                      👤 {lb.name} {lb.id === user.id && <span className="badge s4" style={{ marginLeft: '0.4rem' }}>You</span>}
                    </td>
                    <td>
                      <span className="badge pri" style={{ fontSize: '0.9rem', padding: '0.2rem 0.6rem' }}>
                        📞 {lb.calls_count} calls
                      </span>
                    </td>
                    <td>
                      <span className="badge dur">
                        ⏱️ {fmtDuration(lb.total_seconds)}
                      </span>
                    </td>
                    <td>
                      <span className="badge s5">{lb.answered_count} answered</span>
                    </td>
                    {user.role === 'admin' && (
                      <td>
                        <button
                          type="button"
                          className="btn alt"
                          style={{ padding: '0.2rem 0.55rem', fontSize: '0.78rem', margin: 0 }}
                          onClick={() => setSelectedUser(String(lb.id))}
                        >
                          View Calls
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {/* Overall Pipeline Dashboard */}
          <div className="stats">
            {pipelineTiles.map(([l, n, to, c]) => (
              <Link key={l} to={to} className={'stat ' + c}>
                <b>{n}</b>
                {l}
              </Link>
            ))}
          </div>

          <h2>Follow-ups Due Today or Overdue ({dash.due.length})</h2>
          {dash.due.length === 0 ? (
            <p className="muted">Nothing due today. Great job keeping up with follow-ups!</p>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Next follow-up</th>
                    <th>Status</th>
                    <th>Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.due.map((c) => {
                    const due = followupDueText(c.next_followup_date, meta.today)
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link to={'/customers/' + c.id} style={{ fontWeight: 600 }}>
                            {c.business_name || '(no business name)'}
                          </Link>
                        </td>
                        <td>{c.customer_name || '—'}</td>
                        <td>
                          <a href={'tel:' + c.phone}>{c.phone}</a>
                        </td>
                        <td>
                          <span className={'badge ' + (due && due.kind === 'bad' ? 'status-expired' : 's3')}>
                            {dmy(c.next_followup_date)} ({due ? due.text : ''})
                          </span>
                        </td>
                        <td>
                          <span className={'badge s' + meta.statuses.indexOf(c.status)}>
                            {c.status}
                          </span>
                        </td>
                        <td>{c.staff || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
