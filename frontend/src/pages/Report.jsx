import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dmy, dt, fmtDuration } from '../api.js'

export default function Report() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL') // 'ALL' | 'Problem' | 'Feature request' | 'Objection'

  useEffect(() => {
    api('/report').then(setD).catch((e) => setErr(e.message))
  }, [])

  if (err) return <div className="flash error">{err}</div>
  if (!d) return <p className="muted">Loading feedback report…</p>

  const summary = d.summary || {
    total_feedbacks: (d.items || []).length,
    problems_count: 0,
    features_count: 0,
    objections_count: 0
  }

  const items = (d.items || []).filter((item) => {
    const matchesType = typeFilter === 'ALL' || item.issue_type === typeFilter
    const q = search.toLowerCase().trim()
    if (!q) return matchesType

    const matchesSearch =
      (item.feedback || '').toLowerCase().includes(q) ||
      (item.issue || '').toLowerCase().includes(q) ||
      (item.business_name || '').toLowerCase().includes(q) ||
      (item.customer_name || '').toLowerCase().includes(q) ||
      (item.phone || '').includes(q) ||
      (item.staff || '').toLowerCase().includes(q)

    return matchesType && matchesSearch
  })

  return (
    <>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Customer Feedback &amp; Issues Report</h1>
          <p className="muted" style={{ margin: '0.2rem 0 0' }}>
            Structured intelligence gathered directly from sales &amp; follow-up conversations.
          </p>
        </div>
        <div>
          <a className="btn alt" href="/api/report/export?format=xlsx">
            📊 Export Feedback Excel
          </a>
          <a className="btn alt" href="/api/report/export?format=csv">
            Export CSV
          </a>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat pri">
          <b>{summary.total_feedbacks}</b>
          <span>Total Feedback Logs</span>
          <small className="muted">Captured from follow-up calls</small>
        </div>

        <div className="stat bad">
          <b>{summary.problems_count}</b>
          <span>Problems &amp; Bugs</span>
          <small className="muted">Technical or service issues</small>
        </div>

        <div className="stat purple">
          <b>{summary.features_count}</b>
          <span>Feature Requests</span>
          <small className="muted">Enhancement suggestions</small>
        </div>

        <div className="stat warn">
          <b>{summary.objections_count}</b>
          <span>Sales Objections</span>
          <small className="muted">Pricing, timing, or competitor doubts</small>
        </div>
      </div>

      {/* Frequency Groups */}
      <h2 style={{ marginTop: '1.5rem' }}>Top Recurring Issues &amp; Requests</h2>
      <div className="grid3" style={{ marginBottom: '1.5rem' }}>
        {Object.entries(d.groups).map(([t, groupItems]) => (
          <section className="card" key={t} style={{ borderTop: `4px solid ${t === 'Problem' ? 'var(--bad)' : t === 'Feature request' ? 'var(--purple)' : 'var(--warn)'}` }}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{t}s</span>
              <span className="badge" style={{ fontSize: '0.75rem' }}>{groupItems.length} types</span>
            </h3>

            {groupItems.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.88rem' }}>No {t.toLowerCase()}s logged yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {groupItems.map((x, i) => (
                  <div key={i} style={{ padding: '0.4rem 0.6rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.88rem' }}>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                      <span className="badge" style={{ marginRight: '0.4rem', background: '#e2e8f0', color: '#0f172a' }}>
                        {x.n}×
                      </span>
                      {x.text}
                    </div>
                    <small className="muted" style={{ marginLeft: '1.8rem' }}>
                      {x.customers} distinct customer{x.customers !== 1 ? 's' : ''}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="row" style={{ marginTop: '2rem', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>Detailed Feedback Log ({items.length})</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['ALL', 'Problem', 'Feature request', 'Objection'].map((btnType) => (
            <button
              key={btnType}
              type="button"
              className={'btn ' + (typeFilter === btnType ? 'pri' : 'alt')}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              onClick={() => setTypeFilter(btnType)}
            >
              {btnType === 'ALL' ? 'All Feedback' : btnType + 's'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <input
          type="search"
          placeholder="Search feedback text, issues, customer name, business, or staff..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: '500px' }}
        />
      </div>

      {items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="muted">No feedback matching your current filters.</p>
        </div>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer &amp; Business</th>
                <th>Phone</th>
                <th>Issue Category</th>
                <th>Issue Summary</th>
                <th>Customer Feedback &amp; Remarks</th>
                <th>Call Talk Time</th>
                <th>Logged By</th>
                <th>Next Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const waNum = (r.phone || '').replace(/\D/g, '')
                return (
                  <tr key={r.id}>
                    <td>{dmy(r.contact_date)}</td>
                    <td>
                      <Link to={'/customers/' + r.customer_id} style={{ fontWeight: 600 }}>
                        {r.business_name || r.customer_name || 'Customer'}
                      </Link>
                      {r.customer_name && r.business_name && (
                        <small>{r.customer_name}</small>
                      )}
                    </td>
                    <td>
                      <a href={'tel:' + r.phone}>{r.phone}</a>
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
                      {r.issue_type ? (
                        <span className={'badge ' + (r.issue_type === 'Problem' ? 'tag-problem' : r.issue_type === 'Feature request' ? 'tag-feature' : 'tag-objection')}>
                          {r.issue_type}
                        </span>
                      ) : (
                        <span className="badge">General</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>
                      {r.issue || '—'}
                    </td>
                    <td style={{ maxWidth: '340px', whiteSpace: 'normal', color: '#334155' }}>
                      {r.feedback || '—'}
                    </td>
                    <td>
                      {r.duration_seconds > 0 ? (
                        <span className="badge dur">
                          ⏱️ {fmtDuration(r.duration_seconds)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{r.staff || '—'}</td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {r.next_action || '—'}
                      {r.next_followup_date && (
                        <small style={{ color: 'var(--pri)' }}>
                          Due: {dmy(r.next_followup_date)}
                        </small>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
