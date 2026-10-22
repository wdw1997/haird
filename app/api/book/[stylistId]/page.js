'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

const inputStyle = { padding: 12, borderRadius: 8, border: '1px solid #ccc', width: '100%', fontSize: 15, boxSizing: 'border-box' }
const labelStyle = { fontWeight: 600, marginTop: 16, marginBottom: 6, display: 'block', fontSize: 14 }
const cardStyle = { border: '1px solid #e5e5e5', borderRadius: 12, padding: 16, marginTop: 20, background: '#fff' }
const primaryBtn = (disabled) => ({
  width: '100%', marginTop: 16, padding: 14, background: disabled ? '#999' : '#2563eb',
  color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
})

// Same opt-in wording the booking form has always used — kept identical on
// purpose so every place a number is collected shows one consistent consent.
function ConsentCheckbox({ biz, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 18, fontSize: 13, color: '#555', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2 }} required />
      <span>
        By checking this box, I agree to receive appointment updates and customer
        support text messages from {biz?.business_name || 'this business'} via
        Veloceia (operated by Xinwei (Tongxiang) E-Commerce Co., Ltd.).
        Message frequency varies. Message and data rates may apply. Reply STOP to opt
        out, HELP for help. View our{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>{' '}
        and{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>.
      </span>
    </label>
  )
}

// AI chat. The customer gives name + phone + consent first (they are texted
// once the owner confirms), then chats.
function ChatBox({ stylistId, biz }) {
  const [sessionId] = useState(() => crypto.randomUUID())
  const [started, setStarted] = useState(false)
  const [gate, setGate] = useState({ name: '', phone: '', agreed: false })
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
    const digits = gate.phone.replace(/[^\d]/g, '')
    if (digits.length < 10 || digits.length > 15) { setGateError('Please enter a valid phone number.'); return }
    if (!gate.agreed) { setGateError('Please check the box to agree to receive text messages.'); return }
    setGateError('')
    setStarted(true)
    setMessages([{ role: 'assistant', text: `Hi${gate.name ? ` ${gate.name.split(' ')[0]}` : ''}! I can help you book at ${biz?.business_name || 'the salon'}. What service are you looking for, and when would you like to come?` }])
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
        body: JSON.stringify({ sessionId, message: text, name: gate.name, phone: gate.phone, agreed: gate.agreed }),
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

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>💬 Book with our AI assistant</h2>
      <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Chat to find a time — {biz?.business_name || 'the salon'} confirms it and texts you.</p>

      {!started ? (
        <form onSubmit={startChat}>
          <label style={labelStyle}>Your name</label>
          <input style={inputStyle} placeholder="Jane Smith" value={gate.name} onChange={(e) => setGate({ ...gate, name: e.target.value })} />
          <label style={labelStyle}>Phone number *</label>
          <input style={inputStyle} type="tel" placeholder="(555) 123-4567" value={gate.phone} onChange={(e) => setGate({ ...gate, phone: e.target.value })} required />
          <ConsentCheckbox biz={biz} checked={gate.agreed} onChange={(v) => setGate({ ...gate, agreed: v })} />
          {gateError && <p style={{ color: '#d93025', fontSize: 13, marginTop: 12 }}>{gateError}</p>}
          <button type="submit" style={primaryBtn(false)}>Start chat</button>
        </form>
      ) : (
        <>
          <div style={{ height: 300, overflowY: 'auto', border: '1px solid #eee', borderRadius: 10, padding: 12, background: '#fafafa', marginTop: 14 }}>
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
              ✅ Request sent. {biz?.business_name || 'The salon'} will text you once it's confirmed.
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
      )}
    </div>
  )
}

// Click-to-call, plus a pointer back to the chat if nobody picks up.
function CallBlock({ biz, chatEnabled }) {
  if (!biz?.contact_phone) return null
  const dial = biz.contact_phone.replace(/[^\d+]/g, '')
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>📞 Prefer to call?</h2>
      <a href={`tel:${dial}`} style={{
        display: 'block', textAlign: 'center', padding: 12, borderRadius: 8, border: '1px solid #2563eb',
        color: '#2563eb', fontWeight: 600, textDecoration: 'none', fontSize: 15,
      }}>
        Call {biz.business_name || 'us'} — {biz.contact_phone}
      </a>
      <p style={{ fontSize: 13, color: '#666', margin: '10px 0 0' }}>
        No answer? {chatEnabled ? 'Book with the AI assistant above, ' : 'Fill in the booking form below, '}or leave your number below and we'll call you back.
      </p>
    </div>
  )
}

// "Call me back" — no time picked, no text-message consent: the owner phones.
function CallbackForm({ stylistId, biz }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', phone: '', callWindow: '' })
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      const res = await fetch(`/api/book/${stylistId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'callback', ...f }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Something went wrong. Please try again.')
      else setDone(true)
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setSending(false)
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 17, margin: 0 }}>🔔 Request a call back</h2>
      {done ? (
        <p style={{ fontSize: 14, color: '#166534', marginBottom: 0 }}>
          ✅ Got it{f.name ? `, ${f.name}` : ''}! {biz?.business_name || 'The salon'} will call you soon.
        </p>
      ) : !open ? (
        <>
          <p style={{ fontSize: 13, color: '#666', margin: '6px 0 0' }}>Leave your number and {biz?.business_name || 'the salon'} will phone you to book.</p>
          <button type="button" onClick={() => setOpen(true)} style={{ ...primaryBtn(false), marginTop: 12, background: 'white', color: '#2563eb', border: '1px solid #2563eb' }}>
            Call me back
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <label style={labelStyle}>Your name</label>
          <input style={inputStyle} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <label style={labelStyle}>Phone number *</label>
          <input style={inputStyle} type="tel" placeholder="(555) 123-4567" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
          <label style={labelStyle}>Best time to call (optional)</label>
          <input style={inputStyle} placeholder="e.g. weekdays after 5pm" value={f.callWindow} onChange={(e) => setF({ ...f, callWindow: e.target.value })} />
          <p style={{ fontSize: 12, color: '#777', marginTop: 12 }}>
            {biz?.business_name || 'The salon'} will call this number to arrange your appointment.
          </p>
          {error && <p style={{ color: '#d93025', fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={sending} style={primaryBtn(sending)}>{sending ? 'Sending...' : 'Send'}</button>
        </form>
      )}
    </div>
  )
}

export default function PublicBookingPage() {
  const { stylistId } = useParams()

  const [biz, setBiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [form, setForm] = useState({ name: '', phone: '', service: '', message: '', date: '', time: '', duration: 60, agreed: false })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

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

    if (!form.phone.trim()) {
      setError('Please enter your phone number.')
      return
    }
    if (!form.date || !form.time) {
      setError('Please choose a preferred date and time.')
      return
    }
    if (!form.agreed) {
      setError('Please check the box to agree to receive text messages.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/book/${stylistId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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

  const input = inputStyle
  const label = labelStyle

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
          Thanks{form.name ? `, ${form.name}` : ''}! {biz?.business_name || 'We'} will text you shortly to confirm
          {form.date && form.time ? ' your requested time' : ''}.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 24px' }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>{biz?.business_name || 'Book an appointment'}</h1>
      {biz?.address && <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>{biz.address}</p>}
      <p style={{ color: '#666', fontSize: 15, marginTop: 16 }}>
        Book online, or call us. We'll text you once your time is confirmed.
      </p>

      {biz?.services?.length > 0 && (
        <div style={{ margin: '16px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {biz.services.map((s, i) => (
            <span key={i} style={{ background: '#f1f1f1', borderRadius: 20, padding: '4px 12px', fontSize: 13, color: '#444' }}>
              {typeof s === 'string' ? s : s.name}
            </span>
          ))}
        </div>
      )}

      {biz?.chat_enabled && <ChatBox stylistId={stylistId} biz={biz} />}
      <CallBlock biz={biz} chatEnabled={!!biz?.chat_enabled} />
      <CallbackForm stylistId={stylistId} biz={biz} />

      <h2 style={{ fontSize: 17, margin: '32px 0 0' }}>📝 Or request a time with the form</h2>
      <form onSubmit={handleSubmit} style={{ marginTop: 4 }}>
        <label style={label}>Your name</label>
        <input
          style={input}
          placeholder="Jane Smith"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />

        <label style={label}>Phone number *</label>
        <input
          style={input}
          type="tel"
          placeholder="(555) 123-4567"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          required
        />

        <label style={label}>What are you looking for?</label>
        <input
          style={input}
          placeholder="e.g. Haircut, Color, Balayage"
          value={form.service}
          onChange={(e) => setForm({ ...form, service: e.target.value })}
        />

        <label style={label}>When would you like to come?</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <input
              style={input}
              type="date"
              value={form.date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Preferred date</div>
          </div>
          <div style={{ flex: 1 }}>
            <input
              style={input}
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              required
            />
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Preferred time</div>
          </div>
        </div>

        <label style={label}>Appointment length</label>
        <select
          style={input}
          value={form.duration}
          onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
        >
          <option value={30}>30 minutes</option>
          <option value={60}>60 minutes</option>
          <option value={90}>90 minutes</option>
          <option value={120}>120 minutes</option>
        </select>

        <label style={label}>Anything else we should know? (optional)</label>
        <textarea
          style={{ ...input, height: 70, resize: 'vertical' }}
          placeholder="Preferred day/time, any details..."
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
        />

        <ConsentCheckbox biz={biz} checked={form.agreed} onChange={(v) => setForm({ ...form, agreed: v })} />

        {error && <p style={{ color: '#d93025', fontSize: 13, marginTop: 12 }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%', marginTop: 20, padding: 14, background: submitting ? '#999' : '#2563eb',
            color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Sending...' : 'Book Now'}
        </button>
      </form>
    </div>
  )
}
