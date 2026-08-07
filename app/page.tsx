'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [session, setSession] = useState<any>(undefined)
  const [stylist, setStylist] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
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
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  if (session === undefined) {
    return <div className="flex h-screen items-center justify-center bg-white"><div className="animate-pulse text-gray-400">Loading...</div></div>
  }

  if (session) {
    const proUrl = stylist ? `/api/checkout?plan=pro&stylist=${stylist.id}` : '#'
    const teamUrl = stylist ? `/api/checkout?plan=team&stylist=${stylist.id}` : '#'
    const addonUrl = stylist ? `/api/checkout?plan=addon&stylist=${stylist.id}` : '#'
    const nearLimit = stylist && (stylist.sms_used >= stylist.sms_limit * 0.8 || stylist.voice_used >= stylist.voice_limit * 0.8)

    return (
      <div className="min-h-screen bg-gray-50 px-6 py-10">
        <div className="mx-auto max-w-md">
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Salon AI</h1>
            <p className="text-sm text-gray-500 mt-2">Smart voice formulas & SMS assistant for hairdressers</p>
          </header>

          {nearLimit && (
            <div className="mb-6 rounded-xl bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
              ⚠️ You've used over 80% of your monthly quota. Consider upgrading or buying a top-up pack to avoid interruption.
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
                  <span>🎙️ Voice Formulas</span>
                  <span>{stylist?.voice_used || 0} / {stylist?.voice_limit || 10}</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-black transition-all" style={{ width: `${Math.min(100, ((stylist?.voice_used || 0) / (stylist?.voice_limit || 10)) * 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>💬 AI SMS Replies</span>
                  <span>{stylist?.sms_used || 0} / {stylist?.sms_limit || 10}</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, ((stylist?.sms_used || 0) / (stylist?.sms_limit || 10)) * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Link href="/record" className="flex items-center justify-center gap-3 rounded-2xl bg-black p-4 text-base font-medium text-white shadow-md transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">🎙️</span> Record Formula
            </Link>
            <Link href="/clients" className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-4 text-base font-medium text-gray-900 shadow-sm transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">👥</span> Client List
            </Link>
            <Link href="/inbox" className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-4 text-base font-medium text-gray-900 shadow-sm transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">💬</span> Inbox
            </Link>
            <Link href="/settings" className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-4 text-base font-medium text-gray-900 shadow-sm transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">⚙️</span> Business Settings
            </Link>
            <a href="/api/google/auth" className="flex items-center justify-center gap-3 rounded-2xl bg-[#4285F4] p-4 text-base font-medium text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">📅</span> Connect Google Calendar
            </a>
          </div>

          <div className="mt-8 rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-900 mb-1">Upgrade Plan</h2>
            <p className="text-xs text-gray-400 mb-4">Unlock more voice & SMS reply credits</p>
            <div className="flex flex-col gap-3">
              <a href={proUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl bg-gray-900 p-3.5 text-white transition hover:bg-gray-800">
                <div>
                  <div className="font-medium text-sm">Upgrade to Solo Pro</div>
                  <div className="text-[11px] text-gray-400">300 voice + 200 SMS replies/mo</div>
                </div>
                <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-md">$19.90/mo</span>
              </a>
              <a href={teamUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-gray-900 transition hover:bg-gray-100">
                <div>
                  <div className="font-medium text-sm">Upgrade to Team Salon</div>
                  <div className="text-[11px] text-gray-500">1000 voice + 600 SMS replies/mo</div>
                </div>
                <span className="text-xs font-bold bg-gray-200 px-2 py-1 rounded-md">$29.90/mo</span>
              </a>
              <a href={addonUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-gray-900 transition hover:bg-gray-100">
                <div>
                  <div className="font-medium text-sm">Buy Top-up Pack</div>
                  <div className="text-[11px] text-gray-500">+100 voice/SMS credits</div>
                </div>
                <span className="text-xs font-bold bg-gray-200 px-2 py-1 rounded-md">$9.90</span>
              </a>
            </div>
          </div>

          <button onClick={handleLogout} className="mt-8 w-full rounded-xl py-3 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors">
            Log Out
          </button>
        </div>
      </div>
    )
  }
  // Not logged in: landing page
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
          Salon AI Assistant — Your Smart Voice & SMS Hairdresser Tool.
          Record formulas with your voice and let AI automatically reply to your clients' booking texts.
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
            <video className="w-full h-full object-cover" autoPlay muted loop playsInline controls src="/demo.mp4">
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
                <li>• 10 Voice Formulas</li>
                <li>• 10 AI SMS Replies</li>
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
              <div className="text-4xl font-bold mb-6">$19.90<span className="text-lg text-zinc-400 font-normal">/mo</span></div>
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
              <div className="text-4xl font-bold mb-6">$29.90<span className="text-lg text-zinc-400 font-normal">/mo</span></div>
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

      <footer className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="text-zinc-400 text-sm">
          © {new Date().getFullYear()} Veloceia. All rights reserved.
        </div>
        <div className="flex gap-6 text-sm font-medium text-zinc-500">
          <a href="mailto:support@veloceia.com" className="hover:text-black transition">Contact: support@veloceia.com</a>
          <Link href="/terms" className="hover:text-black transition">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-black transition">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  )
}
