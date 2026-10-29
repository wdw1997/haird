'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

const inputStyle = { padding: 12, borderRadius: 8, border: '1px solid #ccc', width: '100%', fontSize: 15, boxSizing: 'border-box', background: '#fff' }
const labelStyle = { fontWeight: 600, marginTop: 16, marginBottom: 6, display: 'block', fontSize: 14 }
const primaryBtn = (disabled) => ({
  width: '100%', marginTop: 16, padding: 14, background: disabled ? '#999' : '#2563eb',
  color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
})

// ---- date / time choices -------------------------------------------------
// Native <input type="date"/"time"> draw their text in the visitor's browser
// language (a Chinese browser shows 年/月/日), so the booking page uses plain
// dropdowns with English labels instead. Values keep the same YYYY-MM-DD and
// HH:mm shape the booking API already expects.
const pad = (n) => String(n).padStart(2, '0')

// US / Canada numbers only. Mirrors lib/phone.js (the server re-checks).
function isValidUsPhone(input) {
  let digits = String(input || '').replace(/[^\d]/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)
}

function buildDateOptions(days = 60) {
  const out = []
  const start = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    out.push({
      value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    })
  }
  return out
}

function buildTimeOptions() {
  const out = []
  for (let mins = 8 * 60; mins <= 20 * 60; mins += 30) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    out.push({ value: `${pad(h)}:${pad(m)}`, label: `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}` })
  }
  return out
}

// Opt-in. The first line is the exact sentence the carrier registration
// requires (notification messages, naming the brand) and stays on its own
// line; the required disclosures sit underneath in smaller type.
const SMS_BRAND = 'Veloceia'

function ConsentCheckbox({ biz, checked, onChange }) {
  return (
    <div style={{ marginTop: 18 }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} required />
        <span style={{ fontSize: 14, color: '#222', fontWeight: 500 }}>
          I agree to receive notification text message from {SMS_BRAND}.
        </span>
      </label>
      <p style={{ fontSize: 12, color: '#777', margin: '8px 0 0 24px', lineHeight: 1.5 }}>
        Appointment confirmations and updates from {biz?.business_name || 'this business'}, sent via {SMS_BRAND} (operated by
        Xinwei (Tongxiang) E-Commerce Co., Ltd.). Message frequency varies. Message and data rates may apply.
        Reply STOP to opt out, HELP for help. View our{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>{' '}
        and{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>.
      </p>
    </div>
  )
}

// Name / phone / consent are shared by both ways of booking, so switching
// tabs never makes the customer type them again.
function ContactFields({ biz, contact, setContact }) {
  return (
    <>
      <label style={{ ...labelStyle, marginTop: 0 }}>Your name</label>
      <input style={inputStyle} placeholder="Jane Smith" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
      <label style={labelStyle}>Phone number *</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ ...inputStyle, width: 64, flex: 'none', textAlign: 'center', background: '#f5f5f5', color: '#444', fontWeight: 600 }} aria-label="Country code">+1</div>
        <input style={{ ...inputStyle, flex: 1, width: 'auto' }} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(555) 123-4567" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} required />
      </div>
    </>
  )
}

// AI chat. Name + phone + consent come from the shared fields above; the chat
// starts once they're filled in.
function ChatBox({ stylistId, biz, contact, setContact }) {
  const [sessionId] = useState(() => crypto.randomUUID())
  const [started, setStarted] = useState(false)
  const [gateError, setGateError] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [requested, setRequested] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  const startChat = (e) => {
    e.preventDefault()
    if (!isValidUsPhone(contact.phone)) { setGateError('Please enter a valid US phone number.'); return }
    if (!contact.agreed) { setGateError('Please check the box to agree to receive text messages.'); return }
    setGateError('')
    setStarted(true)
    setMessages([{ role: 'assistant', text: `Hi${contact.name ? ` ${contact.name.split(' ')[0]}` : ''}! I can help you book at ${biz?.business_name || 'the salon'}. What service are you looking for, and when would you like to come?` }])
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending || unavailable) return
    setInput('')
    setMessages(prev => [...prev, { role: 'customer', text }])
    setSending(true)
    try {
      const res = await fetch(`/api/book/${stylistId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text, name: contact.name, phone: contact.phone, agreed: contact.agreed }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403) setUnavailable(true)
        setMessages(prev => [...prev, { role: 'system', text: data.message || data.error || 'Something went wrong. Please try again.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.reply }])
        if (data.requested) setRequested(true)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'system', text: 'Something went wrong. Please try again.' }])
    }
    setSending(false)
  }

  if (!started) {
    return (
      <form onSubmit={startChat}>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 14px' }}>
          Chat to find a time — {biz?.business_name || 'the salon'} confirms it{biz?.can_text ? ' and texts you' : ' and contacts you'}.
        </p>
        <ContactFields biz={biz} contact={contact} setContact={setContact} />
        <ConsentCheckbox biz={biz} checked={contact.agreed} onChange={(v) => setContact({ ...contact, agreed: v })} />
        {gateError && <p style={{ color: '#d93025', fontSize: 13, marginTop: 12 }}>{gateError}</p>}
        <button type="submit" style={primaryBtn(false)}>Start chat</button>
      </form>
    )
  }

  return (
    <>
      <div style={{ height: 320, overflowY: 'auto', border: '1px solid #eee', borderRadius: 10, padding: 12, background: '#fafafa' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'customer' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
            <div style={{
              maxWidth: '80%', padding: '8px 12px', borderRadius: 14, fontSize: 14, lineHeight: 1.4,
              background: m.role === 'customer' ? '#2563eb' : m.role === 'system' ? '#fef3c7' : 'white',
              color: m.role === 'customer' ? 'white' : m.role === 'system' ? '#92400e' : '#111',
              border: m.role === 'assistant' ? '1px solid #e5e5e5' : 'none',
            }}>{m.text}</div>
          </div>
        ))}
        {sending && <div style={{ color: '#999', fontSize: 13 }}>Typing...</div>}
        <div ref={bottomRef} />
      </div>
      {requested && (
        <p style={{ fontSize: 13, color: '#166534', background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', margin: '10px 0 0' }}>
          ✅ Request sent. {biz?.business_name || 'The salon'} {biz?.can_text ? "will text you once it's confirmed." : 'will contact you to confirm.'}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          value={input}
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          style={{ ...inputStyle, flex: 1, width: 'auto' }}
          disabled={sending || unavailable}
        />
        <button onClick={send} disabled={sending || unavailable || !input.trim()}
          style={{ padding: '0 18px', background: sending || !input.trim() ? '#ccc' : '#2563eb', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600 }}>
          Send
        </button>
      </div>
    </>
  )
}

export default function PublicBookingPage() {
  const { stylistId } = useParams()

  const [biz, setBiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [mode, setMode] = useState('chat') // 'chat' | 'form'

  // shared by both modes
  const [contact, setContact] = useState({ name: '', phone: '', agreed: false })
  // form-only
  const [form, setForm] = useState({ service: '', message: '', date: '', time: '', duration: 60 })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const dateOptions = useMemo(() => buildDateOptions(), [])
  const timeOptions = useMemo(() => buildTimeOptions(), [])

  useEffect(() => {
    if (!stylistId) return
    fetch(`/api/book/${stylistId}`)
      .then(async (res) => {
        if (!res.ok) { setNotFound(true); return }
        setBiz(await res.json())
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [stylistId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!isValidUsPhone(contact.phone)) {
      setError('Please enter a valid US phone number.')
      return
    }
    if (!form.date || !form.time) {
      setError('Please choose a preferred date and time.')
      return
    }
    if (!contact.agreed) {
      setError('Please check the box to agree to receive text messages.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/book/${stylistId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, name: contact.name, phone: contact.phone, agreed: contact.agreed }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setSubmitting(false)
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>Loading...</div>
  }

  if (notFound) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
        This booking page isn't available.
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Request received!</h1>
        <p style={{ color: '#666', fontSize: 15 }}>
          Thanks{contact.name ? `, ${contact.name}` : ''}! {biz?.business_name || 'We'} {biz?.can_text ? 'will text you' : 'will contact you'} shortly to confirm
          {form.date && form.time ? ' your requested time' : ''}.
        </p>
      </div>
    )
  }

  const chatEnabled = !!biz?.chat_enabled
  // The salon's address is often saved with a trailing comma.
  const address = (biz?.address || '').replace(/[,\s]+$/, '')
  const dial = (biz?.contact_phone || '').replace(/[^\d+]/g, '')
  const showForm = !chatEnabled || mode === 'form'
  const showChat = chatEnabled && mode === 'chat'

  const tabStyle = (active) => ({
    flex: 1, padding: '10px 8px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    background: active ? '#fff' : 'transparent', color: active ? '#111' : '#666',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
  })

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.03em', color: '#111', marginBottom: 14 }}>Veloceia.</div>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>{biz?.business_name || 'Book an appointment'}</h1>
      {(address || biz?.contact_phone) && (
        <p style={{ color: '#666', fontSize: 14, marginTop: 0, marginBottom: 0 }}>
          {address && <span>📍 {address}</span>}
          {address && biz?.contact_phone && <span> · </span>}
          {biz?.contact_phone && (
            <a href={`tel:${dial}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>📞 {biz.contact_phone}</a>
          )}
        </p>
      )}

      {biz?.services?.length > 0 && (
        <div style={{ margin: '16px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {biz.services.map((s, i) => (
            <span key={i} style={{ background: '#f1f1f1', borderRadius: 20, padding: '4px 12px', fontSize: 13, color: '#444' }}>
              {typeof s === 'string' ? s : s.name}
            </span>
          ))}
        </div>
      )}

      {chatEnabled && (
        <div style={{ display: 'flex', gap: 4, background: '#f1f1f1', borderRadius: 10, padding: 4, marginTop: 8 }}>
          <button type="button" style={tabStyle(mode === 'chat')} onClick={() => setMode('chat')}>💬 Chat with AI</button>
          <button type="button" style={tabStyle(mode === 'form')} onClick={() => setMode('form')}>📝 Quick form</button>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {/* Kept mounted (just hidden) so an ongoing chat isn't lost when someone peeks at the form. */}
        {chatEnabled && (
          <div style={{ display: showChat ? 'block' : 'none' }}>
            <ChatBox stylistId={stylistId} biz={biz} contact={contact} setContact={setContact} />
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit}>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 14px' }}>
              Request a time — {biz?.business_name || 'the salon'} confirms it{biz?.can_text ? ' and texts you' : ' and contacts you'}.
            </p>
            <ContactFields biz={biz} contact={contact} setContact={setContact} />

            <label style={labelStyle}>What are you looking for?</label>
            <input
              style={inputStyle}
              placeholder="e.g. Haircut, Color, Balayage"
              value={form.service}
              onChange={(e) => setForm({ ...form, service: e.target.value })}
            />

            <label style={labelStyle}>When would you like to come?</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <select style={{ ...inputStyle, flex: 1.2 }} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required aria-label="Preferred date">
                <option value="">Choose a date</option>
                {dateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select style={{ ...inputStyle, flex: 1 }} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required aria-label="Preferred time">
                <option value="">Choose a time</option>
                {timeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <label style={labelStyle}>Appointment length</label>
            <select
              style={inputStyle}
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
            >
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
              <option value={120}>120 minutes</option>
            </select>

            <label style={labelStyle}>Anything else we should know? (optional)</label>
            <textarea
              style={{ ...inputStyle, height: 70, resize: 'vertical' }}
              placeholder="Preferred day/time, any details..."
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />

            <ConsentCheckbox biz={biz} checked={contact.agreed} onChange={(v) => setContact({ ...contact, agreed: v })} />

            {error && <p style={{ color: '#d93025', fontSize: 13, marginTop: 12 }}>{error}</p>}

            <button type="submit" disabled={submitting} style={{ ...primaryBtn(submitting), marginTop: 20 }}>
              {submitting ? 'Sending...' : 'Book Now'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
