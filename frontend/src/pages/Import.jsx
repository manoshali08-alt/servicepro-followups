import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, dmy } from '../api.js'
import { useApp } from '../App.jsx'

const label = { new: 'new', duplicate_db: 'duplicate (in database)', duplicate_file: 'duplicate (in file)', invalid: 'invalid phone' }

export default function ImportPage() {
  const { meta } = useApp()
  const nav = useNavigate()
  const [up, setUp] = useState(null)       // upload response
  const [mapping, setMapping] = useState({})
  const [prev, setPrev] = useState(null)
  const [hist, setHist] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api('/imports').then(setHist).catch(() => {}) }, [])

  const run = async (fn) => { setErr(''); setBusy(true); try { await fn() } catch (e) { setErr(e.message) } finally { setBusy(false) } }

  const upload = (e) => {
    e.preventDefault()
    const file = e.target.elements.file.files[0]
    if (!file) return
    run(async () => {
      const form = new FormData(); form.append('file', file)
      const r = await api('/imports/upload', { method: 'POST', form })
      setUp(r); setMapping(r.mapping); setPrev(null)
    })
  }
  const preview = () => run(async () => setPrev(await api(`/imports/${up.pending_id}/preview`, { method: 'POST', body: { mapping } })))
  const confirm = () => run(async () => {
    const r = await api(`/imports/${up.pending_id}/confirm`, { method: 'POST', body: { mapping } })
    nav('/imports/' + r.import_id)
  })
  const setMap = (field, v) => { setMapping((m) => { const n = { ...m }; v === '' ? delete n[field] : (n[field] = Number(v)); return n }); setPrev(null) }

  return (<>
    <h1>Import customers</h1>
    {err && <div className="flash error">{err}</div>}
    {!up && <div className="card"><form onSubmit={upload}>
      <label>Excel (.xlsx, .xls) or CSV file — max 5 MB / 20,000 rows<input type="file" name="file" accept=".xlsx,.xls,.csv" required /></label>
      <p className="muted">Rows whose phone number already exists are skipped, never overwritten. You preview everything before it is imported.</p>
      <button className="btn" disabled={busy}>Upload &amp; match columns</button></form></div>}
    {up && <>
      <div className="card"><h2>1. Match columns — {up.filename} ({up.row_count} rows)</h2>
        <div className="grid3">{meta.fields.map(([f, l]) => <label key={f}>{l}
          <select value={mapping[f] ?? ''} onChange={(e) => setMap(f, e.target.value)}><option value="">— not in file —</option>
            {up.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select></label>)}</div>
        <button className="btn" onClick={preview} disabled={busy || mapping.phone === undefined}>{prev ? 'Update preview' : 'Preview import'}</button>
        <button className="link" onClick={() => { setUp(null); setPrev(null) }}>Choose another file</button></div>
      {prev && <div className="card"><h2>2. Review</h2>
        <div className="stats">
          <div className="stat good"><b>{prev.counts.new}</b>Will be added</div>
          <div className="stat warn"><b>{prev.counts.duplicate_db + prev.counts.duplicate_file}</b>Duplicates skipped</div>
          <div className="stat bad"><b>{prev.counts.invalid}</b>Invalid phones skipped</div>
          <div className="stat"><b>{prev.total}</b>Rows read</div></div>
        {prev.blank > 0 && <p className="muted">{prev.blank} completely blank row(s) ignored.</p>}
        <p className="muted">Showing the first {prev.rows.length} rows. Every skipped row is saved in a downloadable report after import.</p>
        <div className="scroll"><table><thead><tr><th>Row</th><th>Result</th><th>Phone (cleaned)</th><th>Business</th><th>Customer</th><th>Trial end</th><th>Status</th></tr></thead><tbody>
          {prev.rows.map((r) => <tr key={r.row_number}><td>{r.row_number}</td>
            <td><span className={'badge ' + r.kind}>{label[r.kind]}</span>{r.reason && <><br /><small>{r.reason}</small></>}</td>
            <td>{r.phone || r.raw_phone}</td><td>{r.business_name}</td><td>{r.customer_name}</td><td>{dmy(r.trial_end_date)}</td><td>{r.status}</td></tr>)}
        </tbody></table></div>
        <p className="top"><button className="btn" onClick={confirm} disabled={busy || prev.counts.new === 0}>Confirm: import {prev.counts.new} new customer(s)</button></p></div>}
    </>}
    <h2>Recent imports</h2>
    {hist.length === 0 ? <p className="muted">No imports yet.</p> : <div className="scroll"><table><thead><tr><th>When</th><th>File</th><th>By</th><th>Rows</th><th>Added</th><th>Duplicates</th><th>Invalid</th><th></th></tr></thead><tbody>
      {hist.map((i) => <tr key={i.id}><td>{i.created_at}</td><td>{i.filename}</td><td>{i.who || '—'}</td><td>{i.total}</td><td>{i.added}</td><td>{i.duplicates}</td><td>{i.invalid}</td><td><Link to={'/imports/' + i.id}>Details</Link></td></tr>)}
    </tbody></table></div>}
  </>)
}
