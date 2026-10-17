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

export const dmy = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
