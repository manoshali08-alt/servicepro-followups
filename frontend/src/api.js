let csrf = ''
export const setCsrf = (t) => { csrf = t }

export class ApiError extends Error {
  constructor(message, status, detail) { super(message); this.status = status; this.detail = detail }
}

function messageOf(d) {
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((x) => x.msg || '').filter(Boolean).join('; ')
  if (d && d.message) return d.message
  return 'Something went wrong'
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  let payload
  if (form) payload = form
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf
  const r = await fetch('/api' + path, { method, headers, body: payload, credentials: 'same-origin' })
  let data = null
  try { data = await r.json() } catch { /* empty body */ }
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith('/auth/login')) window.dispatchEvent(new Event('unauth'))
    throw new ApiError(messageOf(data && data.detail), r.status, data && data.detail)
  }
  return data
}

export const qs = (obj) => {
  const p = new URLSearchParams()
  Object.entries(obj).forEach(([k, v]) => { if (v) p.set(k, v) })
  const s = p.toString()
  return s ? '?' + s : ''
}

export const dmy = (s) => (s ? new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export const dt = (s) => {
  if (!s) return '—'
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return s
  }
}

export const fmtDuration = (sec) => {
  if (!sec || isNaN(sec) || sec <= 0) return '0s'
  const s = Math.round(sec)
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m === 0) return `${rem}s`
  return `${m}m ${rem}s`
}

export const followupDueText = (dateStr, todayStr) => {
  if (!dateStr) return null
  if (!todayStr) todayStr = new Date().toISOString().slice(0, 10)
  const d1 = new Date(dateStr + 'T00:00:00')
  const d0 = new Date(todayStr + 'T00:00:00')
  const diffDays = Math.round((d1 - d0) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: `Overdue by ${Math.abs(diffDays)}d`, kind: 'bad', days: diffDays }
  if (diffDays === 0) return { text: 'Due Today', kind: 'warn', days: 0 }
  if (diffDays === 1) return { text: 'Tomorrow (+1d)', kind: 'upcoming', days: 1 }
  return { text: `In ${diffDays} days`, kind: 'good', days: diffDays }
}

