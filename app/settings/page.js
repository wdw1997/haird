'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'Asia/Shanghai', label: 'China (Shanghai)' },
]

function SettingsContent() {
  const searchParams = useSearchParams()
  const [stylistId, setStylistId] = useState(null)
  const [instagramMsg, setInstagramMsg] = useState('')
  const [form, setForm] = useState({
    business_name: '', address: '', contact_phone: '',
    business_hours_text: '', services_text: '',
    booking_mode: 'ai_collect_manual_confirm', min_advance_hours: 24,
    cancellation_policy: '', available_slots_text: '',
    tone: 'friendly', use_emoji: false,
    timezone: 'America/New_York',
  })
  const [status, setStatus] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [planType, setPlanType] = useState('free')
  const [hasNumber, setHasNumber] = useState(true)

  const [calendarEvents, setCalendarEvents] = useState([])
  const [loadingCalendar, setLoadingCalendar] = useState(false)
  const [calendarError, setCalendarError] = useState('')

  const [apptForm, setApptForm] = useState({ clientName: '', date: '', time: '', duration: 60, service: '', notes: '' })
  const [apptStatus, setApptStatus] = useState('')

  const [pendingRequests, setPendingRequests] = useState([])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: stylist } = await supabase.from('stylists').select('id, plan_type, twilio_number').eq('auth_user_id', user.id).maybeSingle()
      if (!stylist) return
      setStylistId(stylist.id)
      setPlanType(stylist.plan_type || 'free')
      setHasNumber(!!stylist.twilio_number)

      const { data: biz } = await supabase.from('business_settings').select('*').eq('stylist_id', stylist.id).maybeSingle()
      if (biz) {
        setForm({
          business_name: biz.business_name || '',
          address: biz.address || '',
          contact_phone: biz.contact_phone || '',
          business_hours_text: biz.business_hours ? JSON.stringify(biz.business_hours) : '',
          services_text: biz.services ? biz.services.map(s => `${s.name},${s.price},${s.duration_min}`).join('\n') : '',
          booking_mode: biz.booking_mode || 'ai_collect_manual_confirm',
          min_advance_hours: biz.min_advance_hours || 24,
          cancellation_policy: biz.cancellation_policy || '',
          available_slots_text: biz.available_slots_text || '',
          tone: biz.tone || 'friendly',
          use_emoji: biz.use_emoji || false,
          timezone: biz.timezone || 'America/New_York',
        })
      }

      const { data: requests } = await supabase
        .from('appointment_requests').select('*').eq('stylist_id', stylist.id).eq('status', 'pending')
        .order('created_at', { ascending: false })
      setPendingRequests(requests || [])
    })()
  }, [])

  useEffect(() => {
    const igStatus = searchParams.get('instagram')
    const messages = {
      connected: '✅ Instagram connected successfully',
      cancelled: 'Authorization cancelled',
      save_failed: '❌ Failed to save Instagram authorization. Please try again.',
      error: '❌ Instagram connection failed. Please try again.',
    }
    if (igStatus && messages[igStatus]) setInstagramMsg(messages[igStatus])
  }, [searchParams])

  const handleConnectInstagram = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/instagram/auth', { headers: { Authorization: `Bearer ${session.access_token}` } })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else alert(data.error || 'Connection failed')
  }

  const handleSave = async () => {
    setStatus('Saving...')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: stylist } = await supabase.from('stylists').select('id').eq('auth_user_id', user.id).maybeSingle()
    if (!stylist) { setStatus('Error: stylist profile not found'); return }

    const services = form.services_text.split('\n').filter(Boolean).map(line => {
      const [name, price, duration_min] = line.split(',').map(s => s.trim())
      return { name, price: Number(price), duration_min: Number(duration_min) }
    })

    const { error } = await supabase.from('business_settings').upsert({
      stylist_id: stylist.id,
      business_name: form.business_name,
      address: form.address,
      contact_phone: form.contact_phone,
      business_hours: { text: form.business_hours_text },
      services,
      booking_mode: form.booking_mode,
      min_advance_hours: Number(form.min_advance_hours),
      cancellation_policy: form.cancellation_policy,
      available_slots_text: form.available_slots_text,
      tone: form.tone,
      use_emoji: form.use_emoji,
      timezone: form.timezone,
      updated_at: new Date().toISOString(),
    })
    setStatus(error ? 'Save failed: ' + error.message : 'Saved successfully!')
  }

  const fetchCalendar = async () => {
    setLoadingCalendar(true)
    setCalendarError('')
    setCalendarEvents([])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setCalendarError('Please log in first'); return }
      const res = await fetch('/api/calendar', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const data = await res.json()
      if (!res.ok || data.error) { setCalendarError(data.error || 'Failed to load calendar. Please try again later.'); return }
      setCalendarEvents(data.events || [])
    } catch (err) {
      setCalendarError('Network error. Please check your connection and try again.')
    } finally {
      setLoadingCalendar(false)
    }
  }

  const handleAddAppointment = async () => {
    setApptStatus('Submitting...')
    if (!apptForm.date || !apptForm.time) { setApptStatus('Please fill in the date and time'); return }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setApptStatus('Please log in first'); return }

      const startLocal = new Date(`${apptForm.date}T${apptForm.time}:00`)
      const endLocal = new Date(startLocal.getTime() + Number(apptForm.duration) * 60000)

      const res = await fetch('/api/calendar/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `Appointment: ${apptForm.service || 'Service'} - ${apptForm.clientName || 'Client'}`,
          description: apptForm.notes,
          startISO: startLocal.toISOString(),
          endISO: endLocal.toISOString(),
          timeZone: form.timezone,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setApptStatus('❌ ' + (data.error || 'Failed to add')); return }
      setApptStatus('✅ Added to calendar')
      setApptForm({ clientName: '', date: '', time: '', duration: 60, service: '', notes: '' })
    } catch (err) {
      setApptStatus('❌ Network error')
    }
  }

  const handleConfirmRequest = async (requestId, action) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/appointments/confirm', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action }),
    })
    const data = await res.json()
    if (data.error) { alert(data.error); return }
    setPendingRequests(prev => prev.filter(r => r.id !== requestId))
  }

  const formatEventTime = (value) => {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const input = { padding: 10, borderRadius: 6, border: '1px solid #ccc', width: '100%' }
  const label = { fontWeight: 600, marginTop: 16, display: 'block' }

  return (
    <div style={{ padding: 40, maxWidth: 600, margin: '0 auto' }}>
      <Link href="/" style={{ fontSize: 14, color: '#666', textDecoration: 'none', marginBottom: 20, display: 'inline-block' }}>
        &larr; Back to Home
      </Link>

      <h1>Business Settings</h1>

      {stylistId && !hasNumber && (
        <div style={{ padding: 20, background: '#eff6ff', borderRadius: 12, marginTop: 20, border: '1px solid #bfdbfe' }}>
          <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 6 }}>💬 Try Your AI Assistant</h2>
          <p style={{ fontSize: 13, color: '#666', marginTop: 0, marginBottom: 12 }}>
            {planType === 'free'
              ? "You're on a free trial, so you don't have a dedicated phone number yet — but you can still test exactly how your AI assistant will respond to customers."
              : "Your number is still being set up. In the meantime, you can test your AI assistant here."}
          </p>
          <Link href="/demo" style={{
            display: 'inline-block', padding: '10px 20px', background: '#2563eb', color: 'white',
            borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 14,
          }}>
            Open Demo Chat →
          </Link>
          {planType === 'free' && (
            <p style={{ fontSize: 12, color: '#888', marginTop: 10, marginBottom: 0 }}>
              🔒 Upgrade to a paid plan to activate your dedicated AI phone number and start texting with real customers.
            </p>
          )}
        </div>
      )}

      {stylistId && (
        <div style={{ padding: 20, background: '#ecfdf5', borderRadius: 12, marginTop: 20, border: '1px solid #a7f3d0' }}>
          <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 6 }}>🔗 Your Booking Page</h2>
          <p style={{ fontSize: 13, color: '#666', marginTop: 0, marginBottom: 10 }}>
            Share this link with customers (Instagram bio, texts, your Google listing) so they can request an appointment themselves.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              readOnly
              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/book/${stylistId}`}
              style={{ ...input, background: 'white', fontSize: 13, color: '#333' }}
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/book/${stylistId}`)
                setCopyStatus('Copied!')
                setTimeout(() => setCopyStatus(''), 2000)
              }}
              style={{ padding: '0 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Copy Link
            </button>
          </div>
          {copyStatus && <p style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{copyStatus}</p>}
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div style={{ padding: 20, background: '#fff8e6', borderRadius: 12, marginTop: 20, border: '1px solid #ffe4a3' }}>
          <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 10 }}>⏳ Pending Appointment Requests ({pendingRequests.length})</h2>
          {pendingRequests.map(r => (
            <div key={r.id} style={{ background: 'white', borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 13 }}>
              <div><strong>Phone:</strong> {r.phone_number}</div>
              <div><strong>Service:</strong> {r.service_type || 'Not specified'}</div>
              <div><strong>Time:</strong> {r.requested_start ? formatEventTime(r.requested_start) : 'Not set (calendar not connected)'}</div>
              {r.notes && <div style={{ color: '#666', marginTop: 4 }}>{r.notes}</div>}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={() => handleConfirmRequest(r.id, 'confirm')} style={{ flex: 1, padding: 8, background: '#22c55e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Confirm</button>
                <button onClick={() => handleConfirmRequest(r.id, 'decline')} style={{ flex: 1, padding: 8, background: '#f1f1f1', color: '#333', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: 20, background: '#f0f7ff', borderRadius: 12, marginTop: 20, border: '1px solid #cfe4ff' }}>
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 10 }}>📞 Manually Add Appointment</h2>
        <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>For existing clients who call or book in person</p>
        <input style={{ ...input, marginBottom: 8 }} placeholder="Client name" value={apptForm.clientName} onChange={e => setApptForm({ ...apptForm, clientName: e.target.value })} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input style={input} type="date" value={apptForm.date} onChange={e => setApptForm({ ...apptForm, date: e.target.value })} />
          <input style={input} type="time" value={apptForm.time} onChange={e => setApptForm({ ...apptForm, time: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input style={input} placeholder="Service" value={apptForm.service} onChange={e => setApptForm({ ...apptForm, service: e.target.value })} />
          <input style={{ ...input, width: 120 }} type="number" placeholder="Duration (min)" value={apptForm.duration} onChange={e => setApptForm({ ...apptForm, duration: e.target.value })} />
        </div>
        <textarea style={{ ...input, height: 50, marginBottom: 8 }} placeholder="Notes (optional)" value={apptForm.notes} onChange={e => setApptForm({ ...apptForm, notes: e.target.value })} />
        <button onClick={handleAddAppointment} style={{ width: '100%', padding: 10, background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Add to Calendar</button>
        {apptStatus && <p style={{ marginTop: 8, fontSize: 13, color: '#666' }}>{apptStatus}</p>}
      </div>

      <div style={{ padding: 20, background: '#f8f9fa', borderRadius: 12, marginTop: 20, marginBottom: 10, border: '1px solid #e9ecef' }}>
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 10 }}>📅 Google Calendar Sync Test</h2>
        <button
          onClick={fetchCalendar}
          disabled={loadingCalendar}
          style={{ padding: '10px 16px', background: loadingCalendar ? '#999' : '#4285F4', color: 'white', border: 'none', borderRadius: 6, cursor: loadingCalendar ? 'not-allowed' : 'pointer', fontSize: 14 }}
        >
          {loadingCalendar ? 'Loading...' : 'Load Next 7 Days'}
        </button>
        {calendarError && <p style={{ marginTop: 12, color: '#d93025', fontSize: 13 }}>⚠️ {calendarError}</p>}
        {calendarEvents.length > 0 && (
          <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: 'none' }}>
            {calendarEvents.map((event) => (
              <li key={event.id} style={{ padding: '8px 12px', background: 'white', borderRadius: 8, marginBottom: 6, border: '1px solid #eee', fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>{event.title}</div>
                <div style={{ color: '#666', marginTop: 2 }}>{formatEventTime(event.start)} — {formatEventTime(event.end)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ padding: 20, background: '#fdf2f8', borderRadius: 12, marginTop: 10, marginBottom: 20, border: '1px solid #fbcfe8' }}>
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 10 }}>📷 Instagram DM</h2>
        <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>Let the AI assistant reply to Instagram DMs the same way it replies to texts.</p>
        {instagramMsg && <p style={{ fontSize: 13, marginBottom: 10 }}>{instagramMsg}</p>}
        <button onClick={handleConnectInstagram} style={{ width: '100%', padding: 10, background: '#db2777', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Connect Instagram
        </button>
      </div>

      <label style={label}>🌍 Business Timezone (affects AI scheduling accuracy)</label>
      <select style={input} value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })}>
        {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
      </select>

      <label style={label}>Business Name</label>
      <input style={input} value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} />

      <label style={label}>Address</label>
      <input style={input} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />

      <label style={label}>Contact Phone (for handoff to a human)</label>
      <input style={input} value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />

      <label style={label}>Business Hours (free text, e.g. "Mon-Fri 9-6, Sat 10-4")</label>
      <input style={input} value={form.business_hours_text} onChange={e => setForm({ ...form, business_hours_text: e.target.value })} />

      <label style={label}>Services (one per line: Name,Price,DurationMinutes)</label>
      <textarea style={{ ...input, height: 100 }} placeholder={"Haircut,30,30\nHighlights,80,120"} value={form.services_text} onChange={e => setForm({ ...form, services_text: e.target.value })} />

      <label style={label}>Booking Mode</label>
      <select style={input} value={form.booking_mode} onChange={e => setForm({ ...form, booking_mode: e.target.value })}>
        <option value="ai_collect_manual_confirm">AI collects request, owner confirms manually</option>
        <option value="ai_auto_confirm">AI confirms bookings automatically</option>
      </select>

      <label style={label}>Minimum Advance Booking (hours)</label>
      <input type="number" style={input} value={form.min_advance_hours} onChange={e => setForm({ ...form, min_advance_hours: e.target.value })} />

      <label style={label}>Cancellation Policy</label>
      <textarea style={{ ...input, height: 60 }} placeholder="e.g. 50% fee for cancellations within 24 hours" value={form.cancellation_policy} onChange={e => setForm({ ...form, cancellation_policy: e.target.value })} />

      <label style={label}>Reply Tone</label>
      <select style={input} value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })}>
        <option value="professional">Professional & concise</option>
        <option value="friendly">Warm & friendly</option>
        <option value="humorous">Playful & humorous</option>
      </select>

      <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={form.use_emoji} onChange={e => setForm({ ...form, use_emoji: e.target.checked })} />
        Allow emojis in replies
      </label>

      <button onClick={handleSave} style={{ marginTop: 24, padding: 12, background: '#333', color: 'white', border: 'none', borderRadius: 6, width: '100%' }}>
        Save Settings
      </button>
      {status && <p style={{ marginTop: 12, color: '#666' }}>{status}</p>}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Loading...</div>}>
      <SettingsContent />
    </Suspense>
  )
}
