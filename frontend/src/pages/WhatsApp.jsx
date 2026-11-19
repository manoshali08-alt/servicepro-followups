import React, { useEffect, useState, useRef } from 'react'
import { api } from '../api.js'

export default function WhatsApp() {
  const [tab, setTab] = useState('sessions') // 'sessions' | 'templates' | 'bulk'

  // Sessions state
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // Create session modal state
  const [showCreate, setShowCreate] = useState(false)
  const [sessionName, setSessionName] = useState('')

  // QR Modal state
  const [qrModal, setQrModal] = useState(null) // { id, name, qr, status }
  const [qrLoading, setQrLoading] = useState(false)
  const pollTimerRef = useRef(null)

  // Test Message Modal state
  const [testModal, setTestModal] = useState(null) // session object
  const [testPhone, setTestPhone] = useState('')
  const [testMsg, setTestMsg] = useState('Hello! This is a test message from ServicePro WhatsApp Integration.')
  const [testTemplateId, setTestTemplateId] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testVars, setTestVars] = useState({}) // { '1': '...', 'customer_name': '...' }
  const [testHeaderImage, setTestHeaderImage] = useState('https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&q=80')
  const [testUploadingImage, setTestUploadingImage] = useState(false)

  const handleTestImageFileUpload = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setTestUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api('/whatsapp/upload-image', { method: 'POST', form: fd })
      if (res && res.url) {
        setTestHeaderImage(res.url)
      }
    } catch (err) {
      alert('Image upload failed: ' + err.message)
    } finally {
      setTestUploadingImage(false)
    }
  }

  // Extract variables like {1}, {{1}}, {customer_name}, {{customer_name}}
  const extractVariables = (text) => {
    if (!text) return []
    const matches = text.match(/\{{1,2}([a-zA-Z0-9_-]+)\}{1,2}/g) || []
    const cleaned = matches.map((m) => m.replace(/[\{\}]/g, '').trim())
    return Array.from(new Set(cleaned))
  }

  // Render text with dynamic variables applied
  const renderTestPreview = (text, vars) => {
    if (!text) return ''
    let out = text
    Object.entries(vars || {}).forEach(([k, v]) => {
      const val = v !== undefined && v !== '' ? v : `[${k}]`
      out = out.split(`{{${k}}}`).join(val)
      out = out.split(`{${k}}`).join(val)
    })
    return out
  }

  const handleTestTemplateSelect = (tid) => {
    setTestTemplateId(tid)
    setTestResult(null)
    const t = templates.find((x) => String(x.id) === String(tid))
    if (t) {
      setTestMsg(t.body)
      const vars = extractVariables(t.body)
      const initVars = {}
      if (t.name.includes('expired') || t.name.includes('reengagement')) {
        initVars['1'] = 'Alex Johnson'
        initVars['2'] = 'ServicePro'
        initVars['3'] = 'ServicePro'
        initVars['4'] = 'Customer Follow-up, Lead Tracking & Reminders'
        initVars['5'] = 'Special 20% discount on renewal!'
        initVars['6'] = '9047281212'
        initVars['7'] = 'https://servicepro.app'
        initVars['8'] = 'ServicePro'
        initVars['customer_name'] = 'Alex Johnson'
        initVars['software_name'] = 'ServicePro'
        initVars['features'] = 'Customer Follow-up, Lead Tracking & Reminders'
        initVars['special_offer'] = 'Special 20% discount on renewal!'
        initVars['contact_number'] = '9047281212'
        initVars['website'] = 'https://servicepro.app'
        initVars['company_name'] = 'ServicePro'
      } else if (t.name.includes('call_attempt') || t.name.includes('not_attend')) {
        initVars['1'] = 'Alex Johnson'
        initVars['2'] = 'ServicePro'
        initVars['3'] = 'Customer Follow-up, Lead Tracking & Reminders'
        initVars['4'] = '14'
        initVars['5'] = 'ServicePro'
        initVars['6'] = '9047281212'
        initVars['customer_name'] = 'Alex Johnson'
        initVars['software_name'] = 'ServicePro'
        initVars['features'] = 'Customer Follow-up, Lead Tracking & Reminders'
        initVars['trial_duration'] = '14'
        initVars['company_name'] = 'ServicePro'
        initVars['contact_number'] = '9047281212'
      } else {
        vars.forEach((v) => {
          if (v === '1' || v === 'customer_name') initVars[v] = 'Alex Johnson'
          else if (v === '2' || v === 'business_name') initVars[v] = 'Acme Corporation'
          else if (v === 'trial_end_date') initVars[v] = '2026-11-25'
          else if (v === 'plan_name') initVars[v] = 'ServicePro Enterprise'
          else if (v === 'feedback') initVars[v] = 'Needs assistance with setup'
          else initVars[v] = `Sample ${v}`
        })
      }
      setTestVars(initVars)
    }
  }

  const openTestModalForTemplate = (tpl) => {
    const conn = sessions.find((s) => (s.status || '').toLowerCase().includes('connect') || (s.status || '').toLowerCase() === 'working' || (s.status || '').toLowerCase() === 'open')
    const sess = conn || (sessions.length > 0 ? sessions[0] : { id: 'meta-cloud-api', name: 'Meta WhatsApp API (Official)' })
    setTestModal(sess)
    setTestResult(null)
    setTestTemplateId(tpl.id)
    setTestMsg(tpl.body)
    const vars = extractVariables(tpl.body)
    const initVars = {}
    if (tpl.name.includes('expired') || tpl.name.includes('reengagement')) {
      initVars['1'] = 'Alex Johnson'
      initVars['2'] = 'ServicePro'
      initVars['3'] = 'ServicePro'
      initVars['4'] = 'Customer Follow-up, Lead Tracking & Reminders'
      initVars['5'] = 'Special 20% discount on renewal!'
      initVars['6'] = '9047281212'
      initVars['7'] = 'https://servicepro.app'
      initVars['8'] = 'ServicePro'
      initVars['customer_name'] = 'Alex Johnson'
      initVars['software_name'] = 'ServicePro'
      initVars['features'] = 'Customer Follow-up, Lead Tracking & Reminders'
      initVars['special_offer'] = 'Special 20% discount on renewal!'
      initVars['contact_number'] = '9047281212'
      initVars['website'] = 'https://servicepro.app'
      initVars['company_name'] = 'ServicePro'
    } else if (tpl.name.includes('call_attempt') || tpl.name.includes('not_attend')) {
      initVars['1'] = 'Alex Johnson'
      initVars['2'] = 'ServicePro'
      initVars['3'] = 'Customer Follow-up, Lead Tracking & Reminders'
      initVars['4'] = '14'
      initVars['5'] = 'ServicePro'
      initVars['6'] = '9047281212'
      initVars['customer_name'] = 'Alex Johnson'
      initVars['software_name'] = 'ServicePro'
      initVars['features'] = 'Customer Follow-up, Lead Tracking & Reminders'
      initVars['trial_duration'] = '14'
      initVars['company_name'] = 'ServicePro'
      initVars['contact_number'] = '9047281212'
    } else {
      vars.forEach((v) => {
        if (v === '1' || v === 'customer_name') initVars[v] = 'Alex Johnson'
        else if (v === '2' || v === 'business_name') initVars[v] = 'Acme Corporation'
        else if (v === 'trial_end_date') initVars[v] = '2026-11-25'
        else if (v === 'plan_name') initVars[v] = 'ServicePro Enterprise'
        else if (v === 'feedback') initVars[v] = 'Needs assistance with setup'
        else initVars[v] = `Sample ${v}`
      })
    }
    setTestVars(initVars)
  }

  // Templates state
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [showCreateTemplate, setShowCreateTemplate] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState(null)
  const blankTemplate = {
    name: '',
    category: 'Marketing (Promotions)',
    header_type: 'DOCUMENT (PDF / Doc Header Attachment)',
    header_caption: '',
    header_media_url: '',
    body: '',
    footer: '',
    buttons: ''
  }
  const [tplForm, setTplForm] = useState(blankTemplate)
  const bodyTextareaRef = useRef(null)

  // Bulk Messaging state
  const [bulkSession, setBulkSession] = useState('')
  const [bulkTemplateId, setBulkTemplateId] = useState('')
  const [bulkMessage, setBulkMessage] = useState('')
  const [bulkFilterStatus, setBulkFilterStatus] = useState('')
  const [bulkDelay, setBulkDelay] = useState(1.5)
  const [bulkLogFollowup, setBulkLogFollowup] = useState(true)
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null)
  const [candidateCustomers, setCandidateCustomers] = useState([])

  const loadSessions = async () => {
    setLoading(true)
    setErr('')
    try {
      const data = await api('/whatsapp/sessions')
      const sessList = Array.isArray(data) ? data : []
      setSessions(sessList)
      setTestModal((prev) => {
        if (!prev) return null
        const updated = sessList.find((s) => (s.id || s.name) === (prev.id || prev.name))
        return updated || prev
      })
      if (sessList.length > 0 && !bulkSession) {
        const conn = sessList.find((s) => (s.status || '').toLowerCase().includes('connect') || (s.status || '').toLowerCase() === 'working')
        setBulkSession((conn && (conn.id || conn.name)) || sessList[0].id || sessList[0].name)
      }
    } catch (e) {
      setErr(e.message || 'Could not load WhatsApp sessions')
    } finally {
      setLoading(false)
    }
  }

  const loadTemplates = async () => {
    setTemplatesLoading(true)
    try {
      const data = await api('/whatsapp/templates')
      setTemplates(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('Templates load:', e.message)
    } finally {
      setTemplatesLoading(false)
    }
  }

  const loadCustomersForBulk = async (statusFilter = '') => {
    try {
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}&limit=150` : '?limit=150'
      const res = await api('/customers' + q)
      setCandidateCustomers(res.customers || [])
    } catch {
      setCandidateCustomers([])
    }
  }

  useEffect(() => {
    loadSessions()
    loadTemplates()
    loadCustomersForBulk()
    return () => stopPolling()
  }, [])

  useEffect(() => {
    loadCustomersForBulk(bulkFilterStatus)
  }, [bulkFilterStatus])

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  // Handle Session Creation
  const handleCreateSession = async (e) => {
    e.preventDefault()
    const cleanName = sessionName
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    if (!cleanName) return
    setBusy(true)
    setErr('')
    try {
      const res = await api('/whatsapp/sessions', {
        method: 'POST',
        body: { name: cleanName }
      })
      const sid = res.id || (res.data && res.data.id) || cleanName
      setShowCreate(false)
      setSessionName('')
      setOkMsg(`Session "${sid}" created! Starting engine…`)
      loadSessions()
      openQrModal(sid, res.name || cleanName)
    } catch (e) {
      setErr(e.message || 'Failed to create WhatsApp session')
    } finally {
      setBusy(false)
    }
  }

  const handleConnectSuccess = (displayName) => {
    stopPolling()
    setQrModal((prev) => (prev ? { ...prev, status: 'CONNECTED', qr: null } : null))
    setOkMsg(`🎉 WhatsApp session "${displayName}" connected successfully! You can now send follow-ups and messages.`)
    loadSessions()
    setTimeout(() => {
      setQrModal(null)
      loadSessions()
    }, 1800)
  }

  // Open QR modal and poll status
  const openQrModal = async (sid, name) => {
    stopPolling()
    const found = sessions.find((x) => (x.name && x.name.toLowerCase() === String(sid).toLowerCase()) || x.id === sid)
    const realId = (found && (found.id || found.session_id)) || sid
    const displayName = (found && found.name) || name || sid

    setQrModal({ id: realId, name: displayName, qr: null, status: 'STARTING' })
    setQrLoading(true)

    try {
      await api(`/whatsapp/sessions/${encodeURIComponent(realId)}/start`, { method: 'POST' })
    } catch (e) {
      console.warn('Start trigger:', e.message)
    }

    const fetchQr = async () => {
      try {
        // 1. Check actual session connection status on every tick
        try {
          const sCheck = await api(`/whatsapp/sessions/${encodeURIComponent(realId)}/status`)
          const sst = ((sCheck && (sCheck.status || sCheck.data?.status)) || '').toLowerCase()
          const sphone = sCheck?.phone || sCheck?.data?.phone || sCheck?.me?.id || sCheck?.me?.user
          const isOnline = (
            sst.includes('work') ||
            sst.includes('open') ||
            sst.includes('auth') ||
            sst.includes('ready') ||
            sst.includes('pair') ||
            sst.includes('logged') ||
            (sst.includes('connect') && !sst.includes('ing')) ||
            Boolean(sphone)
          )
          if (isOnline) {
            handleConnectSuccess(displayName)
            return
          }
        } catch {
          // continue checking QR
        }

        // 2. Query QR endpoint
        let qrData = null
        try {
          qrData = await api(`/whatsapp/sessions/${encodeURIComponent(realId)}/qr`)
        } catch (e) {
          const errMsg = (e.message || '').toLowerCase()
          if (errMsg.includes('already connect') || errMsg.includes('work') || errMsg.includes('open')) {
            handleConnectSuccess(displayName)
            return
          }
        }

        if (!qrData) return

        const qrRaw = qrData.qr_code || qrData.qr || qrData.value || qrData.data || qrData.qrcode || qrData.raw || ''
        const statusStr = (qrData.status || '').toLowerCase()

        const isConnectedStatus = (
          (statusStr.includes('connect') && !statusStr.includes('ing')) ||
          statusStr.includes('work') ||
          statusStr.includes('auth') ||
          statusStr.includes('open') ||
          statusStr.includes('ready') ||
          statusStr.includes('pair') ||
          statusStr.includes('logged') ||
          Boolean(qrData.phone) ||
          Boolean(qrData.connected) ||
          Boolean(qrData.me)
        )

        const isConnectedMsg = (
          (qrData.message && qrData.message.toLowerCase().includes('already connect')) ||
          (qrData.detail && String(qrData.detail).toLowerCase().includes('already connect'))
        )

        if (isConnectedStatus || isConnectedMsg) {
          handleConnectSuccess(displayName)
          return
        }

        const isSyncing = (
          sst.includes('scan') ||
          sst.includes('auth') ||
          sst.includes('sync') ||
          sst.includes('log') ||
          sst.includes('pair') ||
          statusStr.includes('scan') ||
          statusStr.includes('auth') ||
          statusStr.includes('sync') ||
          statusStr.includes('log') ||
          statusStr.includes('pair')
        )

        if (qrRaw) {
          setQrModal((prev) => {
            if (!prev) return null
            if (isSyncing) return { ...prev, qr: qrRaw, status: 'SYNCING' }
            if (prev.qr === qrRaw && prev.status === (qrData.status || 'SCAN_QR_CODE')) return prev
            return { ...prev, qr: qrRaw, status: qrData.status || 'SCAN_QR_CODE' }
          })
        } else {
          setQrModal((prev) => {
            if (!prev) return null
            // If QR was previously shown and is now gone, phone scanned it and WhatsApp is logging in!
            const nextStatus = (prev.qr || isSyncing) ? 'SYNCING' : (qrData.status || 'STARTING')
            if (prev.status === nextStatus) return prev
            return { ...prev, status: nextStatus }
          })
        }
      } catch (e) {
        console.warn('Waiting for QR...', e.message)
      } finally {
        setQrLoading(false)
      }
    }

    await fetchQr()
    pollTimerRef.current = setInterval(fetchQr, 2000)
  }

  const closeQrModal = () => {
    stopPolling()
    setQrModal(null)
    loadSessions()
  }

  const restartAndFreshQr = async () => {
    if (!qrModal) return
    setQrLoading(true)
    const sid = qrModal.id
    const sname = qrModal.name
    setQrModal((prev) => (prev ? { ...prev, qr: null, status: 'RESTARTING' } : null))
    try {
      await api(`/whatsapp/sessions/${encodeURIComponent(sid)}/stop`, { method: 'POST' })
    } catch (e) {
      console.warn('Stop notice:', e.message)
    }
    setTimeout(() => {
      openQrModal(sid, sname)
    }, 1500)
  }

  const handleStart = async (sid) => {
    setBusy(true)
    try {
      await api(`/whatsapp/sessions/${encodeURIComponent(sid)}/start`, { method: 'POST' })
      setOkMsg(`Started session "${sid}"`)
      loadSessions()
      openQrModal(sid)
    } catch (e) {
      setErr(e.message || 'Failed to start session')
    } finally {
      setBusy(false)
    }
  }

  const handleReconnect = async (sid) => {
    setBusy(true)
    setErr('')
    setOkMsg('')
    try {
      await api(`/whatsapp/sessions/${encodeURIComponent(sid)}/reconnect`, { method: 'POST' })
      setOkMsg(`🔄 Reconnecting session "${sid}"... restoring WhatsApp connection.`)
      setTimeout(() => {
        loadSessions()
      }, 3000)
    } catch (e) {
      setErr(e.message || 'Failed to reconnect session')
    } finally {
      setBusy(false)
    }
  }

  const handleStop = async (sid) => {
    if (!window.confirm(`Are you sure you want to stop session "${sid}"?`)) return
    setBusy(true)
    try {
      await api(`/whatsapp/sessions/${encodeURIComponent(sid)}/stop`, { method: 'POST' })
      setOkMsg(`Stopped session "${sid}"`)
      loadSessions()
    } catch (e) {
      setErr(e.message || 'Failed to stop session')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (sid) => {
    if (!window.confirm(`Delete WhatsApp session "${sid}" permanently?`)) return
    setBusy(true)
    try {
      await api(`/whatsapp/sessions/${encodeURIComponent(sid)}`, { method: 'DELETE' })
      setOkMsg(`Session "${sid}" deleted.`)
      loadSessions()
    } catch (e) {
      setErr(e.message || 'Failed to delete session')
    } finally {
      setBusy(false)
    }
  }

  const handleSendTest = async (e) => {
    e.preventDefault()
    if (!testPhone.trim()) return
    setBusy(true)
    setTestResult(null)
    const finalMsg = renderTestPreview(testMsg, testVars)
    try {
      const res = await api('/whatsapp/send-test', {
        method: 'POST',
        body: {
          session_id: testModal.id || testModal.name,
          phone: testPhone.trim(),
          template_id: testTemplateId ? String(testTemplateId) : undefined,
          message: finalMsg,
          template_variables: testVars,
          header_image_url: testHeaderImage || undefined
        }
      })
      setTestResult({ ok: true, data: res, sentMessage: finalMsg })
    } catch (e) {
      setTestResult({ ok: false, error: e.message })
    } finally {
      setBusy(false)
    }
  }

  // --- Templates Management ---
  const insertTagIntoBody = (tag) => {
    const el = bodyTextareaRef.current
    if (!el) {
      setTplForm((prev) => ({ ...prev, body: prev.body + ' ' + tag }))
      return
    }
    const start = el.selectionStart || 0
    const end = el.selectionEnd || 0
    const text = tplForm.body || ''
    const updated = text.substring(0, start) + tag + text.substring(end)
    setTplForm((prev) => ({ ...prev, body: updated }))
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + tag.length, start + tag.length)
    }, 50)
  }

  const openCreateTemplate = () => {
    setEditingTemplateId(null)
    setTplForm(blankTemplate)
    setShowCreateTemplate(true)
  }

  const openEditTemplate = (t) => {
    setEditingTemplateId(t.id)
    setTplForm({
      name: t.name || '',
      category: t.category || 'Marketing (Promotions)',
      header_type: t.header_type || 'None',
      header_caption: t.header_caption || '',
      header_media_url: t.header_media_url || '',
      body: t.body || '',
      footer: t.footer || '',
      buttons: t.buttons || ''
    })
    setShowCreateTemplate(true)
  }

  const handleSaveTemplate = async (e) => {
    e.preventDefault()
    if (!tplForm.name.trim() || !tplForm.body.trim()) return
    setBusy(true)
    setErr('')
    try {
      if (editingTemplateId) {
        await api(`/whatsapp/templates/${editingTemplateId}`, {
          method: 'PUT',
          body: { ...tplForm, id: editingTemplateId }
        })
        setOkMsg(`Template "${tplForm.name}" updated successfully!`)
      } else {
        await api('/whatsapp/templates', {
          method: 'POST',
          body: tplForm
        })
        setOkMsg(`Template "${tplForm.name}" created successfully!`)
      }
      setShowCreateTemplate(false)
      setEditingTemplateId(null)
      setTplForm(blankTemplate)
      loadTemplates()
    } catch (e) {
      setErr(e.message || 'Failed to save template')
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteTemplate = async (id, name) => {
    if (!window.confirm(`Delete template "${name}"?`)) return
    try {
      await api(`/whatsapp/templates/${id}`, { method: 'DELETE' })
      setOkMsg(`Template "${name}" deleted.`)
      loadTemplates()
    } catch (e) {
      setErr(e.message || 'Failed to delete template')
    }
  }

  // --- Bulk Messaging ---
  const handleSelectTemplateForBulk = (tid) => {
    setBulkTemplateId(tid)
    const t = templates.find((x) => String(x.id) === String(tid))
    if (t) {
      setBulkMessage(t.body)
    }
  }

  const handleStartBulkSend = async (e) => {
    e.preventDefault()
    if (!bulkSession) {
      alert('Please select an active WhatsApp session to send from.')
      return
    }
    if (!bulkMessage.trim()) {
      alert('Please enter a message or select a template.')
      return
    }
    if (candidateCustomers.length === 0) {
      alert('No customers match the current filter.')
      return
    }

    if (!window.confirm(`Send WhatsApp message to ${candidateCustomers.length} customers?`)) return

    setBulkRunning(true)
    setBulkProgress(null)
    setErr('')

    try {
      const res = await api('/whatsapp/send-bulk', {
        method: 'POST',
        body: {
          session_id: bulkSession,
          customer_ids: candidateCustomers.map((c) => c.id),
          message: bulkMessage,
          log_followup: bulkLogFollowup,
          delay_seconds: Number(bulkDelay) || 1.5
        }
      })
      setBulkProgress(res)
      setOkMsg(`✅ Bulk send finished: ${res.sent} sent successfully, ${res.failed} failed.`)
    } catch (e) {
      setErr('Bulk send error: ' + e.message)
    } finally {
      setBulkRunning(false)
    }
  }

  const getQrImgSrc = (qr) => {
    if (!qr) return ''
    if (qr.startsWith('data:image') || qr.startsWith('http://') || qr.startsWith('https://')) return qr
    if (qr.length > 200 && !qr.includes(' ')) return `data:image/png;base64,${qr}`
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(qr)}`
  }

  const getStatusBadge = (s) => {
    const st = (s.status || '').toLowerCase()
    if (st.includes('connect') || st === 'working' || st === 'authenticated' || st === 'open') {
      return <span className="badge s5" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>🟢 Connected</span>
    }
    if (st.includes('scan') || st.includes('qr')) {
      return <span className="badge warn" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>🟡 Scan QR Code</span>
    }
    if (st.includes('start') || st.includes('init')) {
      return <span className="badge s3" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>🔵 Starting…</span>
    }
    return <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>⚪ {s.status || 'Offline'}</span>
  }

  return (
    <>
      <div className="row" style={{ marginBottom: '1.25rem', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            💬 WhatsApp Integration &amp; Templates
          </h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Pair WhatsApp accounts, design interactive message templates with placeholders, and send automated follow-up messages.
          </p>
        </div>
      </div>

      {err && <div className="flash error" style={{ marginBottom: '1rem' }}>{err}</div>}
      {okMsg && <div className="flash ok" style={{ marginBottom: '1rem' }}>{okMsg}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid var(--line)', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={`btn ${tab === 'sessions' ? 'pri' : 'alt'}`}
          onClick={() => setTab('sessions')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          📱 WhatsApp Sessions ({sessions.length})
        </button>
        <button
          type="button"
          className={`btn ${tab === 'templates' ? 'pri' : 'alt'}`}
          onClick={() => setTab('templates')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          ✨ Message Templates ({templates.length})
        </button>
        <button
          type="button"
          className={`btn ${tab === 'bulk' ? 'pri' : 'alt'}`}
          onClick={() => setTab('bulk')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          📢 Bulk WhatsApp / SMS
        </button>
      </div>

      {/* TAB 1: SESSIONS */}
      {tab === 'sessions' && (
        <div className="card">
          <div className="row" style={{ alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Connected WhatsApp Numbers</h2>
              <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
                Each session represents one linked phone number. Point camera to link new accounts.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn pri" onClick={() => setShowCreate(true)}>
                + Connect New WhatsApp
              </button>
              <button className="btn alt" onClick={loadSessions} disabled={loading}>
                🔄 Refresh Status
              </button>
            </div>
          </div>

          {loading && <p className="muted pad">Loading sessions…</p>}

          {!loading && sessions.length === 0 && (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.8rem', marginBottom: '0.5rem' }}>📱</div>
              <h3 style={{ margin: '0 0 0.5rem' }}>No WhatsApp Sessions Linked Yet</h3>
              <p className="muted" style={{ maxWidth: '440px', margin: '0 auto 1.25rem' }}>
                Create a new session name (e.g. "sales-desk" or "buyp") and scan the QR code with WhatsApp on your phone.
              </p>
              <button className="btn pri" onClick={() => setShowCreate(true)}>
                + Connect WhatsApp Now
              </button>
            </div>
          )}

          {!loading && sessions.length > 0 && (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Session Name</th>
                    <th>Session ID</th>
                    <th>Connection Status</th>
                    <th>Phone Number</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const sid = s.id || s.name
                    const isConnected = (s.status || '').toLowerCase().includes('connect') || (s.status || '').toLowerCase() === 'working' || (s.status || '').toLowerCase() === 'open'
                    const phoneNum = s.phone || (s.me && s.me.id ? s.me.id.split('@')[0] : '—')

                    return (
                      <tr key={sid}>
                        <td style={{ fontWeight: 600, color: '#1e293b' }}>
                          {s.name || sid}
                        </td>
                        <td>
                          <code style={{ fontSize: '0.82rem', background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                            {sid}
                          </code>
                        </td>
                        <td>{getStatusBadge(s)}</td>
                        <td style={{ fontWeight: phoneNum !== '—' ? 600 : 400 }}>{phoneNum}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {!isConnected && (
                            <button
                              className="btn alt"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem', marginRight: '0.3rem' }}
                              onClick={() => openQrModal(sid, s.name)}
                            >
                              📷 Scan QR
                            </button>
                          )}

                          {isConnected && (
                            <button
                              className="btn success"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem', marginRight: '0.3rem' }}
                              onClick={() => { setTestModal(s); setTestResult(null); }}
                            >
                              💬 Test Message
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn alt"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem', marginRight: '0.3rem', color: '#0284c7', borderColor: '#38bdf8' }}
                            onClick={() => handleReconnect(sid)}
                            disabled={busy}
                            title="Reconnect and restore WhatsApp session"
                          >
                            🔄 Reconnect
                          </button>

                          {isConnected ? (
                            <button
                              className="btn alt"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem', marginRight: '0.3rem' }}
                              onClick={() => handleStop(sid)}
                              disabled={busy}
                            >
                              ⏹ Stop
                            </button>
                          ) : (
                            <button
                              className="btn alt"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem', marginRight: '0.3rem' }}
                              onClick={() => handleStart(sid)}
                              disabled={busy}
                            >
                              ▶ Start
                            </button>
                          )}

                          <button
                            className="btn danger"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
                            onClick={() => handleDelete(sid)}
                            disabled={busy}
                          >
                            🗑 Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TEMPLATES */}
      {tab === 'templates' && (
        <div>
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div className="row" style={{ alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>✨ WhatsApp Message Templates</h2>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
                  Create reusable templates with tags like <code>{`{{customer_name}}`}</code> and <code>{`{{business_name}}`}</code> for one-click follow-up messaging.
                </p>
              </div>
              <button className="btn pri" onClick={openCreateTemplate}>
                ✨ Create New Message Template
              </button>
            </div>
          </div>

          {templatesLoading && <p className="muted pad">Loading templates…</p>}

          {!templatesLoading && templates.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📝</div>
              <h3>No Message Templates Yet</h3>
              <p className="muted">Create your first template to speed up customer follow-ups and notifications.</p>
              <button className="btn pri" onClick={openCreateTemplate}>
                + Create Template
              </button>
            </div>
          )}

          {!templatesLoading && templates.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
              {templates.map((t) => (
                <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#fff', border: '1px solid var(--line)' }}>
                  <div>
                    <div className="row" style={{ alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <div>
                        <span className="badge" style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#475569', textTransform: 'uppercase', fontWeight: 600 }}>
                          {t.category || 'Utility'}
                        </span>
                        <h3 style={{ margin: '0.35rem 0 0', fontSize: '1.1rem', color: '#1e293b' }}>
                          {t.name}
                        </h3>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="link"
                          style={{ color: '#2563eb', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => openEditTemplate(t)}
                          title="Edit this template"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          className="link"
                          style={{ color: '#ef4444', fontSize: '0.85rem', cursor: 'pointer' }}
                          onClick={() => handleDeleteTemplate(t.id, t.name)}
                          title="Delete template"
                        >
                          🗑 Delete
                        </button>
                      </div>
                    </div>

                    {t.header_type && t.header_type !== 'None' && (
                      <div style={{ background: '#f8fafc', padding: '0.4rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem', color: '#0369a1', marginBottom: '0.6rem', border: '1px solid #e0f2fe' }}>
                        📎 Header Component: <b>{t.header_type}</b> {t.header_caption && `— "${t.header_caption}"`}
                      </div>
                    )}

                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '0.85rem',
                      fontSize: '0.88rem',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap',
                      color: '#334155',
                      marginBottom: '0.75rem'
                    }}>
                      {t.body}
                    </div>

                    {t.footer && (
                      <div className="muted" style={{ fontSize: '0.78rem', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                        Footer: {t.footer}
                      </div>
                    )}

                    {t.buttons && (
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        {t.buttons.split(',').map((b, i) => (
                          <span key={i} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', color: '#0284c7' }}>
                            🔘 {b.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn alt"
                      style={{ fontSize: '0.82rem', padding: '0.35rem 0.65rem', color: '#1d4ed8' }}
                      onClick={() => openEditTemplate(t)}
                      title="Edit this template"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="btn success"
                      style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', background: '#25D366', color: '#fff', borderColor: '#16a34a' }}
                      onClick={() => openTestModalForTemplate(t)}
                      title="Test this template with dynamic placeholder values"
                    >
                      🧪 Test Template
                    </button>
                    <button
                      className="btn alt"
                      style={{ fontSize: '0.82rem', padding: '0.35rem 0.65rem' }}
                      onClick={() => {
                        setTab('bulk')
                        handleSelectTemplateForBulk(t.id)
                      }}
                    >
                      📢 Use in Bulk
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BULK MESSAGING */}
      {tab === 'bulk' && (
        <div className="card" style={{ maxWidth: '750px', margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>📢 Bulk WhatsApp &amp; SMS Campaign</h2>
          <p className="muted" style={{ fontSize: '0.88rem', margin: '0 0 1.25rem' }}>
            Dispatch personalized WhatsApp messages to filtered customer groups. Each message automatically replaces tags with the customer&apos;s personal name and company details.
          </p>

          <form onSubmit={handleStartBulkSend}>
            <div className="grid2">
              <label>
                Sending WhatsApp Session *
                <select value={bulkSession} onChange={(e) => setBulkSession(e.target.value)} required>
                  <option value="">-- Choose connected session --</option>
                  {sessions.map((s) => (
                    <option key={s.id || s.name} value={s.id || s.name}>
                      {s.name} ({s.status || 'Offline'})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Filter Customers by Status
                <select value={bulkFilterStatus} onChange={(e) => setBulkFilterStatus(e.target.value)}>
                  <option value="">All Active Customers ({candidateCustomers.length})</option>
                  <option value="Not Contacted">Not Contacted</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Follow-up Needed">Follow-up Needed</option>
                  <option value="Follow-up Scheduled">Follow-up Scheduled</option>
                  <option value="Expired">Expired</option>
                </select>
              </label>
            </div>

            <label>
              Choose Template (Optional)
              <select value={bulkTemplateId} onChange={(e) => handleSelectTemplateForBulk(e.target.value)}>
                <option value="">-- Custom Message (No Template) --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.category})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Message Content *
              <textarea
                rows={5}
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value)}
                placeholder="Type your message with {{customer_name}}, {{business_name}}, {{trial_end_date}}..."
                required
              />
            </label>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '-0.3rem 0 1rem' }}>
              <span className="muted" style={{ fontSize: '0.8rem', alignSelf: 'center' }}>Insert tags:</span>
              {['{{customer_name}}', '{{business_name}}', '{{trial_end_date}}', '{{plan_name}}', '{{feedback}}'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="btn alt"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: '#f1f5f9' }}
                  onClick={() => setBulkMessage((prev) => prev + ' ' + tag)}
                >
                  + {tag}
                </button>
              ))}
            </div>

            <div className="grid2" style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
              <label style={{ margin: 0 }}>
                Safety Delay Between Messages (Seconds)
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="10"
                  value={bulkDelay}
                  onChange={(e) => setBulkDelay(e.target.value)}
                />
              </label>

              <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={bulkLogFollowup}
                  onChange={(e) => setBulkLogFollowup(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '0.88rem' }}>
                  <b>Record Follow-up in History</b><br />
                  <span className="muted">Logs "WhatsApp / Message sent" in each customer's history.</span>
                </span>
              </label>
            </div>

            {candidateCustomers.length > 0 && (
              <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.85rem', color: '#1e40af' }}>
                🎯 Target count: <b>{candidateCustomers.length} customers</b> will receive this message.
              </div>
            )}

            {bulkProgress && (
              <div style={{ marginBottom: '1.25rem', padding: '1rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: '#15803d' }}>Campaign Results</h4>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
                  Total: <b>{bulkProgress.total}</b> | Sent: <b style={{ color: '#15803d' }}>{bulkProgress.sent}</b> | Failed: <b style={{ color: '#b91c1c' }}>{bulkProgress.failed}</b>
                </p>
                {bulkProgress.errors && bulkProgress.errors.length > 0 && (
                  <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, fontSize: '0.8rem', color: '#b91c1c' }}>
                    {bulkProgress.errors.map((er, idx) => <li key={idx}>{er}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="submit"
                className="btn pri"
                disabled={bulkRunning || !bulkMessage.trim() || candidateCustomers.length === 0}
                style={{ padding: '0.65rem 1.4rem', fontSize: '0.95rem' }}
              >
                {bulkRunning ? '🚀 Sending Campaign…' : `🚀 Send WhatsApp to ${candidateCustomers.length} Customers`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CREATE MESSAGE TEMPLATE (Matches user screenshot) */}
      {showCreateTemplate && (
        <div style={modalOverlayStyle}>
          <div style={{
            background: '#090e17',
            color: '#f8fafc',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            width: '95%',
            maxWidth: '560px',
            padding: '1.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
            maxHeight: '92vh',
            overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#34d399' }}>{editingTemplateId ? '✏️' : '✨'}</span>
                {editingTemplateId ? `Edit Message Template: ${tplForm.name || ''}` : 'Create New Message Template'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowCreateTemplate(false)
                  setEditingTemplateId(null)
                  setTplForm(blankTemplate)
                }}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTemplate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                    Template Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. otp_message, order_status"
                    value={tplForm.name}
                    onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: '8px',
                      padding: '0.55rem 0.75rem',
                      fontSize: '0.88rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                    Category *
                  </label>
                  <select
                    value={tplForm.category}
                    onChange={(e) => setTplForm({ ...tplForm, category: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: '8px',
                      padding: '0.55rem 0.75rem',
                      fontSize: '0.88rem'
                    }}
                  >
                    <option value="Marketing (Promotions)">Marketing (Promotions)</option>
                    <option value="Utility">Utility</option>
                    <option value="Authentication">Authentication</option>
                    <option value="Service Follow-up">Service Follow-up</option>
                  </select>
                </div>
              </div>

              {/* Header Media Component */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Header Media Component
                </label>
                <select
                  value={tplForm.header_type}
                  onChange={(e) => setTplForm({ ...tplForm, header_type: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #10b981',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    padding: '0.55rem 0.75rem',
                    fontSize: '0.88rem'
                  }}
                >
                  <option value="None">None (Text only)</option>
                  <option value="TEXT">TEXT (Header Title)</option>
                  <option value="IMAGE">IMAGE (Photo Attachment)</option>
                  <option value="VIDEO">VIDEO (MP4 clip)</option>
                  <option value="AUDIO">AUDIO (Voice Clip)</option>
                  <option value="DOCUMENT (PDF / Doc Header Attachment)">DOCUMENT (PDF / Doc Header Attachment)</option>
                </select>
              </div>

              {/* Media Card selector matching user screenshot */}
              {tplForm.header_type !== 'None' && (
                <div style={{
                  background: '#09111e',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.82rem', color: '#34d399', fontWeight: 600 }}>
                      📎 ATTACH MEDIA HEADER FROM DEVICE
                    </span>
                    <span style={{ fontSize: '0.78rem', color: '#10b981' }}>Device Gallery / Explorer</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.65rem' }}>
                    {[
                      { icon: '🖼️', label: 'Image / Photo', sub: 'JPG, PNG, WebP', key: 'IMAGE' },
                      { icon: '🎥', label: 'Video', sub: 'MP4, MKV, MOV', key: 'VIDEO' },
                      { icon: '🎵', label: 'Audio / Voice', sub: 'MP3, WAV, M4A', key: 'AUDIO' },
                      { icon: '📄', label: 'Document / PDF', sub: 'PDF, Word, ZIP', key: 'DOCUMENT (PDF / Doc Header Attachment)' }
                    ].map((item) => {
                      const isSel = tplForm.header_type === item.key
                      return (
                        <div
                          key={item.key}
                          onClick={() => setTplForm({ ...tplForm, header_type: item.key })}
                          style={{
                            background: isSel ? '#1f1325' : '#0f172a',
                            border: isSel ? '2px solid #e11d48' : '1px solid #334155',
                            borderRadius: '8px',
                            padding: '0.65rem 0.35rem',
                            textAlign: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ fontSize: '1.3rem', marginBottom: '0.2rem' }}>{item.icon}</div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: isSel ? '#f43f5e' : '#f8fafc' }}>{item.label}</div>
                          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{item.sub}</div>
                          {isSel && <div style={{ fontSize: '0.6rem', color: '#e11d48', fontWeight: 700, marginTop: '0.2rem' }}>REQUIRED HEADER</div>}
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.72rem', color: '#64748b' }}>
                    Supports mobile phone gallery &amp; computer file explorer • Up to 100 MB per file
                  </div>
                </div>
              )}

              {/* Header Caption / Title */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Header Caption / Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Official Monthly Statement"
                  value={tplForm.header_caption}
                  onChange={(e) => setTplForm({ ...tplForm, header_caption: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    padding: '0.55rem 0.75rem',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              {/* Message Body */}
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600 }}>
                    Message Body *
                  </label>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Use {'{{1}}'}, {'{{customer_name}}'} for placeholders
                  </span>
                </div>
                <textarea
                  ref={bodyTextareaRef}
                  rows={4}
                  placeholder="e.g. '{{customer_name}}' this is your follow-up message regarding {{business_name}}..."
                  value={tplForm.body}
                  onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    padding: '0.65rem 0.75rem',
                    fontSize: '0.88rem',
                    lineHeight: '1.45'
                  }}
                />
              </div>

              {/* Insert tags chips */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Insert tag:</span>
                {[
                  '{{customer_name}}',
                  '{{business_name}}',
                  '{{trial_end_date}}',
                  '{{plan_name}}',
                  '{{feedback}}',
                  '{{1}}',
                  '{{2}}'
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertTagIntoBody(tag)}
                    style={{
                      background: '#132338',
                      border: '1px solid #1e3a5f',
                      color: '#38bdf8',
                      borderRadius: '4px',
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* Footer Text */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Footer Text (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Reply STOP to unsubscribe."
                  value={tplForm.footer}
                  onChange={(e) => setTplForm({ ...tplForm, footer: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    padding: '0.55rem 0.75rem',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Action Buttons (Optional, comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Contact Support, View Website"
                  value={tplForm.buttons}
                  onChange={(e) => setTplForm({ ...tplForm, buttons: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    padding: '0.55rem 0.75rem',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              {/* Form Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateTemplate(false)
                    setEditingTemplateId(null)
                    setTplForm(blankTemplate)
                  }}
                  style={{
                    background: '#1e293b',
                    border: 'none',
                    color: '#cbd5e1',
                    borderRadius: '8px',
                    padding: '0.55rem 1.1rem',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !tplForm.name.trim() || !tplForm.body.trim()}
                  style={{
                    background: '#059669',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    padding: '0.55rem 1.25rem',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {busy ? 'Saving…' : (editingTemplateId ? '💾 Save Changes' : 'Create & Generate Code')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Session */}
      {showCreate && (
        <div style={modalOverlayStyle}>
          <div className="card narrow" style={{ background: '#fff', margin: 'auto', width: '92%', maxWidth: '440px', boxShadow: 'var(--shadow-lg)' }}>
            <div className="row" style={{ alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Connect WhatsApp Account</h2>
              <button className="link" onClick={() => setShowCreate(false)} style={{ fontSize: '1.2rem', color: '#64748b' }}>✕</button>
            </div>
            <p className="muted" style={{ fontSize: '0.88rem', margin: '0 0 1rem' }}>
              Give this WhatsApp account a clean name (lowercase letters, numbers, and hyphens only).
            </p>
            <form onSubmit={handleCreateSession}>
              <label>
                Session Name / Identifier *
                <input
                  type="text"
                  placeholder="e.g. sales-team or buyp"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  autoFocus
                  required
                />
              </label>
              {sessionName.trim() && (
                <p className="muted" style={{ fontSize: '0.82rem', margin: '-0.3rem 0 0.8rem' }}>
                  Gateway ID: <code style={{ color: 'var(--pri)' }}>{sessionName.toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')}</code>
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn alt" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn pri" disabled={busy || !sessionName.trim()}>
                  {busy ? 'Creating…' : 'Create & Show QR Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: QR Code Scanner */}
      {qrModal && (
        <div style={modalOverlayStyle}>
          <div className="card" style={{ background: '#fff', margin: 'auto', width: '92%', maxWidth: '480px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
            <div className="row" style={{ alignItems: 'center', marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Link WhatsApp: {qrModal.name}</h2>
              <button className="link" onClick={closeQrModal} style={{ fontSize: '1.2rem', color: '#64748b' }}>✕</button>
            </div>

            {qrModal.status === 'CONNECTED' ? (
              <div style={{ padding: '2rem 1.5rem' }}>
                <div style={{ fontSize: '3.8rem', marginBottom: '0.5rem' }}>🎉</div>
                <h3 style={{ color: '#047857', margin: '0 0 0.5rem', fontSize: '1.4rem' }}>
                  Successfully Connected!
                </h3>
                <p style={{ color: '#334155', fontSize: '0.95rem', margin: '0 0 1rem' }}>
                  WhatsApp session <b>{qrModal.name}</b> is now active and linked to your phone.
                </p>
                <div className="badge s5" style={{ display: 'inline-flex', padding: '0.4rem 0.85rem', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                  🟢 Status: Active &amp; Ready
                </div>
                <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                  Returning to WhatsApp dashboard…
                </p>
                <button className="btn pri" onClick={closeQrModal} style={{ marginTop: '1.2rem', minWidth: '130px' }}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <p className="muted" style={{ fontSize: '0.88rem', margin: '0.2rem 0 1rem' }}>
                  1. Open WhatsApp on your phone<br />
                  2. Tap <b>Settings</b> or <b>Menu (⋮)</b> &gt; <b>Linked Devices</b><br />
                  3. Tap <b>Link a Device</b> and point your camera here
                </p>

                <div style={{
                  minHeight: '260px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f8fafc',
                  border: '1px solid var(--line)',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1rem'
                }}>
                  {qrModal.status === 'SYNCING' || qrModal.status === 'LOGGING_IN' || qrModal.status === 'AUTHENTICATING' ? (
                    <div style={{ padding: '2rem 1.25rem', textAlign: 'center', width: '100%' }}>
                      <div className="call-pulse" style={{ margin: '0 auto 1.25rem', width: '32px', height: '32px', background: '#16a34a' }} />
                      <h3 style={{ margin: '0 0 0.5rem', color: '#166534', fontSize: '1.25rem' }}>
                        📱 QR Code Scanned!
                      </h3>
                      <p style={{ fontWeight: 600, color: '#1e293b', margin: '0 0 0.75rem', fontSize: '1rem' }}>
                        🔄 Linking device &amp; loading chats…
                      </p>
                      <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 1.25rem', color: '#475569' }}>
                        WhatsApp is encrypting keys and synchronizing messages with ServicePro.
                      </p>
                      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '0.85rem 1rem', textAlign: 'left', fontSize: '0.85rem', color: '#065f46', margin: '0 auto', maxWidth: '380px' }}>
                        <b style={{ display: 'block', marginBottom: '0.25rem', color: '#047857' }}>⚠️ KEEP PHONE SCREEN ON:</b>
                        <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.5 }}>
                          <li>Keep WhatsApp open on your phone right now.</li>
                          <li>Wait for &quot;Logging in…&quot; to complete (10–20s).</li>
                          <li>Do not switch apps or lock your phone.</li>
                        </ul>
                      </div>
                    </div>
                  ) : qrModal.qr ? (
                    <div>
                      <img
                        src={getQrImgSrc(qrModal.qr)}
                        alt="WhatsApp QR Code"
                        style={{ maxWidth: '240px', maxHeight: '240px', width: '100%', height: 'auto', borderRadius: '8px', display: 'block', margin: '0 auto 0.5rem' }}
                      />
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309', fontWeight: 500 }}>
                        ⏳ Scan within 20 seconds before QR expires
                      </p>
                    </div>
                  ) : (
                    <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                      <div className="call-pulse" style={{ margin: '0 auto 1rem', width: '22px', height: '22px', background: 'var(--pri)' }} />
                      <p style={{ fontWeight: 600, color: '#1e293b', margin: '0 0 0.35rem' }}>
                        {qrModal.status === 'STARTING' || qrModal.status === 'INITIALIZING' || qrModal.status === 'RESTARTING'
                          ? 'Starting WhatsApp Engine…'
                          : 'Generating Fresh QR Code…'}
                      </p>
                      <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 1rem' }}>
                        The gateway takes 3–6 seconds to launch the engine and generate your pairing QR code. Please wait…
                      </p>
                      <button
                        type="button"
                        className="btn alt"
                        style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
                        onClick={() => openQrModal(qrModal.id, qrModal.name)}
                        disabled={qrLoading}
                      >
                        ⚡ Force Start Engine &amp; Refresh
                      </button>
                    </div>
                  )}
                </div>

                <div className="row" style={{ justifyContent: 'center', gap: '0.6rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn alt" onClick={restartAndFreshQr} disabled={qrLoading} title="Stop and restart engine to get brand new QR">
                    ⚡ Force Restart &amp; Fresh QR
                  </button>
                  <button className="btn alt" onClick={() => openQrModal(qrModal.id, qrModal.name)} disabled={qrLoading}>
                    🔄 Refresh QR
                  </button>
                  <a
                    href={`http://156.67.104.74:8029/api/sessions/${encodeURIComponent(qrModal.id)}/qr`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn alt"
                    style={{ textDecoration: 'none' }}
                  >
                    🔗 Open in Tab
                  </a>
                  <button className="btn pri" onClick={closeQrModal}>
                    Close
                  </button>
                </div>

                <div style={{ marginTop: '0.85rem', padding: '0.65rem 0.85rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', textAlign: 'left', fontSize: '0.8rem', color: '#92400e' }}>
                  <b>Phone shows &quot;Couldn&apos;t link device&quot;?</b>
                  <ul style={{ margin: '0.25rem 0 0 1.1rem', padding: 0, lineHeight: 1.4 }}>
                    <li><b>QR code expired:</b> Click <b>&quot;⚡ Force Restart &amp; Fresh QR&quot;</b> and scan immediately.</li>
                    <li><b>Device Limit:</b> Check WhatsApp &gt; Linked Devices. Maximum 4 devices allowed. Remove any inactive device.</li>
                    <li><b>Network:</b> Ensure phone Wi-Fi/Mobile data is active and stable.</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: Test Message with Dynamic Placeholder Values */}
      {testModal && (
        <div style={modalOverlayStyle}>
          <div className="card narrow" style={{ background: '#fff', margin: 'auto', width: '92%', maxWidth: '540px', boxShadow: 'var(--shadow-lg)', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="row" style={{ alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#166534' }}>
                🧪 Send Test WhatsApp Message
              </h2>
              <button className="link" onClick={() => setTestModal(null)} style={{ fontSize: '1.2rem', color: '#64748b' }}>✕</button>
            </div>

            {testResult && testResult.ok && (
              <div className="flash ok" style={{ marginBottom: '1rem' }}>
                ✅ Message sent successfully to <b>{testPhone}</b>! Check WhatsApp on the recipient device.
              </div>
            )}
            {testResult && !testResult.ok && (
              <div className="flash error" style={{ marginBottom: '1rem' }}>
                ❌ Send failed: {testResult.error}
              </div>
            )}

            <form onSubmit={handleSendTest}>
              <div className="two" style={{ marginBottom: '0.75rem' }}>
                <label style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span>Sending WhatsApp Session *</span>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button
                        type="button"
                        className="link"
                        style={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 600, cursor: 'pointer' }}
                        onClick={() => handleReconnect(testModal.id || testModal.name)}
                        disabled={busy}
                        title="Reconnect WhatsApp session"
                      >
                        🔄 Reconnect
                      </button>
                      <button
                        type="button"
                        className="link"
                        style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}
                        onClick={loadSessions}
                        title="Refresh session status from gateway"
                      >
                        🔄 Refresh
                      </button>
                    </div>
                  </div>
                  <select
                    value={testModal.id || testModal.name}
                    onChange={(e) => {
                      const chosen = sessions.find((s) => (s.id || s.name) === e.target.value)
                      if (chosen) setTestModal(chosen)
                    }}
                  >
                    {sessions.map((s) => (
                      <option key={s.id || s.name} value={s.id || s.name}>
                        {s.name} ({s.status || 'Offline'})
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ margin: 0 }}>
                  Choose Template
                  <select
                    value={testTemplateId}
                    onChange={(e) => handleTestTemplateSelect(e.target.value)}
                  >
                    <option value="">-- Custom Text / Paste Message --</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.category})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Session Status Banner */}
              {(() => {
                const st = (testModal.status || '').toLowerCase()
                const isOnline = (st.includes('connect') && !st.includes('ing')) || st === 'working' || st === 'open' || st === 'authenticated'
                const isSyncing = st.includes('init') || st.includes('start') || st.includes('sync') || (st.includes('connect') && st.includes('ing'))

                if (isOnline) {
                  return (
                    <div style={{ padding: '0.4rem 0.65rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '0.8rem', color: '#15803d', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      🟢 <b>Session is Online:</b> WhatsApp is paired and ready to deliver messages.
                    </div>
                  )
                }
                if (isSyncing) {
                  return (
                    <div style={{ padding: '0.45rem 0.65rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.8rem', color: '#1e40af', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>⏳ <b>Syncing with phone ({testModal.status}):</b> Finishing encryption handshake. Please wait 10–20s...</span>
                      <button
                        type="button"
                        className="btn alt"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                        onClick={loadSessions}
                      >
                        🔄 Check Status
                      </button>
                    </div>
                  )
                }
                return (
                  <div style={{ padding: '0.45rem 0.65rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.8rem', color: '#b91c1c', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>⚠️ <b>Not Linked ({testModal.status || 'Offline'}):</b> Please link via QR code first.</span>
                    <button
                      type="button"
                      className="link"
                      style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}
                      onClick={() => {
                        const sid = testModal.id || testModal.name
                        setTestModal(null)
                        openQrModal(sid, testModal.name)
                      }}
                    >
                      📷 Scan QR
                    </button>
                  </div>
                )
              })()}

              <label>
                Recipient Phone Number (with Country Code) *
                <input
                  type="text"
                  placeholder="e.g. 919876543210"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label>
                Template Message Text (use {'{1}'}, {'{{1}}'}, {'{{customer_name}}'})
                <textarea
                  rows={3}
                  value={testMsg}
                  onChange={(e) => {
                    const newText = e.target.value
                    setTestMsg(newText)
                    const vars = extractVariables(newText)
                    const updated = { ...testVars }
                    vars.forEach((v) => {
                      if (updated[v] === undefined) {
                        updated[v] = v === '1' ? 'Alex Johnson' : v === '2' ? 'Acme Corp' : `Sample ${v}`
                      }
                    })
                    setTestVars(updated)
                  }}
                  placeholder="e.g. Hello {1}, your order {2} has been shipped..."
                  required
                />
              </label>

              {/* Dynamic Variables Inputs */}
              {extractVariables(testMsg).length > 0 && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.85rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#166534', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    ⚡ Dynamic Placeholder Values (Detected in Template):
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: extractVariables(testMsg).length > 1 ? '1fr 1fr' : '1fr', gap: '0.65rem' }}>
                    {extractVariables(testMsg).map((v) => (
                      <label key={v} style={{ margin: 0, fontSize: '0.82rem', color: '#1e293b' }}>
                        Value for <code style={{ color: '#059669', fontWeight: 700 }}>{`{${v}}`}</code>:
                        <input
                          type="text"
                          placeholder={`Enter dynamic value for {${v}}`}
                          value={testVars[v] || ''}
                          onChange={(e) => setTestVars({ ...testVars, [v]: e.target.value })}
                          style={{ marginTop: '0.2rem', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Header Banner Image: File Upload + URL Input (for templates supporting image header) */}
              {(() => {
                const curTpl = templates.find((t) => String(t.id) === String(testTemplateId))
                const isCallAttemptTest = curTpl && (curTpl.name.includes('call_attempt') || curTpl.name.includes('not_attend'))

                if (isCallAttemptTest) {
                  return (
                    <div style={{ padding: '0.45rem 0.65rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem', color: '#475569', marginBottom: '1rem' }}>
                      ℹ️ <b>Pure Text Template:</b> <code>trial_call_attempt_followup</code> is a text-based utility message (no image attachment).
                    </div>
                  )
                }

                return (
                  <div style={{ marginBottom: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label style={{ fontSize: '0.82rem', margin: 0, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>🖼️</span> Header Banner Image (Meta Image Header)
                      </label>
                      {testHeaderImage && (
                        <button
                          type="button"
                          className="link"
                          style={{ fontSize: '0.75rem', color: '#dc2626', textDecoration: 'underline', cursor: 'pointer' }}
                          onClick={() => setTestHeaderImage('')}
                        >
                          Remove Banner
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      <label
                        style={{
                          cursor: testUploadingImage ? 'wait' : 'pointer',
                          padding: '0.45rem 0.9rem',
                          fontSize: '0.82rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          borderRadius: '6px',
                          border: '1.5px solid #16a34a',
                          color: '#166534',
                          background: testUploadingImage ? '#f0fdf4' : '#dcfce7',
                          fontWeight: 600,
                          margin: 0
                        }}
                      >
                        <span>{testUploadingImage ? '⏳ Uploading...' : '📁 Upload Image from Computer'}</span>
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/jpg, image/webp"
                          style={{ display: 'none' }}
                          onChange={handleTestImageFileUpload}
                          disabled={testUploadingImage}
                        />
                      </label>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {testUploadingImage ? 'Uploading image to WhatsApp CDN...' : 'or paste direct image URL below:'}
                      </span>
                    </div>

                    <input
                      type="url"
                      value={testHeaderImage}
                      onChange={(e) => setTestHeaderImage(e.target.value)}
                      placeholder="https://... paste image URL or use Upload button above"
                      style={{ fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}
                    />

                    {testHeaderImage && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                        <img
                          src={testHeaderImage}
                          alt="Banner Preview"
                          style={{ height: '48px', width: 'auto', maxWidth: '100px', borderRadius: '6px', border: '1px solid #cbd5e1', objectFit: 'cover' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <div style={{ fontSize: '0.75rem', color: '#334155' }}>
                          <div style={{ fontWeight: 600, color: '#166534' }}>✅ Banner Attached</div>
                          <div style={{ color: '#64748b', wordBreak: 'break-all', maxWidth: '300px' }}>
                            {testHeaderImage.length > 55 ? testHeaderImage.slice(0, 55) + '...' : testHeaderImage}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Live WhatsApp chat preview */}
              {(() => {
                const curTpl = templates.find((t) => String(t.id) === String(testTemplateId))
                const isCallAttemptTest = curTpl && (curTpl.name.includes('call_attempt') || curTpl.name.includes('not_attend'))

                return (
                  <div style={{ background: '#e5ddd5', padding: '0.85rem', borderRadius: '10px', marginBottom: '1rem', border: '1px solid #d1d5db' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.35rem', fontWeight: 600 }}>
                      📱 WhatsApp Live Preview (with dynamic values):
                    </div>
                    <div style={{
                      background: '#d9fdd3',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      fontSize: '0.88rem',
                      color: '#111827',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      whiteSpace: 'pre-wrap',
                      lineHeight: '1.45'
                    }}>
                      {!isCallAttemptTest && testHeaderImage && (
                        <img
                          src={testHeaderImage}
                          alt="Banner Preview"
                          style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '6px', marginBottom: '0.5rem' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                      {renderTestPreview(testMsg, testVars)}
                    </div>
                  </div>
                )
              })()}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn alt" onClick={() => setTestModal(null)}>
                  Close
                </button>
                <button
                  type="submit"
                  className="btn success"
                  disabled={busy || !testPhone.trim() || !testMsg.trim()}
                  style={{ background: '#25D366', borderColor: '#16a34a', color: '#fff' }}
                >
                  {busy ? 'Sending…' : '🚀 Send Test WhatsApp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

const modalOverlayStyle = {
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
