import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'

export default function ImportResult() {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api('/imports/' + id).then(setD).catch((e) => setErr(e.message)) }, [id])
  if (err) return <div className="flash error">{err}</div>
  if (!d) return <p className="muted">Loading…</p>
  const i = d.import
  return (<>
    <h1>Import finished</h1><p className="muted">{i.filename} · {i.created_at}</p>
    <div className="stats"><div className="stat"><b>{i.total}</b>Total rows</div><div className="stat good"><b>{i.added}</b>Customers added</div>
      <div className="stat warn"><b>{i.duplicates}</b>Duplicates skipped</div><div className="stat bad"><b>{i.invalid}</b>Invalid rows</div></div>
    <p>{i.added > 0 && <Link className="btn" to={'/customers?import_id=' + i.id}>View added customers</Link>}
      {d.skipped.length > 0 && <>
        <a className="btn alt" href={`/api/imports/${i.id}/skipped?format=xlsx`}>Skipped rows (Excel)</a>
        <a className="btn alt" href={`/api/imports/${i.id}/skipped?format=csv`}>Skipped rows (CSV)</a></>}</p>
    {d.skipped.length > 0 && <><h2>Skipped rows</h2>
      <div className="scroll"><table><thead><tr><th>Row</th><th>Category</th><th>Reason</th></tr></thead><tbody>
        {d.skipped.map((s) => <tr key={s.row_number}><td>{s.row_number}</td><td>{s.category.replace('_', ' ')}</td><td>{s.reason}</td></tr>)}
      </tbody></table></div>
      {i.duplicates + i.invalid > 200 && <p className="muted">First 200 shown; download the report for all.</p>}</>}
  </>)
}
