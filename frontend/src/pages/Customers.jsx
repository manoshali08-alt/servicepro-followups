import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, dmy, dt, followupDueText, qs } from '../api.js'
import { useApp } from '../App.jsx'

export default function Customers() {
  const { meta, user } = useApp()
  const [sp, setSp] = useSearchParams()
  const get = (k) => sp.get(k) || ''
  const [q, setQ] = useState(get('q'))
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const params = {
    q: get('q'),
    status: get('status'),
    subscription: get('subscription'),
    sort: get('sort'),
    due: get('due'),
    assigned: get('assigned'),
    import_id: get('import_id')
  }
  const key = JSON.stringify(params) + get('page')

  const loadData = () => {
    setErr('')
    api('/customers' + qs({ ...params, page: get('page') }))
      .then(setData)
      .catch((e) => setErr(e.message))
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line
  }, [key])

  const set = (k, v) => {
    const n = new URLSearchParams(sp)
    v ? n.set(k, v) : n.delete(k)
    n.delete('page')
    setSp(n)
  }
  const go = (p) => {
    const n = new URLSearchParams(sp)
    n.set('page', p)
    setSp(n)
  }
  const sel = (k, label, opts) => (
    <select value={get(k)} onChange={(e) => set(k, e.target.value)}>
      <option value="">{label}</option>
      {opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  )

  const handleSyncPostHog = async () => {
    setSyncing(true)
    setSyncMsg('')
    setErr('')
    try {
      const res = await api('/posthog/sync', { method: 'POST' })
      setSyncMsg(`✓ PostHog Synced: ${res.total_fetched} users fetched (${res.added} new added, ${res.updated} updated)`)
      loadData()
    } catch (e) {
      setErr('Sync failed: ' + e.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleClearAllData = async () => {
    if (!window.confirm('⚠️ WARNING: Are you sure you want to delete ALL customers, follow-ups, and imports from the database? This cannot be undone!')) {
      return
    }
    setErr('')
    setSyncMsg('')
    try {
      const res = await api('/admin/clear-data', { method: 'POST' })
      setSyncMsg(res.message)
      loadData()
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <>
      <div className="row">
        <div>
          <h1>Customers {data && <span className="muted">({data.total})</span>}</h1>
        </div>
        <span>
          <button
            type="button"
            className="btn sync-btn"
            onClick={handleSyncPostHog}
            disabled={syncing}
            title="Fetch all users & activity from PostHog using HogQL query"
          >
            {syncing ? '⏳ Syncing PostHog…' : '🔄 Sync from PostHog'}
          </button>
          <Link className="btn" to="/customers/new">+ Add customer</Link>
          <a className="btn alt" href={'/api/export' + qs({ ...params, format: 'xlsx' })}>Export Excel</a>
          <a className="btn alt" href={'/api/export' + qs({ ...params, format: 'csv' })}>Export CSV</a>
          {user && user.role === 'admin' && (
            <button
              type="button"
              className="btn danger"
              onClick={handleClearAllData}
              title="Delete all customers and follow-ups from the database"
            >
              🗑️ Clear All Data
            </button>
          )}
        </span>
      </div>

      {syncMsg && <div className="flash ok">{syncMsg}</div>}
      {err && <div className="flash error">{err}</div>}

      <form className="filters" onSubmit={(e) => { e.preventDefault(); set('q', q.trim()) }} style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr auto auto' }}>
        <input
          type="search"
          placeholder="Search phone, name, business, city..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {sel('status', 'All follow-up statuses', meta.statuses.map((s) => [s, s]))}
        {sel('subscription', 'All subscriptions', [
          ['Paid', 'Paid (Subscribed)'],
          ['Trial', 'Trial'],
          ['Free', 'Free']
        ])}
        {sel('sort', 'Sort: Default (Paid & Top Usage)', [
          ['default', 'Paid & Top Usage first'],
          ['activity', 'Most Recent Activity'],
          ['recent', 'Recently Added']
        ])}
        {sel('due', 'Any follow-up date', [
          ['today', 'Due today'],
          ['overdue', 'Overdue'],
          ['upcoming', 'Upcoming 7 days']
        ])}
        <button className="btn">Search</button>
        <button
          type="button"
          className="link"
          onClick={() => { setQ(''); setSp({}) }}
        >
          Clear
        </button>
      </form>

      {!data ? (
        <p className="muted">Loading…</p>
      ) : data.items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="muted">No customers found matching your filters.</p>
          <button className="btn sync-btn" onClick={handleSyncPostHog} disabled={syncing}>
            {syncing ? 'Syncing…' : '🔄 Fetch from PostHog Now'}
          </button>
        </div>
      ) : (
        <>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Business / City</th>
                  <th>Customer / Phone</th>
                  <th>Subscription</th>
                  <th>Follow-up Status</th>
                  <th>App Usage</th>
                  <th>Last Active</th>
                  <th>Next follow-up</th>
                  <th>Staff</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => {
                  const waNumber = (c.phone || '').replace(/\D/g, '')
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link to={'/customers/' + c.id} style={{ fontWeight: 600 }}>
                          {c.business_name || c.distinct_id || '(no business name)'}
                        </Link>
                        {c.city && <small style={{ display: 'block', color: 'var(--muted)' }}>📍 {c.city}</small>}
                        {c.signup_stage && (
                          <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.75rem' }}>
                            {c.signup_stage}
                          </small>
                        )}
                      </td>
                      <td>
                        <div>{c.customer_name || '—'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                          <a href={'tel:' + c.phone} style={{ fontWeight: 500 }}>{c.phone}</a>
                          {waNumber && (
                            <a
                              href={`https://wa.me/${waNumber}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="wa-link"
                              title="Chat on WhatsApp"
                            >
                              💬 WA
                            </a>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={'badge sub-' + (c.subscription_type || 'Free').toLowerCase()}>
                          {c.subscription_type || 'Free'}
                        </span>
                        {c.plan_name && (
                          <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.75rem' }}>
                            {c.plan_name}
                          </small>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            'badge ' +
                            (c.status === 'Expired'
                              ? 'status-expired'
                              : c.status === 'Converted to Paid'
                              ? 'status-paid'
                              : c.status === 'Closed'
                              ? 'status-closed'
                              : 's' + meta.statuses.indexOf(c.status))
                          }
                        >
                          {c.status === 'Closed' ? '🔒 Closed' : c.status}
                        </span>
                      </td>
                      <td>
                        <span className="badge usage">
                          ⚡ {c.usage_count || 1} uses
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {dt(c.last_activity)}
                      </td>
                      <td>
                        {c.next_followup_date ? (
                          <div>
                            <div>{dmy(c.next_followup_date)}</div>
                            {!meta.closed.includes(c.status) && (() => {
                              const due = followupDueText(c.next_followup_date, meta.today)
                              if (!due) return null
                              return (
                                <span className={'badge ' + (due.kind === 'bad' ? 'status-expired' : due.kind === 'warn' ? 's3' : 's4')} style={{ fontSize: '0.72rem', marginTop: '2px' }}>
                                  {due.text}
                                </span>
                              )
                            })()}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{c.staff || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="row pager">
            <button className="btn alt" disabled={data.page <= 1} onClick={() => go(data.page - 1)}>
              ← Previous
            </button>
            <span className="muted">
              Page {data.page} of {data.pages} ({data.total} total)
            </span>
            <button className="btn alt" disabled={data.page >= data.pages} onClick={() => go(data.page + 1)}>
              Next →
            </button>
          </div>
        </>
      )}
    </>
  )
}
