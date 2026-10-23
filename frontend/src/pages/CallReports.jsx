import React, { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api, dmy, dt, fmtDuration } from '../api.js'
import { useApp } from '../App.jsx'

export default function CallReports() {
  const { meta, user } = useApp()

  // Filter states
  const [datePreset, setDatePreset] = useState('today') // 'today' | 'yesterday' | '7days' | 'month' | 'all' | 'custom'
  const [startDate, setStartDate] = useState(meta?.today || new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(meta?.today || new Date().toISOString().slice(0, 10))
  const [selectedUser, setSelectedUser] = useState(user.role === 'admin' ? 'all' : String(user.id))
  const [selectedOutcome, setSelectedOutcome] = useState('ALL')
  const [selectedMethod, setSelectedMethod] = useState('ALL')
  const [search, setSearch] = useState('')

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // Handle Preset changes
  const applyPreset = (preset) => {
    setDatePreset(preset)
    const today = new Date()
    const fmt = (d) => d.toISOString().slice(0, 10)

    if (preset === 'today') {
      const t = meta?.today || fmt(today)
      setStartDate(t)
      setEndDate(t)
    } else if (preset === 'yesterday') {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      setStartDate(fmt(y))
      setEndDate(fmt(y))
    } else if (preset === '7days') {
      const past = new Date(today)
      past.setDate(past.getDate() - 7)
      setStartDate(fmt(past))
      setEndDate(fmt(today))
    } else if (preset === 'month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      setStartDate(fmt(startOfMonth))
      setEndDate(fmt(today))
    } else if (preset === 'all') {
      setStartDate('')
      setEndDate('')
    }
  }

  // Fetch report data
  const loadReport = () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (startDate) p.set('start_date', startDate)
    if (endDate) p.set('end_date', endDate)
    if (selectedUser) p.set('user_id', selectedUser)
    if (selectedOutcome && selectedOutcome !== 'ALL') p.set('outcome', selectedOutcome)
    if (selectedMethod && selectedMethod !== 'ALL') p.set('method', selectedMethod)
    if (search.trim()) p.set('q', search.trim())
    p.set('limit', '500')

    api(`/call-reports?${p.toString()}`)
      .then((res) => {
        setData(res)
        setErr('')
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadReport()
  }, [startDate, endDate, selectedUser, selectedOutcome, selectedMethod])

  // Export URLs
  const exportUrl = (format) => {
    const p = new URLSearchParams()
    if (startDate) p.set('start_date', startDate)
    if (endDate) p.set('end_date', endDate)
    if (selectedUser) p.set('user_id', selectedUser)
    if (selectedOutcome && selectedOutcome !== 'ALL') p.set('outcome', selectedOutcome)
    if (selectedMethod && selectedMethod !== 'ALL') p.set('method', selectedMethod)
    if (search.trim()) p.set('q', search.trim())
    p.set('format', format)
    return `/api/call-reports/export?${p.toString()}`
  }

  const stats = data?.stats || {
    total_calls: 0,
    total_duration_seconds: 0,
    avg_duration_seconds: 0,
    answered_calls: 0,
    scheduled_followups: 0,
    conversions: 0
  }

  const answeredRate = stats.total_calls > 0
    ? Math.round((stats.answered_calls / stats.total_calls) * 100)
    : 0

  // Filter items in memory by search query if user is typing
  const displayedItems = useMemo(() => {
    if (!data?.items) return []
    const q = search.toLowerCase().trim()
    if (!q) return data.items
    return data.items.filter((r) =>
      (r.business_name || '').toLowerCase().includes(q) ||
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.phone || '').includes(q) ||
      (r.staff || '').toLowerCase().includes(q) ||
      (r.outcome || '').toLowerCase().includes(q) ||
      (r.feedback || '').toLowerCase().includes(q) ||
      (r.issue || '').toLowerCase().includes(q)
    )
  }, [data?.items, search])

  const staffOptions = meta?.staff || []

  return (
    <>
      <div className="row" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>📞 Team Call Reports &amp; Calling Activity</h1>
          <p className="muted" style={{ margin: '0.2rem 0 0' }}>
            Comprehensive tracking of all users' calls, talk time analytics, outcomes, and exportable call logs.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <a
            className="btn success"
            href={exportUrl('xlsx')}
            download
            style={{ fontWeight: 700 }}
          >
            📊 Download Excel Report (.xlsx)
          </a>
          <a
            className="btn alt"
            href={exportUrl('csv')}
            download
            style={{ fontWeight: 600 }}
          >
            📄 Download CSV
          </a>
        </div>
      </div>

      {err && <div className="flash error">{err}</div>}

      {/* Filter Controls Card */}
      <div className="card" style={{ background: '#ffffff', padding: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Preset Date Range Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['7days', 'Last 7 Days'],
              ['month', 'This Month'],
              ['all', 'All Time'],
              ['custom', 'Custom Range']
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={'btn ' + (datePreset === k ? 'pri' : 'alt')}
                style={{ padding: '0.35rem 0.85rem', fontSize: '0.85rem', margin: 0 }}
                onClick={() => applyPreset(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn alt"
            style={{ padding: '0.35rem 0.85rem', fontSize: '0.85rem', margin: 0 }}
            onClick={() => {
              applyPreset('today')
              setSelectedUser(user.role === 'admin' ? 'all' : String(user.id))
              setSelectedOutcome('ALL')
              setSelectedMethod('ALL')
              setSearch('')
            }}
          >
            🔄 Reset Filters
          </button>
        </div>

        {/* Detailed Filter Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div>
            <label style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setDatePreset('custom')
              }}
              style={{ padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setDatePreset('custom')
              }}
              style={{ padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
            />
          </div>

          {user.role === 'admin' ? (
            <div>
              <label style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>Staff / User</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                style={{ padding: '0.45rem 0.6rem', fontSize: '0.9rem', fontWeight: 600 }}
              >
                <option value="all">👥 All Staff / All Users</option>
                {staffOptions.map((st) => (
                  <option key={st.id} value={st.id}>
                    👤 {st.name} {st.id === user.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>Staff Member</label>
              <select disabled style={{ padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}>
                <option>{user.name} (Your Calls)</option>
              </select>
            </div>
          )}

          <div>
            <label style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>Call Outcome</label>
            <select
              value={selectedOutcome}
              onChange={(e) => setSelectedOutcome(e.target.value)}
              style={{ padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
            >
              <option value="ALL">All Outcomes</option>
              {(meta?.outcomes || []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>Contact Method</label>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              style={{ padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
            >
              <option value="ALL">All Methods</option>
              {(meta?.methods || []).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search input */}
        <div style={{ marginTop: '0.75rem' }}>
          <input
            type="search"
            placeholder="🔎 Search by customer name, phone, business name, staff, discussion, or issue..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') loadReport() }}
            style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.92rem' }}
          />
        </div>
      </div>

      {loading ? (
        <p className="muted" style={{ padding: '1rem' }}>Generating call report…</p>
      ) : (
        <>
          {/* Key Metrics Cards */}
          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="stat pri">
              <b>{stats.total_calls}</b>
              <span>Total Calls Made</span>
              <small className="muted" style={{ marginTop: '0.35rem' }}>
                In selected period
              </small>
            </div>

            <div className="stat good">
              <b>{fmtDuration(stats.total_duration_seconds)}</b>
              <span>Total Talk Time</span>
              <small className="muted" style={{ marginTop: '0.35rem' }}>
                Avg: <b>{fmtDuration(stats.avg_duration_seconds)}</b> / call
              </small>
            </div>

            <div className="stat purple">
              <b>{stats.answered_calls}</b>
              <span>Answered Calls</span>
              <small className="muted" style={{ marginTop: '0.35rem' }}>
                Connection Rate: <b>{answeredRate}%</b>
              </small>
            </div>

            <div className="stat warn">
              <b>{stats.scheduled_followups}</b>
              <span>Follow-ups Scheduled</span>
              <small className="muted" style={{ marginTop: '0.35rem' }}>
                Future meetings &amp; callbacks
              </small>
            </div>

            <div className="stat good">
              <b>{stats.conversions}</b>
              <span>Converted to Paid</span>
              <small className="muted" style={{ marginTop: '0.35rem' }}>
                Successfully closed deals
              </small>
            </div>
          </div>

          {/* Outcome Breakdown Cards */}
          {data?.outcomes && Object.keys(data.outcomes).length > 0 && (
            <div className="card" style={{ background: '#ffffff', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.75rem 0' }}>Call Outcomes Breakdown ({stats.total_calls} calls)</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {Object.entries(data.outcomes).map(([outcome, count]) => (
                  <div
                    key={outcome}
                    style={{
                      padding: '0.6rem 1rem',
                      background: count > 0 ? 'var(--pri-light)' : '#f8fafc',
                      border: count > 0 ? '1px solid var(--pri)' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      flex: '1 1 130px'
                    }}
                  >
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: count > 0 ? 'var(--pri)' : '#94a3b8' }}>
                      {count}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>{outcome}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Staff Performance Leaderboard (for Admin / Team view) */}
          {user.role === 'admin' && data?.staff_summary && data.staff_summary.length > 0 && (
            <div className="card" style={{ background: '#ffffff', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.75rem 0' }}>👥 Staff Calling Activity Summary</h3>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Staff Member</th>
                      <th>Total Calls</th>
                      <th>Total Talk Time</th>
                      <th>Answered Calls</th>
                      <th>Answer Rate</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.staff_summary.map((st) => {
                      const rate = st.calls_count > 0 ? Math.round((st.answered_count / st.calls_count) * 100) : 0
                      return (
                        <tr key={st.id || 'unassigned'}>
                          <td style={{ fontWeight: 600 }}>
                            👤 {st.name} {st.id === user.id && <span className="badge s4" style={{ marginLeft: '0.3rem' }}>You</span>}
                          </td>
                          <td>
                            <span className="badge pri" style={{ fontWeight: 700 }}>
                              📞 {st.calls_count} calls
                            </span>
                          </td>
                          <td>
                            <span className="badge dur">
                              ⏱️ {fmtDuration(st.total_seconds)}
                            </span>
                          </td>
                          <td>
                            <span className="badge s5">
                              {st.answered_count} answered
                            </span>
                          </td>
                          <td>
                            <b>{rate}%</b>
                          </td>
                          <td>
                            {st.id && (
                              <button
                                type="button"
                                className="btn alt"
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', margin: 0 }}
                                onClick={() => setSelectedUser(String(st.id))}
                              >
                                Filter Calls
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Calls Log List */}
          <div className="row" style={{ marginTop: '1.5rem', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>
              Detailed Call Logs ({displayedItems.length} {displayedItems.length !== (data?.total || 0) ? `of ${data?.total}` : ''})
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <a
                className="btn success"
                href={exportUrl('xlsx')}
                download
                style={{ padding: '0.35rem 0.8rem', fontSize: '0.85rem' }}
              >
                📊 Export Excel
              </a>
              <a
                className="btn alt"
                href={exportUrl('csv')}
                download
                style={{ padding: '0.35rem 0.8rem', fontSize: '0.85rem' }}
              >
                📄 Export CSV
              </a>
            </div>
          </div>

          {displayedItems.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <p className="muted" style={{ margin: 0, fontSize: '1.05rem' }}>
                No calls found matching your active filters.
              </p>
              <button
                type="button"
                className="btn pri"
                style={{ marginTop: '1rem' }}
                onClick={() => {
                  applyPreset('all')
                  setSelectedUser('all')
                  setSelectedOutcome('ALL')
                  setSelectedMethod('ALL')
                  setSearch('')
                }}
              >
                View All Calls
              </button>
            </div>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Staff / Caller</th>
                    <th>Customer / Business</th>
                    <th>Phone</th>
                    <th>Outcome</th>
                    <th>Duration</th>
                    <th>Discussion / Feedback</th>
                    <th>Next Action</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedItems.map((c) => {
                    const waNum = (c.phone || '').replace(/\D/g, '')
                    return (
                      <tr key={c.id}>
                        <td>
                          <b>{dmy(c.contact_date)}</b>
                          <small style={{ color: 'var(--muted)' }}>{dt(c.created_at)}</small>
                        </td>
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
                              style={{ marginLeft: '0.4rem' }}
                            >
                              💬 WA
                            </a>
                          )}
                        </td>
                        <td>
                          <span className={'badge ' + (c.outcome === 'Answered' ? 's5' : c.outcome === 'Busy' || c.outcome === 'Not Answered' ? 's2' : 's1')}>
                            {c.outcome || '—'}
                          </span>
                          {c.method && (
                            <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                              via {c.method}
                            </small>
                          )}
                        </td>
                        <td>
                          <span className="badge dur">
                            ⏱️ {fmtDuration(c.duration_seconds)}
                          </span>
                        </td>
                        <td style={{ maxWidth: '320px', whiteSpace: 'normal' }}>
                          {c.feedback || '—'}
                          {c.issue && (
                            <small style={{ color: 'var(--bad)', fontWeight: 600, display: 'block', marginTop: '0.2rem' }}>
                              [{c.issue_type || 'Issue'}] {c.issue}
                            </small>
                          )}
                        </td>
                        <td style={{ fontSize: '0.88rem' }}>
                          {c.next_action || '—'}
                          {c.next_followup_date && (
                            <small style={{ color: 'var(--pri)', fontWeight: 600, display: 'block' }}>
                              📅 Due: {dmy(c.next_followup_date)}
                            </small>
                          )}
                        </td>
                        <td>
                          <span className="badge">
                            {c.customer_status || '—'}
                          </span>
                        </td>
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
