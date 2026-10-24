'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

// First-run setup for a new salon owner, one small step per screen:
//   1 About your salon  ->  2 Try your AI  ->  3 Google Calendar  ->  4 You're live
// It only writes the same business_settings fields the Settings page edits, so
// anything chosen here can be changed there later.

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'Asia/Shanghai', label: 'China (Shanghai)' },
]
const SERVICE_CHIPS = ['Haircut', 'Color', 'Highlights', 'Blowout', 'Cut & Style']
const DEFAULT_HOURS = 'Mon-Fri 9am-6pm, Sat 10am-4pm, Sun closed'
const TRY_PROMPTS = [
  'Hi, do you have any openings this week for a haircut?',
  'How much is a color?',
  'Where are you located?',
]
const STEP_TITLES = ['About your salon', 'Try your AI', 'Google Calendar', "You're live"]

const input = 'w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-mute/60 outline-none transition focus:border-oxblood focus:ring-2 focus:ring-oxblood/10'
const label = 'block text-[13px] font-medium text-ink/85 mb-1.5'
const helper = 'text-[12.5px] text-mute leading-relaxed'
const primaryBtn = 'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-oxblood px-5 py-3 text-[15px] font-semibold text-porcelain shadow-sm transition hover:bg-oxblood-dark active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none'
const ghostBtn = 'inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-3 text-[14px] font-semibold text-ink transition hover:bg-porcelain'
const card = 'rounded-xl border border-line bg-white p-5'

// localStorage flags (kept per browser — no schema change needed).
const SKIPPED_KEY = 'onboarding_skipped'
const RESUME_KEY = 'onboarding_resume'

function guessTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return TIMEZONES.some(t => t.value === tz) ? tz : 'America/Los_Angeles'
  } catch {
    return 'America/Los_Angeles'
  }
}

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(1)
  const [stylistId, setStylistId] = useState(null)
  const [hasNumber, setHasNumber] = useState(false)
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [existingBiz, setExistingBiz] = useState(null)

  const [form, setForm] = useState({
    business_name: '', contact_phone: '', address: '',
    timezone: 'America/Los_Angeles', business_hours_text: DEFAULT_HOURS,
  })
  const [services, setServices] = useState([{ name: '', price: '', duration_min: '60' }])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [calendarNote, setCalendarNote] = useState('')

  // --- load ---
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: stylist } = await supabase.from('stylists')
        .select('id, twilio_number, google_cal_refresh_token_encrypted').eq('auth_user_id', user.id).maybeSingle()
      if (!stylist) { router.replace('/'); return }
      setStylistId(stylist.id)
      setHasNumber(!!stylist.twilio_number)
      setCalendarConnected(!!stylist.google_cal_refresh_token_encrypted)

      const { data: biz } = await supabase.from('business_settings').select('*').eq('stylist_id', stylist.id).maybeSingle()
      setExistingBiz(biz || null)
      setForm({
        business_name: biz?.business_name || '',
        contact_phone: biz?.contact_phone || '',
        address: biz?.address || '',
        timezone: biz?.timezone || guessTimezone(),
        business_hours_text: biz?.business_hours?.text || DEFAULT_HOURS,
      })
      if (Array.isArray(biz?.services) && biz.services.length) {
        setServices(biz.services.map(s => ({ name: s.name || '', price: String(s.price ?? ''), duration_min: String(s.duration_min ?? '60') })))
      }

      // Where to start: back from Google -> step 4; details already saved -> step 2; else step 1.
      const wanted = Number(searchParams.get('step'))
      const hasDetails = !!biz?.business_name
      setStep(wanted >= 1 && wanted <= 4 && (hasDetails || wanted === 1) ? wanted : hasDetails ? 2 : 1)
      const cal = searchParams.get('calendar')
      if (cal === 'connected') setCalendarNote('✅ Google Calendar connected.')
      else if (cal) setCalendarNote('Calendar connection did not finish — you can try again from here or later in Settings.')
      setLoading(false)
    })()
  }, [])

  const goTo = (n) => {
    setError('')
    setStep(n)
    window.scrollTo({ top: 0 })
  }

  // No "skip" for the wizard: the first steps are what make the booking page
  // usable. This is only an escape hatch so nobody is ever trapped here
  // (e.g. a save keeps failing, or they signed in with the wrong account).
  const logOut = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  // --- step 1: save ---
  const updateService = (i, patch) => setServices(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const addService = (name = '') => setServices(prev => {
    // reuse the empty starter row instead of stacking blank rows
    if (prev.length === 1 && !prev[0].name && !prev[0].price) return [{ name, price: '', duration_min: '60' }]
    return [...prev, { name, price: '', duration_min: '60' }]
  })
  const removeService = (i) => setServices(prev => (prev.length === 1 ? [{ name: '', price: '', duration_min: '60' }] : prev.filter((_, idx) => idx !== i)))

  const saveDetails = async () => {
    setError('')
    if (!form.business_name.trim()) { setError('Please enter your salon name.'); return }
    const phoneDigits = form.contact_phone.replace(/[^\d]/g, '')
    if (phoneDigits.length < 10) { setError('Please enter a phone number customers can call.'); return }

    const filled = services.filter(s => s.name.trim() || s.price !== '')
    if (!filled.length) { setError('Add at least one service so your AI knows what you offer.'); return }
    for (const s of filled) {
      if (!s.name.trim()) { setError('Every service needs a name.'); return }
      if (s.price === '' || isNaN(Number(s.price)) || Number(s.price) < 0) { setError(`Add a price for "${s.name}".`); return }
      if (!s.duration_min || isNaN(Number(s.duration_min)) || Number(s.duration_min) < 5) { setError(`Add how many minutes "${s.name}" takes.`); return }
    }

    setSaving(true)
    const payload = {
      stylist_id: stylistId,
      business_name: form.business_name.trim(),
      contact_phone: form.contact_phone.trim(),
      address: form.address.trim(),
      timezone: form.timezone,
      business_hours: { text: form.business_hours_text.trim() },
      services: filled.map(s => ({ name: s.name.trim(), price: Number(s.price), duration_min: Number(s.duration_min) })),
      updated_at: new Date().toISOString(),
    }
    // First save only: give the options this wizard doesn't ask about the same
    // defaults Settings starts with. If a row already exists we never touch them.
    if (!existingBiz) {
      Object.assign(payload, { booking_mode: 'ai_collect_manual_confirm', min_advance_hours: 24, tone: 'friendly', use_emoji: false })
    }
    const { error: saveError } = await supabase.from('business_settings').upsert(payload)
    setSaving(false)
    if (saveError) { setError('Could not save: ' + saveError.message); return }
    setExistingBiz({ ...(existingBiz || {}), ...payload })
    goTo(2)
  }

  // --- step 3: Google ---
  const connectGoogle = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/google/auth', { headers: { Authorization: `Bearer ${session.access_token}` } })
    const data = await res.json()
    if (data.url) {
      // The Google callback lands on "/", which sends us back here via this flag.
      try { localStorage.setItem(RESUME_KEY, '1') } catch {}
      window.location.href = data.url
    } else {
      setError(data.error || 'Connection failed. Please try again.')
    }
  }

  const finish = () => {
    try { localStorage.setItem(SKIPPED_KEY, '1') } catch {}
    router.push('/')
  }

  if (loading) return <div className="min-h-screen bg-porcelain flex items-center justify-center text-mute text-sm">Loading…</div>

  const bookingUrl = typeof window !== 'undefined' ? `${window.location.origin}/book/${stylistId}` : ''

  return (
    <div className="min-h-screen bg-porcelain px-5 py-6">
      <div className="mx-auto max-w-lg">
        {/* header + progress */}
        <div className="flex items-center justify-between">
          {step > 1 ? (
            <button onClick={() => goTo(step - 1)} className="text-[13px] font-medium text-mute hover:text-ink">← Back</button>
          ) : <span />}
          <span key={step} className="text-[13px] text-mute">Step {step} of 4 · {STEP_TITLES[step - 1]}</span>
          <button onClick={logOut} className="text-[12px] text-mute/80 hover:text-ink">Log out</button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className={`h-1.5 rounded-full ${n <= step ? 'bg-oxblood' : 'bg-line'}`} />
          ))}
        </div>

        <div key={step} className="mt-8">
          {step === 1 && (
            <DetailsStep
              form={form} setForm={setForm} services={services}
              updateService={updateService} addService={addService} removeService={removeService}
              error={error} saving={saving} onNext={saveDetails}
            />
          )}
          {step === 2 && <TryStep onNext={() => goTo(3)} onEdit={() => goTo(1)} />}
          {step === 3 && (
            <CalendarStep
              connected={calendarConnected} note={calendarNote} error={error}
              onConnect={connectGoogle} onNext={() => goTo(4)}
            />
          )}
          {step === 4 && (
            <LiveStep bookingUrl={bookingUrl} hasNumber={hasNumber} calendarConnected={calendarConnected} onDone={finish} />
          )}
        </div>
      </div>
    </div>
  )
}

function DetailsStep({ form, setForm, services, updateService, addService, removeService, error, saving, onNext }) {
  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold text-ink leading-tight">Tell us about your salon</h1>
      <p className={`${helper} mt-2`}>This is what your AI assistant knows. About two minutes — you can change everything later in Settings.</p>

      <div className={`${card} mt-6 space-y-4`}>
        <div>
          <label className={label}>Salon name *</label>
          <input className={input} value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="e.g. Maria's Hair Studio" />
        </div>
        <div>
          <label className={label}>Phone number customers can call *</label>
          <input className={input} type="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="(555) 123-4567" />
          <p className={`${helper} mt-1.5`}>Shown as a “Call us” button on your booking page.</p>
        </div>
        <div>
          <label className={label}>Address <span className="text-mute font-normal">(optional)</span></label>
          <input className={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, city" />
        </div>
        <div>
          <label className={label}>Time zone</label>
          <select className={input} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className={`${card} mt-4`}>
        <label className={label}>Opening hours</label>
        <textarea className={`${input} min-h-[64px]`} value={form.business_hours_text} onChange={(e) => setForm({ ...form, business_hours_text: e.target.value })} />
        <p className={`${helper} mt-1.5`}>We filled in an example — please check it. Your AI tells customers these hours.</p>
      </div>

      <div className={`${card} mt-4`}>
        <label className={label}>Services *</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {SERVICE_CHIPS.map(c => (
            <button key={c} type="button" onClick={() => addService(c)}
              className="rounded-full border border-line bg-porcelain px-3 py-1 text-[13px] text-ink hover:border-oxblood">+ {c}</button>
          ))}
        </div>
        <div className="space-y-2.5">
          {services.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_74px_74px_auto] gap-2 items-center">
              <input className={input} value={s.name} onChange={(e) => updateService(i, { name: e.target.value })} placeholder="Service" />
              <input className={input} type="number" min="0" inputMode="decimal" value={s.price} onChange={(e) => updateService(i, { price: e.target.value })} placeholder="$" aria-label="Price" />
              <input className={input} type="number" min="5" inputMode="numeric" value={s.duration_min} onChange={(e) => updateService(i, { duration_min: e.target.value })} placeholder="min" aria-label="Minutes" />
              <button type="button" onClick={() => removeService(i)} className="px-1 text-mute hover:text-oxblood" aria-label="Remove">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => addService('')} className="mt-3 text-[13px] font-medium text-oxblood hover:underline">+ Add another service</button>
        <p className={`${helper} mt-2`}>Price in dollars, and how many minutes it takes.</p>
      </div>

      {error && <p className="mt-4 text-[13.5px] text-red-700">{error}</p>}
      <div className="mt-6">
        <button onClick={onNext} disabled={saving} className={primaryBtn}>{saving ? 'Saving…' : 'Save and continue'}</button>
      </div>
    </div>
  )
}

// Owner test chat. Uses the demo endpoint in "wizard" mode: a small separate
// allowance that does NOT use up the salon's customer messages.
function TryStep({ onNext, onEdit }) {
  const [sessionId] = useState(() => crypto.randomUUID())
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const [limitReached, setLimitReached] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  const send = async (override) => {
    const msg = (override ?? text).trim()
    if (!msg || sending || limitReached) return
    setText('')
    setMessages(prev => [...prev, { role: 'customer', text: msg }])
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/demo-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ sessionId, message: msg, wizard: true }),
      })
      const data = await res.json()
      if (res.status === 402) {
        setLimitReached(true)
        setMessages(prev => [...prev, { role: 'system', text: data.message || 'You have used your practice messages.' }])
      } else if (!res.ok) {
        setMessages(prev => [...prev, { role: 'system', text: 'Something went wrong. Please try again.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.reply }])
        if (typeof data.remaining === 'number') {
          setRemaining(data.remaining)
          if (data.remaining <= 0) setLimitReached(true)
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'system', text: 'Something went wrong. Please try again.' }])
    }
    setSending(false)
  }

  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold text-ink leading-tight">Try your AI assistant</h1>
      <p className={`${helper} mt-2`}>Pretend you’re a customer. This is the same assistant your customers will chat with.
        {remaining !== null && <span> {remaining} practice {remaining === 1 ? 'message' : 'messages'} left — these don’t use your customer messages.</span>}
      </p>

      <div className="mt-5 h-[320px] overflow-y-auto rounded-xl border border-line bg-white p-4">
        {messages.length === 0 && (
          <div className="mt-6 text-center">
            <p className="text-[13px] text-mute mb-3">Tap a question to start:</p>
            <div className="flex flex-col items-center gap-2">
              {TRY_PROMPTS.map(p => (
                <button key={p} onClick={() => send(p)} className="rounded-full border border-line bg-porcelain px-3.5 py-1.5 text-[13px] text-ink hover:border-oxblood">{p}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`mb-2.5 flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${
              m.role === 'customer' ? 'bg-oxblood text-porcelain' : m.role === 'system' ? 'bg-amber-50 text-amber-800' : 'border border-line bg-porcelain text-ink'}`}>
              {m.text}
            </div>
          </div>
        ))}
        {sending && <div className="text-[13px] text-mute">Typing…</div>}
        <div ref={bottomRef} />
      </div>

      {!limitReached && (
        <div className="mt-3 flex gap-2">
          <input className={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type as if you were a customer…" maxLength={500} disabled={sending} />
          <button onClick={() => send()} disabled={sending || !text.trim()}
            className="rounded-lg bg-oxblood px-5 text-[14px] font-semibold text-porcelain disabled:opacity-50">Send</button>
        </div>
      )}

      <div className="mt-6 space-y-2.5">
        <button onClick={onNext} className={primaryBtn}>Looks good — continue</button>
        <button onClick={onEdit} className={ghostBtn}>Something’s off — edit my details</button>
      </div>
    </div>
  )
}

function CalendarStep({ connected, note, error, onConnect, onNext }) {
  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold text-ink leading-tight">Connect your Google Calendar</h1>
      <p className={`${helper} mt-2`}>When you confirm a booking request, it goes straight into your calendar — and we check you’re free first, so you don’t get double-booked.</p>

      <div className={`${card} mt-6`}>
        {note && <p className="mb-3 text-[13.5px] text-ink">{note}</p>}
        {connected ? (
          <p className="text-[14px] text-ink">✅ Your calendar is connected.</p>
        ) : (
          <>
            <button onClick={onConnect} className={primaryBtn}>Connect Google Calendar</button>
            <p className={`${helper} mt-3`}>You’ll sign in with Google and come right back here. We only add and read appointment times.</p>
          </>
        )}
        {error && <p className="mt-3 text-[13.5px] text-red-700">{error}</p>}
      </div>

      <div className="mt-6 space-y-2.5">
        {connected ? (
          <button onClick={onNext} className={primaryBtn}>Continue</button>
        ) : (
          <>
            <button onClick={onNext} className={ghostBtn}>I’ll do this later</button>
            <p className={`${helper} text-center`}>Until it’s connected, confirming a booking request will show an error — you can connect any time in Settings.</p>
          </>
        )}
      </div>
    </div>
  )
}

function LiveStep({ bookingUrl, hasNumber, calendarConnected, onDone }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }
  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold text-ink leading-tight">You’re ready for customers 🎉</h1>
      <p className={`${helper} mt-2`}>This is your booking page. Customers can chat with your AI, call you, or request a time.</p>

      <div className={`${card} mt-6`}>
        <label className={label}>Your booking link</label>
        <div className="flex gap-2">
          <input className={input} readOnly value={bookingUrl} onFocus={(e) => e.target.select()} />
          <button onClick={copy} className="shrink-0 rounded-lg bg-oxblood px-4 text-[14px] font-semibold text-porcelain">{copied ? 'Copied ✓' : 'Copy'}</button>
        </div>
        <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[13.5px] font-medium text-oxblood hover:underline">Open my booking page →</a>
      </div>

      <div className={`${card} mt-4`}>
        <p className="text-[14px] font-semibold text-ink">Do these two things now</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13.5px] text-ink/85">
          <li>Open your booking page on your phone and send yourself one test request.</li>
          <li>Put the link where customers already look: your Instagram bio, Google Business Profile, and a text to regulars.</li>
        </ol>
      </div>

      <div className={`${card} mt-4`}>
        <p className="text-[14px] font-semibold text-ink">What happens next</p>
        <p className={`${helper} mt-1.5`}>
          A request arrives → you get an email → you confirm it in your dashboard
          {calendarConnected ? ' and it lands in your calendar' : ' (connect your calendar first so confirming works)'}.
          {hasNumber
            ? ' Your customer is then texted the confirmed time.'
            : ' On the free plan your customers aren’t texted automatically yet, so you reach them by phone — upgrade any time to get your own number.'}
        </p>
      </div>

      <div className="mt-6">
        <button onClick={onDone} className={primaryBtn}>Go to my dashboard</button>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-porcelain" />}>
      <OnboardingContent />
    </Suspense>
  )
}
