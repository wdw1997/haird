'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function PublicBookingPage() {
  const { stylistId } = useParams()

  const [biz, setBiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [form, setForm] = useState({ name: '', phone: '', service: '', message: '', agreed: false })
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

  const input = { padding: 12, borderRadius: 8, border: '1px solid #ccc', width: '100%', fontSize: 15, boxSizing: 'border-box' }
  const label = { fontWeight: 600, marginTop: 16, marginBottom: 6, display: 'block', fontSize: 14 }

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
          Thanks{form.name ? `, ${form.name}` : ''}! {biz?.business_name || 'We'} will text you shortly to confirm.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 24px' }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>{biz?.business_name || 'Book an appointment'}</h1>
      {biz?.address && <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>{biz.address}</p>}
      <p style={{ color: '#666', fontSize: 15, marginTop: 16 }}>
        Tell us what you're looking for and we'll text you to confirm a time.
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

      <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
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

        <label style={label}>Anything else we should know? (optional)</label>
        <textarea
          style={{ ...input, height: 70, resize: 'vertical' }}
          placeholder="Preferred day/time, any details..."
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
        />

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 18, fontSize: 13, color: '#555', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.agreed}
            onChange={(e) => setForm({ ...form, agreed: e.target.checked })}
            style={{ marginTop: 2 }}
            required
          />
          <span>
            By submitting this form, you agree to receive SMS text messages from{' '}
            {biz?.business_name || 'this business'} regarding your inquiry/appointments.
            Message and data rates may apply. Reply STOP to opt out.
          </span>
        </label>

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
