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
  // the auth token instead of a bare link. openInNewTab mirrors the old
  // target="_blank" behavior for the plan-upgrade buttons.
  const goToCheckout = async (plan: 'pro' | 'team' | 'addon', openInNewTab = false) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) {
        if (openInNewTab) window.open(data.url, '_blank', 'noopener,noreferrer')
        else window.location.href = data.url
      } else {
        alert(data.error || 'Failed to start checkout')
      }
    } catch {
      alert('Failed to start checkout — please try again later')
    }
  }

  if (session === undefined) {
    return <div className="flex h-screen items-center justify-center bg-white"><div className="animate-pulse text-gray-400">Loading...</div></div>
  }

  if (session) {
    // 🔥 Effective limit = plan limit + top-up pack limit
    const effectiveSmsLimit = (stylist?.sms_limit || 3) + (stylist?.bonus_sms || 0)
    const effectiveVoiceLimit = (stylist?.voice_limit || 3) + (stylist?.bonus_voice || 0)
    const smsUsed = stylist?.sms_used || 0
    const voiceUsed = stylist?.voice_used || 0
    const smsPercent = effectiveSmsLimit > 0 ? (smsUsed / effectiveSmsLimit) * 100 : 0
    const voicePercent = effectiveVoiceLimit > 0 ? (voiceUsed / effectiveVoiceLimit) * 100 : 0
    const maxPercent = Math.max(smsPercent, voicePercent)
    const isExhausted = maxPercent >= 100
    const isNearLimit = maxPercent >= 80 && maxPercent < 100

    return (
      <div className="min-h-screen bg-gray-50 px-6 py-10">
        <div className="mx-auto max-w-md">
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Salon AI</h1>
            <p className="text-sm text-gray-500 mt-2">Smart Hairdresser Formula & SMS Assistant</p>
          </header>

          {calendarMsg && (
            <div className="mb-6 rounded-xl bg-blue-50 text-blue-700 text-sm p-3 text-center">
              {calendarMsg}
            </div>
          )}

          {/* 🔥 100% limit exhausted: hard block notice */}
          {isExhausted && (
            <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              <div className="font-bold mb-1">⛔ Limit reached</div>
              <p className="mb-3">Your AI assistant has paused auto-replies. Buy a top-up pack or upgrade your plan to resume service.</p>
              <div className="flex gap-2">
                <button onClick={() => goToCheckout('addon')} className="flex-1 text-center bg-red-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-red-700 transition border-0 cursor-pointer">
                  $9.90 Buy Top-up Pack
                </button>
                <Link href="#upgrade" className="flex-1 text-center bg-white border border-red-300 text-red-600 text-xs font-bold py-2 rounded-lg hover:bg-red-50 transition">
                  Upgrade Plan
                </Link>
              </div>
            </div>
          )}

          {/* 🔥 80% limit warning: yellow banner */}
          {isNearLimit && !isExhausted && (
            <div className="mb-6 rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800 text-center">
              You've used {Math.round(maxPercent)}% of your monthly limit. Please keep an eye on it.
            </div>
          )}

          <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-500">Current Plan</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase ${stylist?.plan_type === 'free' ? 'bg-gray-100 text-gray-600' : 'bg-black text-white'}`}>
                {stylist?.plan_type || 'FREE'}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>🎙️ Voice Formula Recognition</span>
                  <span>{voiceUsed} / {effectiveVoiceLimit} uses{stylist?.bonus_voice ? ` (incl. top-up +${stylist.bonus_voice})` : ''}</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full transition-all ${voicePercent >= 100 ? 'bg-red-500' : voicePercent >= 80 ? 'bg-yellow-500' : 'bg-black'}`} style={{ width: `${Math.min(100, voicePercent)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>💬 SMS Auto-Reply</span>
                  <span>{smsUsed} / {effectiveSmsLimit} messages{stylist?.bonus_sms ? ` (incl. top-up +${stylist.bonus_sms})` : ''}</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full transition-all ${smsPercent >= 100 ? 'bg-red-500' : smsPercent >= 80 ? 'bg-yellow-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, smsPercent)}%` }} />
                </div>
              </div>
            </div>
            <button onClick={() => goToCheckout('addon')} className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer">
              ⛽ $9.90 Buy 100 SMS / Voice Top-up Pack
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <Link href="/record" className="flex items-center justify-center gap-3 rounded-2xl bg-black p-4 text-base font-medium text-white shadow-md transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">🎙️</span> Record Formula
            </Link>
            <Link href="/clients" className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-4 text-base font-medium text-gray-900 shadow-sm transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">👥</span> Client List
            </Link>
            <Link href="/inbox" className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-4 text-base font-medium text-gray-900 shadow-sm transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">📨</span> Conversation History
            </Link>

            <button
              onClick={handleCalendarButtonClick}
              className={`flex w-full items-center justify-center gap-3 rounded-2xl p-4 text-base font-medium text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-95 border-0 cursor-pointer ${
                isCalendarConnected ? 'bg-green-600 hover:bg-green-700' : 'bg-[#4285F4]'
              }`}
            >
              <span className="text-xl">📅</span> {isCalendarConnected ? '✓ Connected — tap to view calendar' : 'Connect Google Calendar'}
            </button>

            <Link href="/settings" className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-4 text-base font-medium text-gray-900 shadow-sm transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">⚙️</span> Business Settings
            </Link>
          </div>

          <div id="upgrade" className="mt-8 rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-900 mb-1">Upgrade Plan</h2>
            <p className="text-xs text-gray-400 mb-4">Unlock more voice and SMS reply capacity</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => goToCheckout('pro', true)} className="w-full flex items-center justify-between rounded-xl bg-gray-900 p-3.5 text-white transition hover:bg-gray-800 border-0 cursor-pointer">
                <div>
                  <div className="font-medium text-sm">Upgrade to Solo Pro</div>
                  <div className="text-[11px] text-gray-400">300 voice uses + 200 SMS / month</div>
                </div>
                <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-md">$30/mo</span>
              </button>
              <button onClick={() => goToCheckout('team', true)} className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-gray-900 transition hover:bg-gray-100 cursor-pointer">
                <div>
                  <div className="font-medium text-sm">Upgrade to Team Salon</div>
                  <div className="text-[11px] text-gray-500">1000 voice uses + 600 SMS / month</div>
                </div>
                <span className="text-xs font-bold bg-gray-200 px-2 py-1 rounded-md">$60/mo</span>
              </button>
            </div>
          </div>

          <button onClick={handleLogout} className="mt-8 w-full rounded-xl py-3 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors">
            Log Out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-zinc-200">
      <nav className="flex items-center justify-between px-6 py-6 max-w-6xl mx-auto">
        <div className="text-xl font-bold tracking-tighter">Veloceia.</div>
        <Link href="/login" className="text-sm font-medium hover:text-zinc-500 transition-colors">
          Log in
        </Link>
      </nav>

      <main className="max-w-6xl mx-auto px-6 pt-20 pb-20 text-center">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter leading-tight mb-6">
          Focus on the hair.<br className="hidden md:block"/> Let AI handle the rest.
        </h1>
        <p className="text-lg md:text-xl text-zinc-500 max-w-2xl mx-auto mb-10">
          Salon AI Assistant - Your Smart Voice & SMS Hairdresser Tool.
          Record formulas with your voice, let AI automatically reply to your clients' booking texts, and sync your appointments seamlessly with Google Calendar.
        </p>
        <Link href="/login" className="inline-block bg-black text-white px-8 py-4 rounded-full font-medium hover:scale-105 transition-transform duration-300">
          Start for Free
        </Link>

        <div className="mt-20 max-w-4xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-zinc-200 bg-zinc-900">
          <div className="w-full h-8 bg-zinc-900 flex items-center px-4 gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
          </div>
          <div className="relative w-full bg-black">
            <video
              className="w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              controls
              src="/demo.mp4"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </main>

      <section className="bg-zinc-50 py-24 px-6 border-y border-zinc-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Simple, transparent pricing</h2>
            <p className="text-zinc-500">Upgrade when you need more power.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm flex flex-col">
              <h3 className="text-xl font-medium mb-2">Free Trial</h3>
              <div className="text-4xl font-bold mb-6">$0<span className="text-lg text-zinc-400 font-normal">/mo</span></div>
              <ul className="text-zinc-500 space-y-3 mb-8 flex-1 text-sm">
                <li>• 3 Voice Formulas</li>
                <li>• 3 AI SMS Replies</li>
                <li>• Client Database</li>
              </ul>
              <Link href="/login" className="block text-center w-full py-3 rounded-xl bg-zinc-100 text-zinc-900 font-medium hover:bg-zinc-200 transition">
                Sign Up
              </Link>
            </div>

            <div className="bg-black text-white p-8 rounded-3xl shadow-xl flex flex-col relative transform md:-translate-y-4">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Most Popular
              </div>
              <h3 className="text-xl font-medium mb-2">Solo Pro</h3>
              <div className="text-4xl font-bold mb-6">$30<span className="text-lg text-zinc-400 font-normal">/mo</span></div>
              <ul className="text-zinc-400 space-y-3 mb-8 flex-1 text-sm">
                <li>• 300 Voice Formulas/mo</li>
                <li>• 200 AI SMS Replies/mo</li>
                <li>• Priority Support</li>
              </ul>
              <Link href="/login" className="block text-center w-full py-3 rounded-xl bg-white text-black font-medium hover:bg-zinc-200 transition">
                Upgrade to Pro
              </Link>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm flex flex-col">
              <h3 className="text-xl font-medium mb-2">Team Salon</h3>
              <div className="text-4xl font-bold mb-6">$60<span className="text-lg text-zinc-400 font-normal">/mo</span></div>
              <ul className="text-zinc-500 space-y-3 mb-8 flex-1 text-sm">
                <li>• 1000 Voice Formulas/mo</li>
                <li>• 600 AI SMS Replies/mo</li>
                <li>• Perfect for small salons</li>
              </ul>
              <Link href="/login" className="block text-center w-full py-3 rounded-xl bg-zinc-100 text-zinc-900 font-medium hover:bg-zinc-200 transition">
                Upgrade to Team
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-6">
          <div className="text-zinc-400 text-sm">
            © {new Date().getFullYear()} Veloceia. All rights reserved.
          </div>
          <div className="flex gap-6 text-sm font-medium text-zinc-500">
            <a href="mailto:support@veloceia.com" className="hover:text-black transition">Contact: support@veloceia.com</a>
            <Link href="/terms" className="hover:text-black transition">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-black transition">Privacy Policy</Link>
          </div>
        </div>
        <div className="text-xs text-zinc-400 leading-relaxed border-t border-zinc-100 pt-6">
          Veloceia Global<br />
          No. 55 Xujiahuan, Jinniu Sector, Wuzhen,<br />
          Tongxiang, Zhejiang, China, 314501
        </div>
      </footer>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-white"><div className="animate-pulse text-gray-400">Loading...</div></div>}>
      <HomeContent />
    </Suspense>
  )
}
