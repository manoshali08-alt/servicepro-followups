import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dmy, dt, fmtDuration } from '../api.js'

const FEEDBACK_FIELDS = [
  ['phone', 'Phone Number *'],
  ['feedback', 'Customer Feedback / Remarks *'],
  ['issue', 'Issue Summary'],
  ['issue_type', 'Issue Category (Problem / Feature request / Objection)'],
  ['contact_date', 'Contact / Call Date'],
  ['customer_name', 'Customer Name'],
  ['business_name', 'Business / Company Name'],
  ['outcome', 'Call Outcome'],
  ['method', 'Contact Method'],
  ['duration_seconds', 'Call Duration (Seconds)'],
  ['next_action', 'Next Action'],
  ['next_followup_date', 'Next Follow-up Date'],
  ['status', 'Customer Status'],
]

export default function Report() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL') // 'ALL' | 'Problem' | 'Feature request' | 'Objection'

  // Import State
  const [showImport, setShowImport] = useState(false)
  const [importUp, setImportUp] = useState(null)
  const [importMapping, setImportMapping] = useState({})
  const [importPrev, setImportPrev] = useState(null)
  const [importSuccess, setImportSuccess] = useState(null)
  const [importErr, setImportErr] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  const refreshReport = () => {
    api('/report').then(setD).catch((e) => setErr(e.message))
  }

  useEffect(() => {
    refreshReport()
  }, [])

  const resetImport = () => {
    setShowImport(false)
    setImportUp(null)
    setImportMapping({})
    setImportPrev(null)
    setImportSuccess(null)
    setImportErr('')
    setImportBusy(false)
  }

  const handleUploadFeedback = async (e) => {
    e.preventDefault()
    const file = e.target.elements.file.files[0]
    if (!file) return
    setImportErr(''); setImportBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await api('/report/import/upload', { method: 'POST', form })
      setImportUp(r)
      setImportMapping(r.mapping || {})
      setImportPrev(null)
    } catch (ex) {
      setImportErr(ex.message)
    } finally {
      setImportBusy(false)
    }
  }

  const handlePreviewFeedback = async () => {
    if (!importUp) return
    setImportErr(''); setImportBusy(true)
    try {
      const r = await api(`/report/import/${importUp.pending_id}/preview`, {
        method: 'POST',
        body: { mapping: importMapping, update_existing: true }
      })
      setImportPrev(r)
    } catch (ex) {
      setImportErr(ex.message)
    } finally {
      setImportBusy(false)
    }
  }

  const handleConfirmFeedback = async () => {
    if (!importUp) return
    setImportErr(''); setImportBusy(true)
    try {
      const r = await api(`/report/import/${importUp.pending_id}/confirm`, {
        method: 'POST',
        body: { mapping: importMapping, update_existing: true }
      })
      setImportSuccess(r)
      setImportPrev(null)
      setImportUp(null)
      refreshReport()
    } catch (ex) {
      setImportErr(ex.message)
    } finally {
      setImportBusy(false)
    }
  }

  const setMapField = (field, colIndex) => {
    setImportMapping((prev) => {
      const updated = { ...prev }
      if (colIndex === '') {
        delete updated[field]
      } else {
        updated[field] = Number(colIndex)
      }
      return updated
    })
    setImportPrev(null)
  }

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
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={'btn ' + (showImport ? 'alt' : 'pri')}
            onClick={() => { setShowImport(!showImport); if (showImport) resetImport(); }}
          >
            {showImport ? '✕ Close Import' : '📥 Import Feedback'}
          </button>
          <a className="btn alt" href="/api/report/export?format=xlsx">
            📊 Export Feedback Excel
          </a>
          <a className="btn alt" href="/api/report/export?format=csv">
            Export CSV
          </a>
        </div>
      </div>

      {/* Import Feedback Section */}
      {showImport && (
        <div className="card" style={{ border: '2px solid var(--pri)', background: '#fff', marginBottom: '2rem' }}>
          <div className="row" style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📥 Import Customer Feedback &amp; Issues
              </h2>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                Upload customer issues, feature requests, objections, or call feedback from Excel or CSV.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <a
                className="btn alt"
                href="/api/report/import/template"
                download="feedback-import-template.csv"
                style={{ fontSize: '0.85rem' }}
              >
                📄 Download Sample CSV Template
              </a>
              <button
                type="button"
                className="link"
                onClick={resetImport}
                style={{ padding: '0.4rem 0.5rem', color: '#64748b' }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {importErr && <div className="flash error" style={{ margin: '0.5rem 0 1rem' }}>{importErr}</div>}

          {importSuccess && (
            <div className="flash ok" style={{ margin: '0.5rem 0 1rem' }}>
              <h3 style={{ margin: '0 0 0.4rem', color: '#047857' }}>✅ Import Successful!</h3>
              <p style={{ margin: 0 }}>
                Successfully added <b>{importSuccess.added}</b> feedback log(s).
                {importSuccess.new_customers > 0 && ` Created ${importSuccess.new_customers} new customer(s).`}
                {importSuccess.existing_customers > 0 && ` Matched & updated ${importSuccess.existing_customers} existing customer(s).`}
                {importSuccess.skipped > 0 && ` ${importSuccess.skipped} invalid row(s) were skipped.`}
              </p>
              <div style={{ marginTop: '0.75rem' }}>
                <button className="btn pri" onClick={() => { setImportSuccess(null); setImportUp(null); setImportPrev(null); }}>
                  Import Another File
                </button>
                <button className="btn alt" onClick={resetImport} style={{ marginLeft: '0.5rem' }}>
                  Done
                </button>
              </div>
            </div>
          )}

          {!importSuccess && !importUp && (
            <form onSubmit={handleUploadFeedback}>
              <label>
                Select Excel (.xlsx, .xls) or CSV File — max 5 MB / 20,000 rows
                <input type="file" name="file" accept=".xlsx,.xls,.csv" required />
              </label>
              <p className="muted" style={{ fontSize: '0.88rem', margin: '0.4rem 0 1rem' }}>
                💡 <b>Same phone number with multiple entries:</b> If a phone number appears multiple times in your file (e.g. multiple follow-up calls or feedbacks for the same client), <b>all rows will be imported</b> as distinct follow-up logs under that customer. None will be dropped!
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button className="btn pri" disabled={importBusy}>
                  {importBusy ? 'Uploading & Analyzing…' : 'Upload & Match Columns'}
                </button>
                <button type="button" className="btn alt" onClick={resetImport}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {!importSuccess && importUp && !importPrev && (
            <div>
              <h3>Step 1: Match Columns — {importUp.filename} ({importUp.row_count} rows detected)</h3>
              <p className="muted" style={{ fontSize: '0.88rem' }}>
                Check that your spreadsheet columns map to the correct feedback fields below:
              </p>
              <div className="grid3" style={{ marginTop: '1rem' }}>
                {FEEDBACK_FIELDS.map(([f, label]) => (
                  <label key={f}>
                    {label}
                    <select
                      value={importMapping[f] ?? ''}
                      onChange={(e) => setMapField(f, e.target.value)}
                    >
                      <option value="">— not in file —</option>
                      {importUp.headers.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {(importMapping.phone === undefined || (importMapping.feedback === undefined && importMapping.issue === undefined)) && (
                <p className="bad-text" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  * Required: Please select columns for <b>Phone number</b> and <b>Customer Feedback</b> or <b>Issue Summary</b>.
                </p>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  className="btn pri"
                  onClick={handlePreviewFeedback}
                  disabled={importBusy || importMapping.phone === undefined || (importMapping.feedback === undefined && importMapping.issue === undefined)}
                >
                  {importBusy ? 'Validating…' : 'Preview Feedback Import'}
                </button>
                <button
                  className="btn alt"
                  onClick={() => { setImportUp(null); setImportMapping({}); setImportPrev(null); }}
                  disabled={importBusy}
                >
                  Choose Another File
                </button>
              </div>
            </div>
          )}

          {!importSuccess && importPrev && (
            <div>
              <h3>Step 2: Review &amp; Confirm Import</h3>
              <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div className="stat pri">
                  <b>{importPrev.counts.valid}</b>
                  <span>Feedbacks to Import</span>
                  <small className="muted">Ready to add to report</small>
                </div>
                <div className="stat good">
                  <b>{importPrev.counts.existing_customer}</b>
                  <span>Existing Customers</span>
                  <small className="muted">Will attach new feedback</small>
                </div>
                <div className="stat purple">
                  <b>{importPrev.counts.new_customer}</b>
                  <span>New Customers</span>
                  <small className="muted">Will create profiles</small>
                </div>
                {importPrev.counts.invalid > 0 && (
                  <div className="stat bad">
                    <b>{importPrev.counts.invalid}</b>
                    <span>Invalid Rows Skipped</span>
                    <small className="muted">Missing phone or feedback</small>
                  </div>
                )}
              </div>

              {importPrev.blank > 0 && (
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  {importPrev.blank} completely blank row(s) were automatically ignored.
                </p>
              )}

              <p className="muted" style={{ fontSize: '0.88rem' }}>
                Showing preview of the first {importPrev.rows.length} rows:
              </p>

              <div className="scroll" style={{ maxHeight: '300px', marginBottom: '1.25rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Match Type</th>
                      <th>Phone</th>
                      <th>Customer / Business</th>
                      <th>Category</th>
                      <th>Issue</th>
                      <th>Feedback</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPrev.rows.map((r) => (
                      <tr key={r.row_number}>
                        <td>{r.row_number}</td>
                        <td>
                          {r.kind === 'existing_customer' ? (
                            <>
                              <span className="badge s5" title={r.reason}>
                                {r.reason && r.reason.includes('Same number') ? 'Same Number (+)' : 'Existing'}
                              </span>
                              {r.reason && r.reason.includes('Same number') && (
                                <small style={{ color: '#0369a1', fontSize: '0.75rem', marginTop: '2px' }}>
                                  Will append feedback
                                </small>
                              )}
                            </>
                          ) : r.kind === 'new_customer' ? (
                            <span className="badge new">New Customer</span>
                          ) : (
                            <span className="badge bad">{r.reason || 'Invalid'}</span>
                          )}
                        </td>
                        <td>{r.phone || r.raw_phone}</td>
                        <td>
                          {r.customer_name || r.business_name ? (
                            <>
                              <b>{r.customer_name}</b>
                              {r.business_name && <small>{r.business_name}</small>}
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {r.issue_type ? (
                            <span className={'badge ' + (r.issue_type === 'Problem' ? 'tag-problem' : r.issue_type === 'Feature request' ? 'tag-feature' : 'tag-objection')}>
                              {r.issue_type}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.issue || '—'}
                        </td>
                        <td style={{ maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.feedback || '—'}
                        </td>
                        <td>{dmy(r.contact_date) || 'Today'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  className="btn pri"
                  onClick={handleConfirmFeedback}
                  disabled={importBusy || importPrev.counts.valid === 0}
                >
                  {importBusy ? 'Importing…' : `Confirm: Import ${importPrev.counts.valid} Feedback(s)`}
                </button>
                <button
                  className="btn alt"
                  onClick={() => setImportPrev(null)}
                  disabled={importBusy}
                >
                  Back to Column Matching
                </button>
                <button
                  className="btn alt"
                  onClick={resetImport}
                  disabled={importBusy}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
