import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, dmy, qs } from '../api.js'
import { useApp } from '../App.jsx'

export default function Customers() {
  const { meta } = useApp()
  const [sp, setSp] = useSearchParams()
  const get = (k) => sp.get(k) || ''
  const [q, setQ] = useState(get('q'))
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const params = { q: get('q'), status: get('status'), due: get('due'), assigned: get('assigned'), import_id: get('import_id') }
  const key = JSON.stringify(params) + get('page')

  useEffect(() => {
    setErr('')
    api('/customers' + qs({ ...params, page: get('page') })).then(setData).catch((e) => setErr(e.message))
    // eslint-disable-next-line
  }, [key])

  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); n.delete('page'); setSp(n) }
  const go = (p) => { const n = new URLSearchParams(sp); n.set('page', p); setSp(n) }
  const sel = (k, label, opts) => (
    <select value={get(k)} onChange={(e) => set(k, e.target.value)}><option value="">{label}</option>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>)

  return (<>
    <div className="row"><h1>Customers {data && <span className="muted">({data.total})</span>}</h1>
      <span><Link className="btn" to="/customers/new">+ Add customer</Link>
        <a className="btn alt" href={'/api/export' + qs({ ...params, format: 'xlsx' })}>Export Excel</a>
        <a className="btn alt" href={'/api/export' + qs({ ...params, format: 'csv' })}>Export CSV</a></span></div>
    <form className="filters" onSubmit={(e) => { e.preventDefault(); set('q', q.trim()) }}>
      <input type="search" placeholder="Search name, business or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      {sel('status', 'All statuses', meta.statuses.map((s) => [s, s]))}
      {sel('due', 'Any follow-up date', [['today', 'Due today'], ['overdue', 'Overdue'], ['upcoming', 'Upcoming 7 days']])}
      {sel('assigned', 'Any staff', [['none', 'Unassigned'], ...meta.staff.map((u) => [String(u.id), u.name])])}
      <button className="btn">Search</button>
      <button type="button" className="link" onClick={() => { setQ(''); setSp({}) }}>Clear</button>
    </form>
    {err && <div className="flash error">{err}</div>}
    {!data ? <p className="muted">Loading…</p> : data.items.length === 0 ? <p className="muted">No customers match. <Link to="/import">Import a file</Link> or add one manually.</p> : (<>
      <div className="scroll"><table><thead><tr><th>Business</th><th>Customer</th><th>Phone</th><th>Status</th><th>Next follow-up</th><th>Last contact</th><th>Staff</th></tr></thead><tbody>
        {data.items.map((c) => <tr key={c.id}>
          <td><Link to={'/customers/' + c.id}>{c.business_name || '(no name)'}</Link></td><td>{c.customer_name || '—'}</td>
          <td><a href={'tel:' + c.phone}>{c.phone}</a></td><td><span className={'badge s' + meta.statuses.indexOf(c.status)}>{c.status}</span></td>
          <td className={c.next_followup_date && c.next_followup_date < meta.today && !meta.closed.includes(c.status) ? 'bad-text' : ''}>{dmy(c.next_followup_date)}</td>
          <td>{dmy(c.last_contact_date)}</td><td>{c.staff || '—'}</td></tr>)}
      </tbody></table></div>
      <div className="row pager"><button className="btn alt" disabled={data.page <= 1} onClick={() => go(data.page - 1)}>← Previous</button>
        <span className="muted">Page {data.page} of {data.pages}</span>
        <button className="btn alt" disabled={data.page >= data.pages} onClick={() => go(data.page + 1)}>Next →</button></div></>)}
  </>)
}
