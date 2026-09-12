'use client'
import Link from 'next/link'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase-client'
import { useRouter, useSearchParams } from 'next/navigation'

function HomeContent() {
  const [session, setSession] = useState<any>(undefined)
  const [stylist, setStylist] = useState<any>(null)
  const [calendarMsg, setCalendarMsg] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  const refreshStylist = () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        supabase
          .from('stylists')
          .select('*')
          .eq('auth_user_id', session.user.id)
          .maybeSingle()
          .then(({ data }) => setStylist(data))
      }
    })
  }

  useEffect(() => {
    refreshStylist()
  }, [])

  useEffect(() => {
    const calendarStatus = searchParams.get('calendar')
    const messages: Record<string, string> = {
      connected: '✅ Google Calendar connected successfully',
      cancelled: 'Authorization cancelled',
      no_refresh_token: '⚠️ No valid authorization received. Please reconnect (if you\'ve authorized before, revoke access in your Google account permissions and try again).',
      save_failed: '❌ Failed to save authorization. Please try again or contact support.',
      error: '❌ Connection failed. Please try again.',
    }
    if (calendarStatus && messages[calendarStatus]) {
      setCalendarMsg(messages[calendarStatus])
      refreshStylist()
    }
  }, [searchParams])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  const handleConnectGoogle = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/google/auth', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else alert(data.error || 'Connection failed')
  }

  const isCalendarConnected = !!stylist?.google_cal_refresh_token_encrypted

  const handleCalendarButtonClick = () => {
    if (isCalendarConnected) {
      router.push('/settings')
    } else {
      handleConnectGoogle()
    }
  }

  // Checkout links used to be plain <a href="/api/checkout?...&stylist=...">
  // tags — that meant the endpoint had to accept an unauthenticated
  // stylist id from the URL. Now the endpoint requires a session and always
  // checks out for the logged-in stylist, so this has to be a fetch with
  // the auth token instead of a bare link.
