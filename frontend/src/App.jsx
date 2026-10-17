import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { api, setCsrf } from './api.js'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Customers from './pages/Customers.jsx'
import Customer from './pages/Customer.jsx'
import ImportPage from './pages/Import.jsx'
import ImportResult from './pages/ImportResult.jsx'
import Report from './pages/Report.jsx'
import Team from './pages/Team.jsx'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export default function App() {
  const [user, setUser] = useState(undefined)
  const [meta, setMeta] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await api('/auth/me')
      setCsrf(r.csrf)
      setMeta(await api('/meta'))
      setUser(r.user)
    } catch { setUser(null) }
  }, [])

  useEffect(() => {
    load()
    const h = () => setUser(null)
    window.addEventListener('unauth', h)
    return () => window.removeEventListener('unauth', h)
  }, [load])

  const logout = async () => { try { await api('/auth/logout', { method: 'POST' }) } finally { setUser(null) } }

  if (user === undefined) return <p className="muted pad">Loading…</p>
  if (!user) return <Login onLogin={load} />
  return (
    <Ctx.Provider value={{ user, meta, reloadMeta: load }}>
      <header>
        <span className="brand">ServicePro Follow-ups</span>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/customers">Customers</NavLink>
          <NavLink to="/import">Import</NavLink>
          <NavLink to="/report">Feedback report</NavLink>
          {user.role === 'admin' && <NavLink to="/team">Team</NavLink>}
        </nav>
        <span className="muted">{user.name}</span>
        <button className="link" onClick={logout}>Log out</button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/new" element={<Customer />} />
          <Route path="/customers/:id" element={<Customer />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/imports/:id" element={<ImportResult />} />
          <Route path="/report" element={<Report />} />
          <Route path="/team" element={user.role === 'admin' ? <Team /> : <Navigate to="/" />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </Ctx.Provider>
  )
}
