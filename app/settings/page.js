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

const TABS = [
  { id: 'details', label: 'Salon Details', dot: 'bg-oxblood' },
  { id: 'connections', label: 'Connections', dot: 'bg-sage' },
  { id: 'tools', label: 'Tools', dot: 'bg-brass' },
]

// Shared field styles — one calm vocabulary used everywhere so the page
// reads as one surface instead of a stack of differently-styled widgets.
const input = 'w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-mute/60 outline-none transition focus:border-oxblood focus:ring-2 focus:ring-oxblood/10'
const label = 'block text-[13px] font-medium text-ink/85 mb-1.5'
const helper = 'text-[12.5px] text-mute leading-relaxed'
const sectionTitle = 'font-display text-[16px] font-semibold text-ink'
const primaryBtn = 'inline-flex items-center justify-center gap-2 rounded-lg bg-oxblood px-5 py-2.5 text-[14px] font-semibold text-porcelain shadow-sm transition hover:bg-oxblood-dark active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none'
const ghostBtn = 'inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-[13.5px] font-semibold text-ink transition hover:bg-porcelain'
const card = 'rounded-xl border border-line bg-white p-5'

function SettingsContent() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState('details')
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
  const [isCalendarConnected, setIsCalendarConnected] = useState(false)

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
      const { data: stylist } = await supabase.from('stylists').select('id, plan_type, twilio_number, google_cal_refresh_token_encrypted').eq('auth_user_id', user.id).maybeSingle()
      if (!stylist) return
      setStylistId(stylist.id)
      setPlanType(stylist.plan_type || 'free')
      setHasNumber(!!stylist.twilio_number)
      setIsCalendarConnected(!!stylist.google_cal_refresh_token_encrypted)

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

  const handleConnectGoogle = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/google/auth', { headers: { Authorization: `Bearer ${session.access_token}` } })
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

  const bookingUrl = stylistId && typeof window !== 'undefined' ? `${window.location.origin}/book/${stylistId}` : ''

  return (
    <div className="min-h-screen bg-porcelain">
      <div className="mx-auto max-w-2xl px-5 py-10 md:py-14">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <Link href="/" className="text-[13px] text-mute hover:text-ink transition mb-3 inline-block">
              &larr; Back to Home
            </Link>
            <h1 className="font-display text-[28px] font-semibold text-ink tracking-tight">Business Settings</h1>
          </div>
          <span className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${planType === 'free' ? 'bg-ink/5 text-mute' : 'bg-oxblood/10 text-oxblood'}`}>
            {planType}
          </span>
        </div>

        {/* Pending requests — always visible regardless of tab, this is time-sensitive */}
        {pendingRequests.length > 0 && (
          <div className="mb-6 rounded-xl border border-oxblood/25 bg-oxblood/5 p-5">
            <h2 className="font-display text-[15px] font-semibold text-oxblood mb-3">
              ⏳ Pending Appointment Requests ({pendingRequests.length})
            </h2>
            <div className="space-y-2">
              {pendingRequests.map(r => (
                <div key={r.id} className="rounded-lg bg-white border border-line p-3.5 text-[13px]">
                  <div className="text-ink"><strong>Phone:</strong> {r.phone_number}</div>
                  <div className="text-ink"><strong>Service:</strong> {r.service_type || 'Not specified'}</div>
                  <div className="text-ink"><strong>Time:</strong> {r.requested_start ? formatEventTime(r.requested_start) : 'Not set (calendar not connected)'}</div>
                  {r.notes && <div className="text-mute mt-1">{r.notes}</div>}
                  <div className="mt-2.5 flex gap-2">
                    <button onClick={() => handleConfirmRequest(r.id, 'confirm')} className="flex-1 rounded-md bg-sage py-1.5 text-[12.5px] font-semibold text-white hover:bg-sage-dark transition">Confirm</button>
                    <button onClick={() => handleConfirmRequest(r.id, 'decline')} className="flex-1 rounded-md border border-line bg-white py-1.5 text-[12.5px] font-semibold text-ink hover:bg-porcelain transition">Decline</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Swatch tabs — styled like a colour-swatch binder, echoing the salon's own materials */}
        <div className="rounded-t-2xl bg-ink px-2 pt-2">
          <div className="flex items-end gap-1">
            {TABS.map(tab => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 rounded-t-xl px-4 py-3 text-[13.5px] transition
                    ${active ? 'bg-porcelain text-ink -mb-px z-10' : 'text-porcelain/60 hover:text-porcelain hover:bg-white/5'}`}
                >
                  <span className={`h-2 w-2 rounded-full ${tab.dot}`} />
                  <span className="font-display font-semibold">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Content card — reads as a continuation of the active tab */}
        <div className="rounded-b-2xl rounded-tr-2xl border border-line bg-porcelain p-5 md:p-7">

          {activeTab === 'details' && (
            <div className="space-y-7">
              <div>
                <h3 className={sectionTitle}>About your salon</h3>
                <p className={`${helper} mb-4`}>What the AI tells customers when they ask where you are or when you're open.</p>
                <div className="space-y-4">
                  <div>
                    <label className={label}>Business name</label>
                    <input className={input} value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} />
                  </div>
                  <div>
                    <label className={label}>Address</label>
                    <input className={input} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                  </div>
                  <div>
                    <label className={label}>Contact phone <span className="text-mute font-normal">(for handoff to a human)</span></label>
                    <input className={input} value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
                  </div>
                  <div>
                    <label className={label}>Business hours</label>
                    <input className={input} placeholder='e.g. "Mon-Fri 9-6, Sat 10-4"' value={form.business_hours_text} onChange={e => setForm({ ...form, business_hours_text: e.target.value })} />
                  </div>
                  <div>
                    <label className={label}>Timezone <span className="text-mute font-normal">(affects AI scheduling accuracy)</span></label>
                    <select className={input} value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })}>
                      {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-line pt-6">
                <h3 className={sectionTitle}>Services &amp; pricing</h3>
                <p className={`${helper} mb-3`}>One per line: Name, Price, Duration in minutes.</p>
                <textarea className={`${input} h-28 font-mono text-[13.5px]`} placeholder={"Haircut,30,30\nHighlights,80,120"} value={form.services_text} onChange={e => setForm({ ...form, services_text: e.target.value })} />
              </div>

              <div className="border-t border-line pt-6 space-y-4">
                <h3 className={sectionTitle}>Booking rules</h3>
                <div>
                  <label className={label}>Booking mode</label>
                  <select className={input} value={form.booking_mode} onChange={e => setForm({ ...form, booking_mode: e.target.value })}>
                    <option value="ai_collect_manual_confirm">AI collects request, owner confirms manually</option>
                    <option value="ai_auto_confirm">AI confirms bookings automatically</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Minimum advance booking (hours)</label>
                  <input type="number" className={input} value={form.min_advance_hours} onChange={e => setForm({ ...form, min_advance_hours: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Cancellation policy</label>
                  <textarea className={`${input} h-20`} placeholder="e.g. 50% fee for cancellations within 24 hours" value={form.cancellation_policy} onChange={e => setForm({ ...form, cancellation_policy: e.target.value })} />
                </div>
              </div>

              <div className="border-t border-line pt-6 space-y-4">
                <h3 className={sectionTitle}>Voice &amp; style</h3>
                <div>
                  <label className={label}>Reply tone</label>
                  <select className={input} value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })}>
                    <option value="professional">Professional &amp; concise</option>
                    <option value="friendly">Warm &amp; friendly</option>
                    <option value="humorous">Playful &amp; humorous</option>
                  </select>
                </div>
                <label className="flex items-center gap-2.5 text-[14px] text-ink cursor-pointer">
                  <input type="checkbox" checked={form.use_emoji} onChange={e => setForm({ ...form, use_emoji: e.target.checked })} className="h-4 w-4 rounded border-line accent-oxblood" />
                  Allow emojis in replies
                </label>
              </div>

              <div className="border-t border-line pt-6">
                <button onClick={handleSave} className={`${primaryBtn} w-full`}>Save Settings</button>
                {status && <p className={`${helper} mt-2.5 text-center`}>{status}</p>}
              </div>
            </div>
          )}

          {activeTab === 'connections' && (
            <div className="space-y-4">
              <div className={card}>
                <h3 className={`${sectionTitle} mb-1`}>🔗 Your booking page</h3>
                <p className={`${helper} mb-3.5`}>Share this with customers (Instagram bio, texts, your Google listing) so they can request an appointment themselves.</p>
                <div className="flex gap-2">
                  <input readOnly value={bookingUrl} onFocus={e => e.target.select()} className={`${input} text-[13px] text-mute`} />
                  <button
                    onClick={() => { navigator.clipboard.writeText(bookingUrl); setCopyStatus('Copied!'); setTimeout(() => setCopyStatus(''), 2000) }}
                    className={`${ghostBtn} shrink-0`}
                  >
                    {copyStatus || 'Copy'}
                  </button>
                </div>
              </div>

              <div className={card}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className={sectionTitle}>📅 Google Calendar</h3>
                  {isCalendarConnected && (
                    <span className="flex items-center gap-1.5 rounded-full bg-sage/10 px-2.5 py-1 text-[11.5px] font-semibold text-sage-dark">
                      <span className="h-1.5 w-1.5 rounded-full bg-sage" /> Connected
                    </span>
                  )}
                </div>
                <p className={`${helper} mb-3.5`}>Lets the AI check your real availability and add confirmed bookings automatically.</p>
                {isCalendarConnected ? (
                  <div>
                    <button onClick={fetchCalendar} disabled={loadingCalendar} className={ghostBtn}>
                      {loadingCalendar ? 'Loading...' : 'Test sync — load next 7 days'}
                    </button>
                    {calendarError && <p className="mt-2.5 text-[12.5px] text-oxblood">⚠️ {calendarError}</p>}
                    {calendarEvents.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {calendarEvents.map(ev => (
                          <li key={ev.id} className="rounded-lg border border-line bg-porcelain px-3 py-2 text-[12.5px]">
                            <div className="font-medium text-ink">{ev.title}</div>
                            <div className="text-mute">{formatEventTime(ev.start)} — {formatEventTime(ev.end)}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <button onClick={handleConnectGoogle} className={primaryBtn}>Connect Google Calendar</button>
                )}
              </div>

              <div className={card}>
                <h3 className={`${sectionTitle} mb-1`}>📷 Instagram DM</h3>
                <p className={`${helper} mb-3.5`}>Let the AI assistant reply to Instagram DMs the same way it replies to texts.</p>
                {instagramMsg && <p className="mb-3 text-[13px] text-ink">{instagramMsg}</p>}
                <button onClick={handleConnectInstagram} className={primaryBtn}>Connect Instagram</button>
              </div>
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="space-y-4">
              {!hasNumber && (
                <div className={card}>
                  <h3 className={`${sectionTitle} mb-1`}>💬 Try your AI assistant</h3>
                  <p className={`${helper} mb-3.5`}>
                    {planType === 'free'
                      ? "You're on a free trial, so you don't have a dedicated phone number yet — but you can still test exactly how your AI assistant will respond to customers."
                      : "Your number is still being set up. In the meantime, you can test your AI assistant here."}
                  </p>
                  <Link href="/demo" className={primaryBtn}>Open Demo Chat →</Link>
                  {planType === 'free' && (
                    <p className={`${helper} mt-3`}>🔒 Upgrade to a paid plan to activate your dedicated AI phone number and start texting with real customers.</p>
                  )}
                </div>
              )}

              <div className={card}>
                <h3 className={`${sectionTitle} mb-1`}>📞 Manually add appointment</h3>
                <p className={`${helper} mb-3.5`}>For existing clients who call or book in person.</p>
                <div className="space-y-3">
                  <input className={input} placeholder="Client name" value={apptForm.clientName} onChange={e => setApptForm({ ...apptForm, clientName: e.target.value })} />
                  <div className="flex gap-2">
                    <input className={input} type="date" value={apptForm.date} onChange={e => setApptForm({ ...apptForm, date: e.target.value })} />
                    <input className={input} type="time" value={apptForm.time} onChange={e => setApptForm({ ...apptForm, time: e.target.value })} />
                  </div>
                  <div className="flex gap-2">
                    <input className={input} placeholder="Service" value={apptForm.service} onChange={e => setApptForm({ ...apptForm, service: e.target.value })} />
                    <input className={`${input} w-28 shrink-0`} type="number" placeholder="Min" value={apptForm.duration} onChange={e => setApptForm({ ...apptForm, duration: e.target.value })} />
                  </div>
                  <textarea className={`${input} h-16`} placeholder="Notes (optional)" value={apptForm.notes} onChange={e => setApptForm({ ...apptForm, notes: e.target.value })} />
                  <button onClick={handleAddAppointment} className={`${primaryBtn} w-full`}>Add to Calendar</button>
                  {apptStatus && <p className={`${helper} text-center`}>{apptStatus}</p>}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-porcelain text-mute">Loading...</div>}>
      <SettingsContent />
    </Suspense>
  )
}
