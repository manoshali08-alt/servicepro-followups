import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, dmy, dt, fmtDuration, followupDueText } from '../api.js'
import { useApp } from '../App.jsx'

const blank = {
  phone: '', business_name: '', customer_name: '', trial_end_date: '',
  status: 'Not Contacted', feedback: '', next_followup_date: '', notes: '',
  assigned_to: '', last_contact_date: '', contact_method: '',
  subscription_type: '', user_status: '', usage_count: 0, plan_name: '',
  city: '', campaign: '', last_activity: '', signup_date: ''
}

const toForm = (c) => Object.fromEntries(Object.keys(blank).map((k) => [k, c[k] ?? '']))
const toBody = (f) => ({ ...f, assigned_to: f.assigned_to === '' ? null : Number(f.assigned_to) })

const DEFAULT_WA_SETTINGS = {
  softwareName: 'ServicePro',
  features: 'Customer Follow-up, Lead Tracking & Reminders',
  trialDays: '14',
  specialOffer: 'Special 20% discount on subscription renewal!',
  contactNumber: '9047281212',
  website: 'https://servicepro.app',
  teamName: 'ServicePro',
  headerImage: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&auto=format&fit=crop&q=80'
}

const getStoredWaDefaults = () => {
  try {
    const raw = localStorage.getItem('servicepro_wa_defaults_v2')
    if (raw) {
      return { ...DEFAULT_WA_SETTINGS, ...JSON.parse(raw) }
    }
  } catch (e) {
    console.warn('localStorage read error:', e)
  }
  return DEFAULT_WA_SETTINGS
}

const buildCallAttemptText = (vars) => {
  return `Hi ${vars.customerName || 'Valued Customer'}! 👋\n\nThank you for your interest in ${vars.softwareName || 'ServicePro'}.\n\nWe tried reaching you via call, but unfortunately, we couldn't connect with you.\n\n${vars.softwareName || 'ServicePro'} helps you manage your business efficiently with the following features:\n\n${vars.features || 'Customer Follow-up, Lead Tracking & Reminders'}\n\n🎁 You can enjoy a ${vars.trialDays || '14'}-day FREE trial and explore all the features.\n\n📞 We would be happy to explain the software and assist you with a demo.\n\nWhenever you are free, kindly give us a call or let us know a convenient time to reach you.\n\nWe look forward to assisting you!\n\nBest Regards,\n${vars.teamName || 'ServicePro'} Team\n📞 ${vars.contactNumber || '9047281212'}\nThank you for choosing us!`
}

const buildExpiredTrialText = (vars) => {
  return `Hi ${vars.customerName || 'Valued Customer'}! 👋\n\nWe hope you are doing well!\n\nIt's been a while since you explored ${vars.softwareName || 'ServicePro'}. We wanted to remind you that we're still here to help you manage and grow your business.\n\nWith ${vars.softwareName || 'ServicePro'}, you can simplify your daily business operations with features like:\n\n${vars.features || 'Customer Follow-up, Lead Tracking & Reminders'}\n\n✨ Why wait? Get started again and experience smarter business management!\n\n🎁 Special Offer: ${vars.specialOffer || 'Special 20% discount on subscription renewal!'}\n\nOur team would be happy to assist you with a personalized demo and help you get started again.\n\n📞 Contact us: ${vars.contactNumber || '9047281212'}\n\n🌐 Website: ${vars.website || 'https://servicepro.app'}\n\nThank you for being a part of our journey!\n\nBest Regards,\n${vars.teamName || 'ServicePro'} Team`
}

export default function Customer() {
  const { id } = useParams()
  const isNew = !id
  const { meta, user, reloadMeta } = useApp()
  const nav = useNavigate()
  const [f, setF] = useState(blank)
  const [history, setHistory] = useState([])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [showIssueBox, setShowIssueBox] = useState(false)

  // Call timer state
  const [timerActive, setTimerActive] = useState(false)
  const [callSeconds, setCallSeconds] = useState(0)
  const timerRef = useRef(null)

  // Dynamic outcome state
  const [showAddOutcome, setShowAddOutcome] = useState(false)
  const [newOutcomeName, setNewOutcomeName] = useState('')
  const [outcomeSaving, setOutcomeSaving] = useState(false)

  // WhatsApp Follow-up state
  const [showWaModal, setShowWaModal] = useState(false)
  const [waSessions, setWaSessions] = useState([])
  const [waTemplates, setWaTemplates] = useState([])
  const [waSessionId, setWaSessionId] = useState('')
  const [waTemplateId, setWaTemplateId] = useState('')
  const [waMessage, setWaMessage] = useState('')
  const [waLogFollowup, setWaLogFollowup] = useState(true)
  const [waStatus, setWaStatus] = useState('Contacted')
  const [waNextDate, setWaNextDate] = useState('')
  const [waBusy, setWaBusy] = useState(false)
  const [activeWaScenario, setActiveWaScenario] = useState('')
  const [showVarEditor, setShowVarEditor] = useState(true)
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false)
  const [waVars, setWaVars] = useState(() => ({
    customerName: 'Valued Customer',
    ...getStoredWaDefaults()
  }))

  const handleVarChange = (key, val) => {
    setWaVars((prev) => {
      const updated = { ...prev, [key]: val }
      const matched = waTemplates.find((x) => String(x.id) === String(waTemplateId))
      const tname = (matched && matched.name) || activeWaScenario || ''
      if (tname.includes('call_attempt') || tname.includes('not_attend') || activeWaScenario === 'call_not_attended') {
        setWaMessage(buildCallAttemptText(updated))
      } else if (tname.includes('expired') || tname.includes('reengagement') || activeWaScenario === 'trial_expired') {
        setWaMessage(buildExpiredTrialText(updated))
      }
      return updated
    })
  }

  const handleSaveDefaultsPermanently = async () => {
    const toSave = {
      softwareName: waVars.softwareName,
      features: waVars.features,
      trialDays: waVars.trialDays,
      specialOffer: waVars.specialOffer,
      contactNumber: waVars.contactNumber,
      website: waVars.website,
      teamName: waVars.teamName,
      headerImage: waVars.headerImage
    }
    try {
      localStorage.setItem('servicepro_wa_defaults_v2', JSON.stringify(toSave))
      await api('/whatsapp/settings', { method: 'POST', body: toSave })
    } catch (e) {
      console.warn('Failed saving defaults to backend:', e)
    }
    setSaveSuccessNotice(true)
    setTimeout(() => setSaveSuccessNotice(false), 4000)
  }

  const [uploadingImage, setUploadingImage] = useState(false)
  const handleImageFileUpload = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api('/whatsapp/upload-image', { method: 'POST', form: fd })
      if (res && res.url) {
        handleVarChange('headerImage', res.url)
      }
    } catch (err) {
      alert('Image upload failed: ' + err.message)
    } finally {
      setUploadingImage(false)
    }
  }

  const getTomorrowDate = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }

  const renderWaTemplate = (templateBody) => {
    let text = templateBody || ''
    const cname = f.customer_name || f.business_name || 'Valued Customer'
    const bname = f.business_name || f.customer_name || 'your business'
    const staff = (user && user.name) || 'ServicePro Team'
    const trialDate = f.trial_end_date || 'recently'
    const plan = f.plan_name || 'ServicePro'

    // Double braces {{...}}
    text = text.replace(/\{\{customer_name\}\}/gi, cname)
    text = text.replace(/\{\{business_name\}\}/gi, bname)
    text = text.replace(/\{\{phone\}\}/gi, f.phone || '')
    text = text.replace(/\{\{trial_end_date\}\}/gi, trialDate)
    text = text.replace(/\{\{plan_name\}\}/gi, plan)
    text = text.replace(/\{\{feedback\}\}/gi, f.feedback || '')
    text = text.replace(/\{\{staff_name\}\}/gi, staff)
    text = text.replace(/\{\{1\}\}/g, cname)
    text = text.replace(/\{\{2\}\}/g, bname)
    text = text.replace(/\{\{3\}\}/g, trialDate)
    text = text.replace(/\{\{4\}\}/g, staff)

    // Single braces {...}
    text = text.replace(/\{customer_name\}/gi, cname)
    text = text.replace(/\{business_name\}/gi, bname)
    text = text.replace(/\{phone\}/gi, f.phone || '')
    text = text.replace(/\{trial_end_date\}/gi, trialDate)
    text = text.replace(/\{plan_name\}/gi, plan)
    text = text.replace(/\{feedback\}/gi, f.feedback || '')
    text = text.replace(/\{staff_name\}/gi, staff)
    text = text.replace(/\{software_name\}/gi, 'ServicePro')
    text = text.replace(/\{features\}/gi, 'Customer Follow-up, Lead Tracking & Reminders')
    text = text.replace(/\{special_offer\}/gi, 'Special 20% discount on subscription renewal!')
    text = text.replace(/\{contact_number\}/gi, '9047281212')
    text = text.replace(/\{website\}/gi, 'https://servicepro.app')
    text = text.replace(/\{company_name\}/gi, 'ServicePro')
    text = text.replace(/\{1\}/g, cname)
    text = text.replace(/\{2\}/g, bname)
    text = text.replace(/\{3\}/g, trialDate)
    text = text.replace(/\{4\}/g, staff)
    return text
  }

  const applyWaScenario = (scenario, templatesList = null, currentVars = null) => {
    const list = templatesList || waTemplates || []
    const cv = currentVars || waVars
    setActiveWaScenario(scenario || '')
    let target = null

    if (scenario === 'call_not_attended') {
      target = list.find((x) => x.name === 'trial_call_attempt_followup' || x.name === 'call_not_attended' || x.name.toLowerCase().includes('not_attend') || x.name.toLowerCase().includes('no_answer'))
      setWaStatus('Follow-up Scheduled')
      setWaNextDate(getTomorrowDate())
      setWaMessage(buildCallAttemptText(cv))
    } else if (scenario === 'call_busy_callback') {
      target = list.find((x) => x.name === 'call_busy_callback' || x.name.toLowerCase().includes('busy'))
      setWaStatus('Follow-up Scheduled')
      setWaNextDate(getTomorrowDate())
    } else if (scenario === 'trial_expired') {
      target = list.find((x) => x.name === 'expired_trial_customer_reengagement' || x.name === 'trial_expired' || x.name === 'trial_expiry_reminder' || x.name.toLowerCase().includes('expired'))
      setWaStatus('Follow-up Needed')
      setWaMessage(buildExpiredTrialText(cv))
    } else if (scenario === 'contacted_followup') {
      target = list.find((x) => x.name === 'contacted_followup' || x.name.toLowerCase().includes('followup'))
      setWaStatus('Contacted')
    }

    if (!target && list.length > 0 && !scenario) {
      target = list[0]
    }

    if (target) {
      setWaTemplateId(target.id)
      if (target.name.includes('call_attempt') || target.name.includes('not_attend')) {
        setWaMessage(buildCallAttemptText(cv))
      } else if (target.name.includes('expired') || target.name.includes('reengagement')) {
        setWaMessage(buildExpiredTrialText(cv))
      } else {
        setWaMessage(renderWaTemplate(target.body))
      }
    } else {
      setWaTemplateId('')
    }
  }

  const openWhatsAppModal = async (scenario = null) => {
    setWaBusy(false)
    setShowWaModal(true)
    setActiveWaScenario(scenario || '')
    const cname = f.customer_name || f.business_name || 'Valued Customer'

    // Load freshest saved defaults from localStorage & server
    let savedDefs = getStoredWaDefaults()
    try {
      const serverDefs = await api('/whatsapp/settings')
      if (serverDefs && typeof serverDefs === 'object' && Object.keys(serverDefs).length > 0) {
        savedDefs = { ...savedDefs, ...serverDefs }
        localStorage.setItem('servicepro_wa_defaults_v2', JSON.stringify(savedDefs))
      }
    } catch {
      // offline / cached fallback
    }

    const currentVars = {
      ...savedDefs,
      customerName: cname
    }
    setWaVars(currentVars)

    try {
      const [sessList, tplList] = await Promise.all([
        api('/whatsapp/sessions'),
        api('/whatsapp/templates')
      ])
      const s = Array.isArray(sessList) ? sessList : []
      const t = Array.isArray(tplList) ? tplList : []
      setWaSessions(s)
      setWaTemplates(t)

      const conn = s.find((x) => (x.status || '').toLowerCase().includes('connect') || (x.status || '').toLowerCase() === 'working')
      const activeSid = (conn && (conn.id || conn.name)) || (s.length > 0 ? (s[0].id || s[0].name) : 'meta-cloud-api')
      setWaSessionId(activeSid)

      applyWaScenario(scenario, t, currentVars)
    } catch (e) {
      console.warn('WhatsApp modal init:', e.message)
      applyWaScenario(scenario, waTemplates, currentVars)
    }
  }

  const handleTemplateSelect = (tid) => {
    setWaTemplateId(tid)
    setActiveWaScenario('')
    const matched = waTemplates.find((x) => String(x.id) === String(tid))
    if (matched) {
      if (matched.name.includes('call_attempt') || matched.name.includes('not_attend')) {
        setWaMessage(buildCallAttemptText(waVars))
        setWaStatus('Follow-up Scheduled')
        setWaNextDate(getTomorrowDate())
      } else if (matched.name.includes('expired') || matched.name.includes('reengagement')) {
        setWaMessage(buildExpiredTrialText(waVars))
        setWaStatus('Follow-up Needed')
      } else {
        setWaMessage(renderWaTemplate(matched.body))
      }
    }
  }

  const handleSendWhatsAppFollowup = async (e) => {
    e.preventDefault()
    if (!waMessage.trim()) return
    setWaBusy(true)

    // Auto-save defaults in background
    const toSave = {
      softwareName: waVars.softwareName,
      features: waVars.features,
      trialDays: waVars.trialDays,
      specialOffer: waVars.specialOffer,
      contactNumber: waVars.contactNumber,
      website: waVars.website,
      teamName: waVars.teamName,
      headerImage: waVars.headerImage
    }
    try {
      localStorage.setItem('servicepro_wa_defaults_v2', JSON.stringify(toSave))
      api('/whatsapp/settings', { method: 'POST', body: toSave }).catch(() => {})
    } catch {
      // ignore
    }

    const matched = waTemplates.find((x) => String(x.id) === String(waTemplateId))
    const tname = (matched && matched.name) || activeWaScenario || ''
    const isCallAttempt = tname.includes('call_attempt') || tname.includes('not_attend') || activeWaScenario === 'call_not_attended'

    let sendParams = []
    let sendHeaderImg = null

    if (isCallAttempt) {
      sendParams = [
        waVars.customerName || f.customer_name || f.business_name || 'Valued Customer',
        waVars.softwareName || 'ServicePro',
        waVars.features || 'Customer Follow-up, Lead Tracking & Reminders',
        waVars.trialDays || '14',
        waVars.teamName || 'ServicePro',
        waVars.contactNumber || '9047281212'
      ]
      sendHeaderImg = null
    } else {
      sendParams = [
        waVars.customerName || f.customer_name || f.business_name || 'Valued Customer',
        waVars.softwareName || 'ServicePro',
        waVars.features || 'Customer Follow-up, Lead Tracking & Reminders',
        waVars.specialOffer || 'Special 20% discount on renewal!',
        waVars.contactNumber || '9047281212',
        waVars.website || 'https://servicepro.app',
        waVars.teamName || 'ServicePro'
      ]
      sendHeaderImg = waVars.headerImage || 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&auto=format&fit=crop&q=80'
    }

    try {
      await api('/whatsapp/send-customer', {
        method: 'POST',
        body: {
          customer_id: Number(id),
          session_id: waSessionId,
          message: waMessage,
          template_id: waTemplateId ? Number(waTemplateId) : undefined,
          template_variables: {
            params: sendParams
          },
          header_image_url: sendHeaderImg,
          log_followup: waLogFollowup,
          status: waStatus,
          next_followup_date: waNextDate || undefined
        }
      })
      setShowWaModal(false)
      setMsg({ t: 'ok', m: `✅ WhatsApp message sent to ${f.phone} and follow-up logged in history!` })
      load()
    } catch (e) {
      setMsg({ t: 'error', m: 'WhatsApp send failed: ' + e.message })
    } finally {
      setWaBusy(false)
    }
  }

  const handleSaveNewOutcome = async () => {
    const name = newOutcomeName.trim()
    if (!name) return
    setOutcomeSaving(true)
    try {
      await api('/outcomes', { method: 'POST', body: { name } })
      if (reloadMeta) await reloadMeta()
      setFu((x) => ({ ...x, outcome: name }))
      setShowAddOutcome(false)
      setNewOutcomeName('')
      setMsg({ t: 'ok', m: `Call outcome "${name}" added and selected!` })
    } catch (e) {
      setMsg({ t: 'error', m: e.message })
    } finally {
      setOutcomeSaving(false)
    }
  }

  const handleQuickClose = async () => {
    if (!window.confirm('Close this customer? They will be marked as Closed and next follow-up will be cleared so they cannot be reached again.')) return
    setBusy(true)
    try {
      await api('/customers/' + id, {
        method: 'PUT',
        body: toBody({ ...f, status: 'Closed', next_followup_date: null })
      })
      setMsg({ t: 'ok', m: 'Customer has been marked as Closed (Do Not Reach).' })
      load()
    } catch (e) {
      setMsg({ t: 'error', m: e.message })
    } finally {
      setBusy(false)
    }
  }

  const fu0 = {
    contact_date: meta.today, method: 'Call', outcome: 'Answered',
    feedback: '', issue_type: '', issue: '', next_action: '',
    next_followup_date: '', status: '', duration_seconds: 0
  }
  const [fu, setFu] = useState(fu0)

  const onFuStatusChange = (e) => {
    const newStatus = e.target.value
    setFu((x) => ({
      ...x,
      status: newStatus,
      next_followup_date: newStatus === 'Closed' ? '' : x.next_followup_date
    }))
  }

  // Timer interval handling
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setCallSeconds((s) => s + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [timerActive])

  const startCall = () => {
    setCallSeconds(0)
    setTimerActive(true)
    setFu((x) => ({ ...x, method: 'Call', outcome: 'Answered' }))
    if (f.phone) {
      window.location.href = `tel:${f.phone}`
    }
  }

  const stopCall = () => {
    setTimerActive(false)
    setFu((x) => ({ ...x, duration_seconds: callSeconds, outcome: x.outcome || 'Answered' }))
  }

  const resetTimer = () => {
    setTimerActive(false)
    setCallSeconds(0)
    setFu((x) => ({ ...x, duration_seconds: 0 }))
  }

  const formatTimer = (totalSec) => {
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Quick days helper for follow-up date
  const addDaysToFollowup = (days) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    const dateStr = d.toISOString().slice(0, 10)
    setFu((x) => ({
      ...x,
      next_followup_date: dateStr,
      status: x.status || 'Follow-up Scheduled'
    }))
  }

  const load = useCallback(async () => {
    if (isNew) return
    try {
      const r = await api('/customers/' + id)
      setF(toForm(r.customer))
      setHistory(r.history)
      setFu((x) => ({ ...x, status: r.customer.status }))
    } catch (e) {
      setMsg({ t: 'error', m: e.message })
    }
  }, [id, isNew])

  useEffect(() => { load() }, [load])

  const on = (setter) => (e) => setter((x) => ({ ...x, [e.target.name]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    try {
      if (isNew) {
        const r = await api('/customers', { method: 'POST', body: toBody(f) })
        nav('/customers/' + r.id)
      } else {
        await api('/customers/' + id, { method: 'PUT', body: toBody(f) })
        setMsg({ t: 'ok', m: 'Customer profile updated successfully.' })
        setShowEditProfile(false)
        load()
      }
    } catch (ex) {
      if (ex.status === 409 && ex.detail && ex.detail.existing_id && isNew) {
        nav('/customers/' + ex.detail.existing_id)
      } else {
        setMsg({ t: 'error', m: ex.message })
      }
    } finally {
      setBusy(false)
    }
  }

  const addFollowup = async (e) => {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    try {
      const payload = {
        ...fu,
        duration_seconds: Number(fu.duration_seconds || 0),
        next_followup_date: fu.next_followup_date || null
      }
      await api(`/customers/${id}/followups`, { method: 'POST', body: payload })
      setFu({ ...fu0, status: fu.status || f.status })
      setCallSeconds(0)
      setTimerActive(false)
      setMsg({ t: 'ok', m: `Follow-up saved! (Call duration: ${fmtDuration(payload.duration_seconds)})` })
      load()
    } catch (ex) {
      setMsg({ t: 'error', m: ex.message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Permanently delete this customer and their complete follow-up history?')) return
    try {
      await api('/customers/' + id, { method: 'DELETE' })
      nav('/customers')
    } catch (ex) {
      setMsg({ t: 'error', m: ex.message })
    }
  }

  const opts = (arr) => arr.map((o) => <option key={o}>{o}</option>)

  const dueInfo = f.next_followup_date ? followupDueText(f.next_followup_date, meta.today) : null
  const formDueInfo = fu.next_followup_date ? followupDueText(fu.next_followup_date, meta.today) : null

  const assignedStaff = meta.staff && meta.staff.find((u) => String(u.id) === String(f.assigned_to))
  const assignedStaffName = assignedStaff ? assignedStaff.name : (f.assigned_to ? 'Staff #' + f.assigned_to : 'Unassigned')

  return (
    <>
      {/* Top Breadcrumb Navigation & Admin Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
        <Link to="/customers" style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          ← Back to All Customers
        </Link>
        {!isNew && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {f.status !== 'Closed' && (
              <button
                type="button"
                className="link"
                style={{ fontSize: '0.85rem', color: 'var(--bad)', fontWeight: 600 }}
                onClick={handleQuickClose}
              >
                🔒 Close Customer (Do Not Reach)
              </button>
            )}
            {user.role === 'admin' && (
              <button
                type="button"
                className="btn danger"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                onClick={remove}
              >
                🗑️ Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Global Status Message */}
      {msg && <div className={'flash ' + msg.t} style={{ marginBottom: '1rem' }}>{msg.m}</div>}

      {/* Follow-up Due Alert Banner */}
      {dueInfo && !meta.closed.includes(f.status) && (
        <div className={'flash ' + (dueInfo.kind === 'bad' ? 'error' : dueInfo.kind === 'warn' ? 'ok' : '')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <b>Next Follow-up Due: </b>
            <span>{dmy(f.next_followup_date)}</span> — <span style={{ fontWeight: 700 }}>{dueInfo.text}</span>
          </div>
          {f.next_action && <small>Scheduled Action: <i>{f.next_action}</i></small>}
        </div>
      )}

      {/* Live Call Duration Banner if Active */}
      {!isNew && (timerActive || callSeconds > 0) && (
        <div className="call-timer-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {timerActive && <div className="call-pulse" title="Call in progress" />}
            <div>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {timerActive ? '📞 Live Call Recording' : '⏱️ Recorded Call Duration'}
              </span>
              <div className="timer-display">
                {formatTimer(callSeconds)}
                <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 500 }}>
                  ({callSeconds}s)
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {timerActive ? (
              <button type="button" className="btn danger" onClick={stopCall}>
                ⏹️ Stop &amp; Record
              </button>
            ) : (
              <button type="button" className="btn success" onClick={startCall}>
                ▶️ Resume Call
              </button>
            )}
            <button type="button" className="btn alt" onClick={resetTimer} style={{ color: '#fff', borderColor: '#475569' }}>
              Reset
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ROW 1: UNIFIED CUSTOMER PROFILE CARD (Single place - No duplicates!)      */}
      {/* ========================================================================= */}
      {isNew ? (
        <section className="card" style={{ maxWidth: '720px', margin: '0 auto 2rem' }}>
          <h2>Add New Customer</h2>
          <form onSubmit={save}>
            <label>
              Business name
              <input name="business_name" maxLength={200} value={f.business_name} onChange={on(setF)} />
            </label>
            <label>
              Customer name
              <input name="customer_name" maxLength={200} value={f.customer_name} onChange={on(setF)} />
            </label>
            <label>
              Phone *
              <input name="phone" required value={f.phone} onChange={on(setF)} placeholder="98765 43210 or +91…" />
            </label>
            <div className="two">
              <label>
                Status
                <select name="status" value={f.status} onChange={on(setF)}>
                  {opts(meta.statuses)}
                </select>
              </label>
              <label>
                Assigned to
                <select name="assigned_to" value={f.assigned_to} onChange={on(setF)}>
                  <option value="">Unassigned</option>
                  {meta.staff.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="two">
              <label>
                Trial end date
                <input type="date" name="trial_end_date" value={f.trial_end_date} onChange={on(setF)} />
              </label>
              <label>
                Next follow-up
                <input type="date" name="next_followup_date" value={f.next_followup_date} onChange={on(setF)} />
              </label>
            </div>
            <label>
              Feedback / problem note
              <textarea name="feedback" rows={2} value={f.feedback} onChange={on(setF)} />
            </label>
            <label>
              Notes
              <textarea name="notes" rows={2} value={f.notes} onChange={on(setF)} />
            </label>
            <button className="btn" disabled={busy} style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem' }}>
              Add Customer
            </button>
          </form>
        </section>
      ) : (
        <>
          <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: '5px solid #2563eb', borderRadius: '16px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                {/* Title & Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: '1.65rem', color: '#0f172a' }}>
                    {f.business_name || f.customer_name || f.phone}
                  </h1>
                  {f.status && (
                    <span className={'badge ' + (f.status === 'Converted to Paid' ? 'status-paid' : f.status === 'Closed' ? 'status-closed' : 's4')}>
                      {f.status}
                    </span>
                  )}
                  {f.subscription_type && (
                    <span className={'badge sub-' + f.subscription_type.toLowerCase()}>
                      {f.subscription_type}
                    </span>
                  )}
                  {f.user_status && (
                    <span className={'badge ' + (f.user_status === 'Active' ? 's4' : 'status-expired')}>
                      {f.user_status}
                    </span>
                  )}
                </div>

                {/* Primary Contact & Staff Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {f.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#334155' }}>📱 {f.phone}</span>
                      <a
                        href={`tel:${f.phone.replace(/\D/g, '')}`}
                        className="wa-link"
                        style={{ fontSize: '0.8rem', padding: '0.2rem 0.55rem', background: '#eff6ff', color: '#2563eb', borderRadius: '5px', textDecoration: 'none', fontWeight: 600 }}
                        title="Click to dial"
                      >
                        📞 Call
                      </a>
                      <a
                        href={`https://wa.me/${f.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="wa-link"
                        style={{ fontSize: '0.8rem', padding: '0.2rem 0.55rem', background: '#f0fdf4', color: '#16a34a', borderRadius: '5px', textDecoration: 'none', fontWeight: 600 }}
                        title="Open WhatsApp chat"
                      >
                        💬 WhatsApp
                      </a>
                    </div>
                  )}

                  {f.customer_name && f.customer_name !== f.business_name && (
                    <span className="muted" style={{ fontSize: '0.9rem' }}>
                      Contact: <b style={{ color: '#334155' }}>{f.customer_name}</b>
                    </span>
                  )}

                  <span className="muted" style={{ fontSize: '0.9rem' }}>
                    Assigned: <b style={{ color: '#334155' }}>{assignedStaffName}</b>
                  </span>
                </div>
              </div>

              {/* Action buttons on Customer Header */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn alt"
                  style={{ fontSize: '0.88rem', padding: '0.5rem 0.85rem' }}
                  onClick={() => setShowEditProfile((prev) => !prev)}
                >
                  {showEditProfile ? '✕ Hide Edit Form' : '✏️ Edit Customer Profile'}
                </button>

                {!timerActive ? (
                  <button
                    type="button"
                    className="btn success"
                    onClick={startCall}
                    style={{ padding: '0.55rem 1.15rem', fontSize: '0.95rem' }}
                  >
                    📞 Start Call &amp; Timer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn danger"
                    onClick={stopCall}
                    style={{ padding: '0.55rem 1.15rem', fontSize: '0.95rem' }}
                  >
                    ⏹️ End Call &amp; Save
                  </button>
                )}
              </div>
            </div>

            {/* Unified Metadata & PostHog Insights Strip */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.5rem', alignItems: 'center', marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid #f1f5f9', fontSize: '0.88rem' }}>
              {f.plan_name && <div><span className="muted">Plan:</span> <b>{f.plan_name}</b></div>}
              {f.usage_count > 0 && <div><span className="muted">Usage:</span> <span className="badge usage">⚡ {f.usage_count} uses</span></div>}
              {f.city && <div><span className="muted">City:</span> 📍 <b>{f.city}</b></div>}
              {f.trial_end_date && <div><span className="muted">Trial End:</span> <b>{dmy(f.trial_end_date)}</b></div>}
              {f.last_contact_date && <div><span className="muted">Last Contact:</span> <b>{dmy(f.last_contact_date)}</b> {f.contact_method ? `(${f.contact_method})` : ''}</div>}
              {f.last_activity && <div><span className="muted">Last Active:</span> {dt(f.last_activity)}</div>}
              {f.signup_date && <div><span className="muted">Signed Up:</span> {dt(f.signup_date)}</div>}
              {f.feedback && <div><span className="muted">Problem/Feedback:</span> <span style={{ color: '#b91c1c', fontWeight: 600 }}>"{f.feedback}"</span></div>}
            </div>

            {/* Collapsible Edit Customer Profile Form */}
            {showEditProfile && (
              <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '2px dashed #cbd5e1', background: '#f8fafc', padding: '1.1rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#1e293b' }}>✏️ Edit Customer Profile</h3>
                  <button type="button" className="link" onClick={() => setShowEditProfile(false)}>✕ Close</button>
                </div>
                <form onSubmit={save}>
                  <div className="two">
                    <label>
                      Business name
                      <input name="business_name" maxLength={200} value={f.business_name} onChange={on(setF)} />
                    </label>
                    <label>
                      Customer name
                      <input name="customer_name" maxLength={200} value={f.customer_name} onChange={on(setF)} />
                    </label>
                  </div>
                  <div className="two">
                    <label>
                      Phone *
                      <input name="phone" required value={f.phone} onChange={on(setF)} />
                    </label>
                    <label>
                      Assigned to
                      <select name="assigned_to" value={f.assigned_to} onChange={on(setF)}>
                        <option value="">Unassigned</option>
                        {meta.staff.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="two">
                    <label>
                      Status
                      <select name="status" value={f.status} onChange={(e) => {
                        const val = e.target.value
                        setF((prev) => ({ ...prev, status: val, next_followup_date: val === 'Closed' ? '' : prev.next_followup_date }))
                      }}>
                        {opts(meta.statuses)}
                      </select>
                    </label>
                    <label>
                      Trial end date
                      <input type="date" name="trial_end_date" value={f.trial_end_date} onChange={on(setF)} />
                    </label>
                  </div>
                  <div className="two">
                    <label>
                      Problem / feedback note
                      <textarea name="feedback" rows={2} value={f.feedback} onChange={on(setF)} />
                    </label>
                    <label>
                      Notes
                      <textarea name="notes" rows={2} value={f.notes} onChange={on(setF)} />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button type="button" className="btn alt" onClick={() => setShowEditProfile(false)}>Cancel</button>
                    <button className="btn" disabled={busy}>💾 Save Changes</button>
                  </div>
                </form>
              </div>
            )}
          </section>

          {/* ========================================================================= */}
          {/* ROW 2: WHATSAPP QUICK FOLLOW-UP ACTION BAR (Full width row)              */}
          {/* ========================================================================= */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.5rem',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>💬</span>
                <div>
                  <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    Quick WhatsApp Follow-up
                    {f.phone && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, background: '#dcfce7', color: '#15803d', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
                        📱 {f.phone}
                      </span>
                    )}
                  </h3>
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    Send 1-click personalized WhatsApp template messages based on your call outcome:
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn"
                style={{
                  background: '#25D366',
                  color: '#fff',
                  border: 0,
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.95rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  boxShadow: '0 1px 2px rgba(37, 211, 102, 0.2)'
                }}
                onClick={() => openWhatsAppModal()}
              >
                ✉️ Custom / All Templates
              </button>
            </div>

            {/* Scenario Modern Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => openWhatsAppModal('call_not_attended')}
                style={{
                  background: '#fff',
                  border: '1px solid #fee2e2',
                  borderLeft: '4px solid #ef4444',
                  borderRadius: '12px',
                  padding: '0.75rem 0.95rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(239,68,68,0.1)' }}
                onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)' }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  📵 Did Not Attend / No Answer
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem', lineHeight: '1.35' }}>
                  "Tried calling you today... unable to reach you. Please let us know when to speak."
                </div>
              </button>

              <button
                type="button"
                onClick={() => openWhatsAppModal('call_busy_callback')}
                style={{
                  background: '#fff',
                  border: '1px solid #ffedd5',
                  borderLeft: '4px solid #f97316',
                  borderRadius: '12px',
                  padding: '0.75rem 0.95rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(249,115,22,0.1)' }}
                onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)' }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#c2410c', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  ⏳ Busy / Call Back Later
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem', lineHeight: '1.35' }}>
                  "Understand you were busy. When would be a good time to reconnect?"
                </div>
              </button>

              <button
                type="button"
                onClick={() => openWhatsAppModal('trial_expired')}
                style={{
                  background: '#fff',
                  border: '1px solid #e0e7ff',
                  borderLeft: '4px solid #6366f1',
                  borderRadius: '12px',
                  padding: '0.75rem 0.95rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(99,102,241,0.1)' }}
                onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)' }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#4338ca', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  🎁 Expired Trial Re-engagement (🖼️ with Banner)
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem', lineHeight: '1.35' }}>
                  "It's been a while since you explored ServicePro... Special Offer &amp; Personalized demo."
                </div>
              </button>

              <button
                type="button"
                onClick={() => openWhatsAppModal('contacted_followup')}
                style={{
                  background: '#fff',
                  border: '1px solid #dcfce7',
                  borderLeft: '4px solid #10b981',
                  borderRadius: '12px',
                  padding: '0.75rem 0.95rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(16,185,129,0.1)' }}
                onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)' }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  🤝 Connected &amp; Follow-up
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem', lineHeight: '1.35' }}>
                  "Thank you for speaking with us today! Reply here if you need anything."
                </div>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* ROW 3: LOG A CALL / FOLLOW-UP FORM (Compact, Modern Row-Wise Card)        */}
          {/* ========================================================================= */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.5rem',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)'
            }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>📝</span>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
                    Log a Call &amp; Follow-up
                  </h2>
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    Record outcome, feedback notes, and set next schedule in one quick step.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {fu.duration_seconds > 0 && (
                  <span className="badge dur" style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}>
                    ⏱️ Recorded: {fmtDuration(fu.duration_seconds)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowIssueBox((prev) => !prev)}
                  style={{
                    background: showIssueBox ? '#f1f5f9' : '#fff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.78rem',
                    color: '#475569',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                >
                  {showIssueBox ? '✕ Hide Issue' : '⚠️ Report Issue / Bug'}
                </button>
              </div>
            </div>

            <form onSubmit={addFollowup}>
              {/* Row 1: 4-Column Horizontal Call Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
                {/* 1. Contact date */}
                <div>
                  <label style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                    Contact Date *
                  </label>
                  <input
                    type="date"
                    name="contact_date"
                    required
                    value={fu.contact_date}
                    onChange={on(setFu)}
                    style={{ marginTop: '0.3rem', padding: '0.5rem 0.7rem', fontSize: '0.88rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                {/* 2. Method */}
                <div>
                  <label style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                    Method
                  </label>
                  <select
                    name="method"
                    value={fu.method}
                    onChange={on(setFu)}
                    style={{ marginTop: '0.3rem', padding: '0.5rem 0.7rem', fontSize: '0.88rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="">—</option>
                    {opts(meta.methods)}
                  </select>
                </div>

                {/* 3. Call Outcome */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                      Call Outcome
                    </label>
                    <button
                      type="button"
                      className="link"
                      style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--pri)' }}
                      onClick={() => setShowAddOutcome((prev) => !prev)}
                    >
                      {showAddOutcome ? '✕' : '+ Add'}
                    </button>
                  </div>
                  <select
                    name="outcome"
                    value={fu.outcome}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setShowAddOutcome(true)
                      } else {
                        on(setFu)(e)
                      }
                    }}
                    style={{ marginTop: '0.3rem', padding: '0.5rem 0.7rem', fontSize: '0.88rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="">—</option>
                    {opts(meta.outcomes)}
                    <option value="__NEW__">➕ Add new custom...</option>
                  </select>
                </div>

                {/* 4. Duration */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                      Call Duration
                    </label>
                    {fu.duration_seconds > 0 && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>
                        {fmtDuration(fu.duration_seconds)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: '0.3rem' }}>
                    <input
                      type="number"
                      min="0"
                      name="duration_seconds"
                      value={fu.duration_seconds}
                      onChange={on(setFu)}
                      placeholder="Seconds (e.g. 90)"
                      style={{ padding: '0.5rem 0.7rem', fontSize: '0.88rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>
              </div>

              {/* Add custom outcome popup input if toggled */}
              {showAddOutcome && (
                <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '0.85rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="New outcome name (e.g. Left Voicemail, Callback Requested)..."
                    value={newOutcomeName}
                    onChange={(e) => setNewOutcomeName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewOutcome() } }}
                    style={{ margin: 0, padding: '0.4rem 0.65rem', fontSize: '0.85rem' }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn pri"
                    disabled={outcomeSaving || !newOutcomeName.trim()}
                    style={{ margin: 0, padding: '0.4rem 0.75rem', fontSize: '0.82rem', flexShrink: 0 }}
                    onClick={handleSaveNewOutcome}
                  >
                    {outcomeSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn alt"
                    style={{ margin: 0, padding: '0.4rem 0.6rem', fontSize: '0.82rem' }}
                    onClick={() => setShowAddOutcome(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Contextual WhatsApp trigger banner (when outcome is no answer or busy) */}
              {fu.outcome && (fu.outcome.toLowerCase().includes('no answer') || fu.outcome.toLowerCase().includes('not attend') || fu.outcome.toLowerCase().includes('unreachable') || fu.outcome.toLowerCase().includes('missed')) && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '0.82rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>📵</span>
                    <span><b>Call not attended?</b> Send automated WhatsApp follow-up to <b>{f.customer_name || f.business_name || 'Customer'}</b>.</span>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{ background: '#ef4444', color: '#fff', borderColor: '#dc2626', fontSize: '0.78rem', padding: '0.3rem 0.65rem', fontWeight: 600 }}
                    onClick={() => openWhatsAppModal('call_not_attended')}
                  >
                    💬 Send WhatsApp
                  </button>
                </div>
              )}

              {fu.outcome && fu.outcome.toLowerCase().includes('busy') && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '0.82rem', color: '#9a3412', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>⏳</span>
                    <span><b>Customer busy?</b> Send a WhatsApp message asking for callback time.</span>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{ background: '#f97316', color: '#fff', borderColor: '#ea580c', fontSize: '0.78rem', padding: '0.3rem 0.65rem', fontWeight: 600 }}
                    onClick={() => openWhatsAppModal('call_busy_callback')}
                  >
                    💬 Send WhatsApp
                  </button>
                </div>
              )}

              {/* Row 2: Two-column Row (Feedback on Left, Next Schedule on Right) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {/* Left: Customer Feedback */}
                <div>
                  <label style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                    Discussion Notes / Customer Feedback
                  </label>
                  <textarea
                    name="feedback"
                    rows={3}
                    placeholder="What did the customer say? What are they looking for or need help with?"
                    value={fu.feedback}
                    onChange={on(setFu)}
                    style={{ marginTop: '0.3rem', padding: '0.5rem 0.7rem', fontSize: '0.88rem', borderRadius: '8px', border: '1px solid #cbd5e1', resize: 'vertical' }}
                  />
                </div>

                {/* Right: Next Action & Follow-up Date */}
                <div>
                  <label style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                    Next Action Item
                  </label>
                  <input
                    name="next_action"
                    maxLength={300}
                    placeholder="e.g. Call back with pricing, send demo link..."
                    value={fu.next_action}
                    onChange={on(setFu)}
                    style={{ marginTop: '0.3rem', padding: '0.5rem 0.7rem', fontSize: '0.88rem', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '0.65rem' }}
                  />

                  {fu.status !== 'Closed' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                          Next Follow-up Date
                        </label>
                        {formDueInfo && (
                          <span className={'badge ' + (formDueInfo.kind === 'bad' ? 'status-expired' : formDueInfo.kind === 'warn' ? 's3' : 's4')} style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}>
                            {formDueInfo.text}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                        <input
                          type="date"
                          name="next_followup_date"
                          value={fu.next_followup_date}
                          onChange={on(setFu)}
                          style={{ margin: 0, flex: '1 1 140px', padding: '0.45rem 0.65rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        />
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          <button type="button" className="date-pill" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }} onClick={() => addDaysToFollowup(1)}>+1 Day</button>
                          <button type="button" className="date-pill" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }} onClick={() => addDaysToFollowup(2)}>+2 Days</button>
                          <button type="button" className="date-pill" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }} onClick={() => addDaysToFollowup(3)}>+3 Days</button>
                          <button type="button" className="date-pill" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }} onClick={() => addDaysToFollowup(7)}>+1 Week</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Collapsible Issue Reporting Section */}
              {showIssueBox && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#991b1b', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    ⚠️ Customer Issue / Problem Details:
                  </div>
                  <div className="two" style={{ gap: '0.75rem' }}>
                    <div>
                      <label style={{ margin: 0, fontSize: '0.78rem', color: '#7f1d1d' }}>Issue Type</label>
                      <select name="issue_type" value={fu.issue_type} onChange={on(setFu)} style={{ marginTop: '0.25rem', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}>
                        <option value="">None / General</option>
                        {opts(meta.issue_types)}
                      </select>
                    </div>
                    <div>
                      <label style={{ margin: 0, fontSize: '0.78rem', color: '#7f1d1d' }}>Issue Summary</label>
                      <input name="issue" maxLength={200} placeholder="e.g. Needs discount, Mobile app crash, Missing invoice" value={fu.issue} onChange={on(setFu)} style={{ marginTop: '0.25rem', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Row 3: Modern Bottom Toolstrip (Status on left, Save button on right) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>Customer Status:</span>
                    <select
                      name="status"
                      value={fu.status}
                      onChange={onFuStatusChange}
                      style={{ margin: 0, width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    >
                      {opts(meta.statuses)}
                    </select>
                  </div>

                  {fu.status !== 'Closed' && (
                    <button
                      type="button"
                      className="link"
                      style={{ fontSize: '0.8rem', color: 'var(--bad)', fontWeight: 600 }}
                      onClick={() => setFu((x) => ({ ...x, status: 'Closed', next_followup_date: '' }))}
                    >
                      🔒 Close Customer
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn"
                  disabled={busy}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    border: '0',
                    borderRadius: '8px',
                    padding: '0.6rem 1.4rem',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  💾 Save Follow-up &amp; Record Call
                </button>
              </div>

              {fu.status === 'Closed' && (
                <div className="flash warn" style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', borderLeft: '4px solid var(--bad)', background: '#fffbeb' }}>
                  🔒 <b>Customer Marked as Closed:</b> Next follow-up is cleared. This customer will not be scheduled for further outreach.
                </div>
              )}
            </form>
          </section>

          {/* ========================================================================= */}
          {/* ROW 4: CALL & FOLLOW-UP HISTORY TIMELINE (Full width row)                 */}
          {/* ========================================================================= */}
          <section style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: 700 }}>
                📋 Call &amp; Follow-up History ({history.length})
              </h2>
              {history.length > 0 && (
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Latest records first</span>
              )}
            </div>

            {history.length === 0 ? (
              <div style={{ background: '#fff', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                No calls or follow-ups logged yet. Log the first call above!
              </div>
            ) : (
              history.map((h) => {
                const nextDue = h.next_followup_date ? followupDueText(h.next_followup_date, meta.today) : null
                const isWa = (h.method || '').toLowerCase().includes('whatsapp')
                return (
                  <div
                    key={h.id}
                    style={{
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderLeft: isWa ? '4px solid #25D366' : '4px solid #3b82f6',
                      borderRadius: '12px',
                      padding: '1rem 1.25rem',
                      marginBottom: '0.75rem',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{dmy(h.contact_date)}</span>
                        <span style={{ color: '#94a3b8' }}>·</span>
                        <span style={{ fontWeight: 600, color: isWa ? '#16a34a' : '#2563eb' }}>
                          {isWa ? '💬 ' : '📞 '}{h.method || 'Call'}
                        </span>
                        {h.outcome && (
                          <span className="badge s2">
                            {h.outcome}
                          </span>
                        )}
                        {h.duration_seconds > 0 && (
                          <span className="badge dur">
                            ⏱️ {fmtDuration(h.duration_seconds)}
                          </span>
                        )}
                      </div>
                      <span className="muted" style={{ fontSize: '0.82rem' }}>by {h.staff || 'Staff'}</span>
                    </div>

                    {h.feedback && (
                      <p style={{ margin: '0.5rem 0 0', background: '#f8fafc', padding: '0.6rem 0.85rem', borderRadius: '8px', fontSize: '0.88rem', color: '#334155', border: '1px solid #f1f5f9' }}>
                        💬 {h.feedback}
                      </p>
                    )}

                    {h.issue && (
                      <p style={{ margin: '0.4rem 0 0', fontSize: '0.86rem' }}>
                        <span className={'badge ' + (h.issue_type === 'Problem' ? 'tag-problem' : h.issue_type === 'Feature request' ? 'tag-feature' : 'tag-objection')}>
                          {h.issue_type || 'Issue'}:
                        </span>{' '}
                        {h.issue}
                      </p>
                    )}

                    {(h.next_action || h.next_followup_date) && (
                      <div className="muted" style={{ fontSize: '0.82rem', marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <b>Next Action:</b> <span>{h.next_action || 'Follow up'}</span>
                        {h.next_followup_date && (
                          <span style={{ color: '#0f172a', fontWeight: 600 }}>· Due: {dmy(h.next_followup_date)} {nextDue && `(${nextDue.text})`}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </section>
        </>
      )}

      {/* WhatsApp Message Modal */}
      {showWaModal && (
        <div style={waModalOverlayStyle}>
          <div className="card narrow" style={{ background: '#fff', margin: 'auto', width: '92%', maxWidth: '540px', boxShadow: 'var(--shadow-lg)' }}>
            <div className="row" style={{ alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#166534' }}>
                💬 Send WhatsApp to {f.customer_name || f.business_name || 'Customer'}
              </h2>
              <button className="link" onClick={() => setShowWaModal(false)} style={{ fontSize: '1.2rem', color: '#64748b' }}>✕</button>
            </div>

            <p className="muted" style={{ fontSize: '0.88rem', margin: '0 0 0.85rem' }}>
              Recipient Phone: <b>{f.phone}</b> {f.business_name && `(${f.business_name})`}
            </p>

            {/* Quick Scenario Preset Selector Pills */}
            <div style={{ marginBottom: '1rem', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.45rem' }}>
                ⚡ Quick Scenarios (Instant Fill):
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => applyWaScenario('call_not_attended')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    cursor: 'pointer',
                    background: activeWaScenario === 'call_not_attended' ? '#ef4444' : '#fff',
                    color: activeWaScenario === 'call_not_attended' ? '#fff' : '#b91c1c',
                    borderColor: activeWaScenario === 'call_not_attended' ? '#dc2626' : '#fecaca',
                    fontWeight: activeWaScenario === 'call_not_attended' ? 700 : 500,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  📵 Not Attended
                </button>
                <button
                  type="button"
                  onClick={() => applyWaScenario('call_busy_callback')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    cursor: 'pointer',
                    background: activeWaScenario === 'call_busy_callback' ? '#f97316' : '#fff',
                    color: activeWaScenario === 'call_busy_callback' ? '#fff' : '#c2410c',
                    borderColor: activeWaScenario === 'call_busy_callback' ? '#ea580c' : '#fed7aa',
                    fontWeight: activeWaScenario === 'call_busy_callback' ? 700 : 500,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  ⏳ Busy / Call Back
                </button>
                <button
                  type="button"
                  onClick={() => applyWaScenario('trial_expired')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    cursor: 'pointer',
                    background: activeWaScenario === 'trial_expired' ? '#6366f1' : '#fff',
                    color: activeWaScenario === 'trial_expired' ? '#fff' : '#4338ca',
                    borderColor: activeWaScenario === 'trial_expired' ? '#4f46e5' : '#c7d2fe',
                    fontWeight: activeWaScenario === 'trial_expired' ? 700 : 500,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  ⚠️ Trial Expired
                </button>
                <button
                  type="button"
                  onClick={() => applyWaScenario('contacted_followup')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    cursor: 'pointer',
                    background: activeWaScenario === 'contacted_followup' ? '#16a34a' : '#fff',
                    color: activeWaScenario === 'contacted_followup' ? '#fff' : '#15803d',
                    borderColor: activeWaScenario === 'contacted_followup' ? '#15803d' : '#bbf7d0',
                    fontWeight: activeWaScenario === 'contacted_followup' ? 700 : 500,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  🤝 Connected
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveWaScenario('custom'); setWaTemplateId(''); }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    cursor: 'pointer',
                    background: activeWaScenario === 'custom' ? '#475569' : '#fff',
                    color: activeWaScenario === 'custom' ? '#fff' : '#475569',
                    borderColor: activeWaScenario === 'custom' ? '#334155' : '#cbd5e1',
                    fontWeight: activeWaScenario === 'custom' ? 700 : 500,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  ✍️ Custom Text
                </button>
              </div>
            </div>

            <form onSubmit={handleSendWhatsAppFollowup}>
              <div className="two">
                <label>
                  Sending Session *
                  <select value={waSessionId} onChange={(e) => setWaSessionId(e.target.value)} required>
                    {waSessions.map((s) => (
                      <option key={s.id || s.name} value={s.id || s.name}>
                        {s.name} ({s.status || 'Offline'})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Choose Template
                  <select value={waTemplateId} onChange={(e) => handleTemplateSelect(e.target.value)}>
                    <option value="">-- Custom Text (No Template) --</option>
                    {waTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.category})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Dynamic Meta Template Variables Editor */}
              {(() => {
                const matched = waTemplates.find((x) => String(x.id) === String(waTemplateId))
                const tname = (matched && matched.name) || activeWaScenario || ''
                const isCallAttempt = tname.includes('call_attempt') || tname.includes('not_attend') || activeWaScenario === 'call_not_attended'

                return (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showVarEditor ? '0.75rem' : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>✨</span> Template Variables:
                        </span>
                        <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                          {isCallAttempt ? 'trial_call_attempt_followup (6 Variables)' : 'expired_trial_customer_reengagement (7 Variables + Banner)'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="link"
                          style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => setShowVarEditor(!showVarEditor)}
                        >
                          {showVarEditor ? '▲ Hide' : '▼ Show'}
                        </button>
                      </div>
                    </div>

                    {showVarEditor && (
                      <div>
                        {/* Permanent Save Defaults Bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.5rem 0.75rem', borderRadius: '8px', marginBottom: '0.85rem' }}>
                          <span style={{ fontSize: '0.78rem', color: '#065f46' }}>
                            💾 <b>Persistent Defaults:</b> Save once, automatically reused for all future follow-ups.
                          </span>
                          <button
                            type="button"
                            onClick={handleSaveDefaultsPermanently}
                            style={{
                              background: '#16a34a',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '0.35rem 0.75rem',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            💾 Save as My Defaults
                          </button>
                        </div>

                        {saveSuccessNotice && (
                          <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', padding: '0.4rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                            ✅ Permanent defaults saved! Next time you follow up, these values will load automatically.
                          </div>
                        )}

                        {/* Banner Image: ONLY for expired trial template */}
                        {!isCallAttempt ? (
                          <div style={{ marginBottom: '0.85rem', background: '#fff', border: '1px solid #d1fae5', padding: '0.75rem', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                              <label style={{ fontSize: '0.82rem', margin: 0, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span>🖼️</span> Header Banner Image (Meta Image Header)
                              </label>
                              {waVars.headerImage && (
                                <button
                                  type="button"
                                  className="link"
                                  style={{ fontSize: '0.75rem', color: '#dc2626', textDecoration: 'underline', cursor: 'pointer' }}
                                  onClick={() => handleVarChange('headerImage', '')}
                                >
                                  Remove Banner
                                </button>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                              <label
                                style={{
                                  cursor: uploadingImage ? 'wait' : 'pointer',
                                  padding: '0.45rem 0.9rem',
                                  fontSize: '0.82rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.45rem',
                                  borderRadius: '6px',
                                  border: '1.5px solid #16a34a',
                                  color: '#166534',
                                  background: uploadingImage ? '#f0fdf4' : '#dcfce7',
                                  fontWeight: 600,
                                  margin: 0,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <span>{uploadingImage ? '⏳ Uploading...' : '📁 Upload Image from Computer'}</span>
                                <input
                                  type="file"
                                  accept="image/png, image/jpeg, image/jpg, image/webp"
                                  style={{ display: 'none' }}
                                  onChange={handleImageFileUpload}
                                  disabled={uploadingImage}
                                />
                              </label>
                              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                {uploadingImage ? 'Uploading image to WhatsApp CDN...' : 'or paste direct image URL below:'}
                              </span>
                            </div>

                            <input
                              type="url"
                              value={waVars.headerImage || ''}
                              onChange={(e) => handleVarChange('headerImage', e.target.value)}
                              placeholder="https://... paste image URL or use Upload button above"
                              style={{ fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}
                            />

                            {waVars.headerImage && (
                              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#f8fafc', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                <img
                                  src={waVars.headerImage}
                                  alt="Banner Preview"
                                  style={{ height: '52px', width: 'auto', maxWidth: '120px', borderRadius: '6px', border: '1px solid #cbd5e1', objectFit: 'cover' }}
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                                <div style={{ fontSize: '0.75rem', color: '#334155' }}>
                                  <div style={{ fontWeight: 600, color: '#166534' }}>✅ Banner Attached</div>
                                  <div style={{ color: '#64748b', wordBreak: 'break-all', maxWidth: '320px' }}>
                                    {waVars.headerImage.length > 60 ? waVars.headerImage.slice(0, 60) + '...' : waVars.headerImage}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ padding: '0.4rem 0.6rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.78rem', color: '#475569', marginBottom: '0.75rem' }}>
                            ℹ️ <b>Pure Text Template:</b> <code>trial_call_attempt_followup</code> is a text-based utility message (no image attachment).
                          </div>
                        )}

                        {isCallAttempt ? (
                          <>
                            <div className="two" style={{ marginBottom: '0.6rem' }}>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Customer Name {'{{1}}'}</span>
                                <input
                                  value={waVars.customerName || ''}
                                  onChange={(e) => handleVarChange('customerName', e.target.value)}
                                  placeholder="Customer Name"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Software Name {'{{2}}'}</span>
                                <input
                                  value={waVars.softwareName || ''}
                                  onChange={(e) => handleVarChange('softwareName', e.target.value)}
                                  placeholder="Software Name (e.g. ServicePro)"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                            </div>

                            <div style={{ marginBottom: '0.6rem' }}>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Software Features {'{{3}}'}</span>
                                <input
                                  value={waVars.features || ''}
                                  onChange={(e) => handleVarChange('features', e.target.value)}
                                  placeholder="e.g. Customer Follow-up, Lead Tracking & Reminders"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                            </div>

                            <div className="three" style={{ marginBottom: '0.6rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Free Trial Days {'{{4}}'}</span>
                                <input
                                  value={waVars.trialDays || ''}
                                  onChange={(e) => handleVarChange('trialDays', e.target.value)}
                                  placeholder="e.g. 14"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Team Name {'{{5}}'}</span>
                                <input
                                  value={waVars.teamName || ''}
                                  onChange={(e) => handleVarChange('teamName', e.target.value)}
                                  placeholder="e.g. ServicePro"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Contact Number {'{{6}}'}</span>
                                <input
                                  value={waVars.contactNumber || ''}
                                  onChange={(e) => handleVarChange('contactNumber', e.target.value)}
                                  placeholder="e.g. 9047281212"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="two" style={{ marginBottom: '0.6rem' }}>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Customer Name {'{{1}}'}</span>
                                <input
                                  value={waVars.customerName || ''}
                                  onChange={(e) => handleVarChange('customerName', e.target.value)}
                                  placeholder="Customer Name"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Software Name {'{{2}}'}</span>
                                <input
                                  value={waVars.softwareName || ''}
                                  onChange={(e) => handleVarChange('softwareName', e.target.value)}
                                  placeholder="Software Name (e.g. ServicePro)"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                            </div>

                            <div style={{ marginBottom: '0.6rem' }}>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Software Features {'{{3}}'}</span>
                                <input
                                  value={waVars.features || ''}
                                  onChange={(e) => handleVarChange('features', e.target.value)}
                                  placeholder="e.g. Customer Follow-up, Lead Tracking & Reminders"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                            </div>

                            <div className="two" style={{ marginBottom: '0.6rem' }}>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Special Offer {'{{4}}'}</span>
                                <input
                                  value={waVars.specialOffer || ''}
                                  onChange={(e) => handleVarChange('specialOffer', e.target.value)}
                                  placeholder="e.g. Special 20% discount on renewal!"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Contact Number {'{{5}}'}</span>
                                <input
                                  value={waVars.contactNumber || ''}
                                  onChange={(e) => handleVarChange('contactNumber', e.target.value)}
                                  placeholder="e.g. 9047281212"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                            </div>

                            <div className="two">
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Website URL {'{{6}}'}</span>
                                <input
                                  value={waVars.website || ''}
                                  onChange={(e) => handleVarChange('website', e.target.value)}
                                  placeholder="e.g. https://servicepro.app"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                              <label style={{ fontSize: '0.8rem', margin: 0 }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Team / Company Name {'{{7}}'}</span>
                                <input
                                  value={waVars.teamName || ''}
                                  onChange={(e) => handleVarChange('teamName', e.target.value)}
                                  placeholder="e.g. ServicePro"
                                  style={{ marginTop: '0.2rem', fontSize: '0.85rem' }}
                                />
                              </label>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              <label>
                Message Text *
                <textarea
                  rows={5}
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  placeholder="Type WhatsApp message..."
                  required
                />
              </label>

              {/* WhatsApp chat preview box */}
              {(() => {
                const matched = waTemplates.find((x) => String(x.id) === String(waTemplateId))
                const tname = (matched && matched.name) || activeWaScenario || ''
                const isCallAttempt = tname.includes('call_attempt') || tname.includes('not_attend') || activeWaScenario === 'call_not_attended'

                return (
                  <div style={{ background: '#e5ddd5', padding: '0.85rem', borderRadius: '10px', marginBottom: '1rem', border: '1px solid #d1d5db' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.35rem', fontWeight: 600 }}>
                      📱 WhatsApp Live Preview:
                    </div>
                    <div style={{
                      background: '#d9fdd3',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      fontSize: '0.88rem',
                      color: '#111827',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      whiteSpace: 'pre-wrap',
                      lineHeight: '1.4'
                    }}>
                      {!isCallAttempt && waVars.headerImage && (
                        <img
                          src={waVars.headerImage}
                          alt="Banner"
                          style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '6px', marginBottom: '0.5rem' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                      {waMessage}
                    </div>
                  </div>
                )
              })()}

              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={waLogFollowup}
                    onChange={(e) => setWaLogFollowup(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontSize: '0.88rem' }}>
                    <b>Record as Follow-up in History</b><br />
                    <span className="muted">Logs "Method: WhatsApp", "Outcome: Message sent", and updates status.</span>
                  </span>
                </label>

                {waLogFollowup && (
                  <div className="two" style={{ marginTop: '0.75rem' }}>
                    <label style={{ margin: 0 }}>
                      Update Status to
                      <select value={waStatus} onChange={(e) => setWaStatus(e.target.value)}>
                        <option value="Contacted">Contacted</option>
                        <option value="Follow-up Needed">Follow-up Needed</option>
                        <option value="Follow-up Scheduled">Follow-up Scheduled</option>
                        <option value="Not Contacted">Not Contacted</option>
                      </select>
                    </label>
                    <label style={{ margin: 0 }}>
                      Next Follow-up Date (Optional)
                      <input
                        type="date"
                        value={waNextDate}
                        onChange={(e) => setWaNextDate(e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn alt" onClick={() => setShowWaModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn success"
                  disabled={waBusy || !waMessage.trim()}
                  style={{ background: '#25D366', borderColor: '#16a34a', color: '#fff' }}
                >
                  {waBusy ? 'Sending…' : '🚀 Send WhatsApp Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

const waModalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.65)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: '1rem',
  overflowY: 'auto'
}
