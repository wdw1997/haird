'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import Link from 'next/link'

export default function DemoChatPage() {
  const [stylistId, setStylistId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionId] = useState(() => crypto.randomUUID())

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: stylist } = await supabase.from('stylists').select('id').eq('auth_user_id', user.id).maybeSingle()
      setStylistId(stylist?.id || null)
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || sending || quotaExceeded) return
    setInput('')
    setMessages(prev => [...prev, { role: 'customer', text }])
    setSending(true)

    try {
      const res = await fetch('/api/demo-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stylistId, sessionId, message: text }),
      })
      const data = await res.json()

      if (res.status === 402) {
        setQuotaExceeded(true)
        setMessages(prev => [...prev, { role: 'system', text: data.message }])
      } else if (!res.ok) {
        setMessages(prev => [...prev, { role: 'system', text: 'Something went wrong. Please try again.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.reply }])
        setRemaining(data.remaining)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'system', text: 'Something went wrong. Please try again.' }])
    }
    setSending(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>Loading...</div>
  if (!stylistId) return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>Please log in to try the demo.</div>

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/settings" style={{ fontSize: 13, color: '#666', textDecoration: 'none' }}>← Back to Settings</Link>
        <h1 style={{ fontSize: 22, margin: '8px 0 4px' }}>💬 Try Your AI Assistant</h1>
        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
          Pretend you're a customer texting in. This uses the exact same AI logic as your real SMS/Instagram line — no real number needed.
          {remaining !== null && !quotaExceeded && <span> ({remaining} free {remaining === 1 ? 'message' : 'messages'} left)</span>}
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e5e5e5', borderRadius: 12, padding: 16, background: '#fafafa' }}>
        {messages.length === 0 && (
          <p style={{ color: '#999', fontSize: 14, textAlign: 'center', marginTop: 40 }}>
            Try something like "Hi, do you have any openings this week for a haircut?"
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'customer' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{
              maxWidth: '75%', padding: '10px 14px', borderRadius: 16, fontSize: 14, lineHeight: 1.4,
              background: m.role === 'customer' ? '#2563eb' : m.role === 'system' ? '#fef3c7' : 'white',
              color: m.role === 'customer' ? 'white' : m.role === 'system' ? '#92400e' : '#111',
              border: m.role === 'assistant' ? '1px solid #e5e5e5' : 'none',
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {sending && <div style={{ color: '#999', fontSize: 13 }}>Assistant is typing...</div>}
        <div ref={bottomRef} />
      </div>

      {quotaExceeded ? (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link href="/settings" style={{
            display: 'inline-block', padding: '12px 24px', background: '#2563eb', color: 'white',
            borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14,
          }}>
            Upgrade to keep testing →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type a message as if you were a customer..."
            style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            style={{
              padding: '0 20px', background: sending || !input.trim() ? '#ccc' : '#2563eb', color: 'white',
              border: 'none', borderRadius: 8, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
            }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  )
}
