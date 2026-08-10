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
