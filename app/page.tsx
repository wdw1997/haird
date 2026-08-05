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
      connected: '✅ Google 日历已成功连接',
      cancelled: '已取消授权',
      no_refresh_token: '⚠️ 未获取到有效授权，请重新连接（如果之前已授权过，去 Google 账号权限里撤销后重试）',
      save_failed: '❌ 保存授权信息失败，请重试或联系客服',
      error: '❌ 连接失败，请重试',
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
    else alert(data.error || '连接失败')
  }

  const isCalendarConnected = !!stylist?.google_cal_refresh_token_encrypted

  const handleCalendarButtonClick = () => {
    if (isCalendarConnected) {
      router.push('/settings')
    } else {
      handleConnectGoogle()
    }
  }

  if (session === undefined) {
    return <div className="flex h-screen items-center justify-center bg-white"><div className="animate-pulse text-gray-400">Loading...</div></div>
  }

  if (session) {
    const proUrl = stylist ? `/api/checkout?plan=pro&stylist=${stylist.id}` : '#'
    const teamUrl = stylist ? `/api/checkout?plan=team&stylist=${stylist.id}` : '#'
    const addonUrl = stylist ? `/api/checkout?plan=addon&stylist=${stylist.id}` : '#'

    // 🔥 有效额度 = 套餐额度 + 加油包额度
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
            <p className="text-sm text-gray-500 mt-2">智能发型师配方与短信助手</p>
          </header>

          {calendarMsg && (
            <div className="mb-6 rounded-xl bg-blue-50 text-blue-700 text-sm p-3 text-center">
              {calendarMsg}
            </div>
          )}

          {/* 🔥 100%额度耗尽:强制拦截提示 */}
          {isExhausted && (
            <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              <div className="font-bold mb-1">⛔ 额度已耗尽</div>
              <p className="mb-3">AI 助理已暂停自动回复，请购买加油包或升级套餐以恢复服务。</p>
              <div className="flex gap-2">
                <a href={addonUrl} className="flex-1 text-center bg-red-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-red-700 transition">
                  $9.90 购买加油包
                </a>
                <Link href="#upgrade" className="flex-1 text-center bg-white border border-red-300 text-red-600 text-xs font-bold py-2 rounded-lg hover:bg-red-50 transition">
                  升级套餐
                </Link>
              </div>
            </div>
          )}

          {/* 🔥 80%额度预警:黄色横幅 */}
          {isNearLimit && !isExhausted && (
            <div className="mb-6 rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800 text-center">
              您的本月额度已使用 {Math.round(maxPercent)}%，请留意。
            </div>
          )}

          <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-500">当前版本</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase ${stylist?.plan_type === 'free' ? 'bg-gray-100 text-gray-600' : 'bg-black text-white'}`}>
                {stylist?.plan_type || 'FREE'}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>🎙️ 语音配方识别</span>
                  <span>{voiceUsed} / {effectiveVoiceLimit} 次{stylist?.bonus_voice ? ` (含加油包+${stylist.bonus_voice})` : ''}</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full transition-all ${voicePercent >= 100 ? 'bg-red-500' : voicePercent >= 80 ? 'bg-yellow-500' : 'bg-black'}`} style={{ width: `${Math.min(100, voicePercent)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>💬 短信自动回复</span>
                  <span>{smsUsed} / {effectiveSmsLimit} 条{stylist?.bonus_sms ? ` (含加油包+${stylist.bonus_sms})` : ''}</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full transition-all ${smsPercent >= 100 ? 'bg-red-500' : smsPercent >= 80 ? 'bg-yellow-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, smsPercent)}%` }} />
                </div>
              </div>
            </div>
            <a href={addonUrl} className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition">
              ⛽ $9.90 购买 100条短信/语音扩充包
            </a>
          </div>

          <div className="flex flex-col gap-3">
            <Link href="/record" className="flex items-center justify-center gap-3 rounded-2xl bg-black p-4 text-base font-medium text-white shadow-md transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">🎙️</span> 录制配方
            </Link>
            <Link href="/clients" className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-4 text-base font-medium text-gray-900 shadow-sm transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">👥</span> 顾客列表
            </Link>
            <Link href="/inbox" className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-4 text-base font-medium text-gray-900 shadow-sm transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">📨</span> 对话记录
            </Link>

            <button
              onClick={handleCalendarButtonClick}
              className={`flex w-full items-center justify-center gap-3 rounded-2xl p-4 text-base font-medium text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-95 border-0 cursor-pointer ${
                isCalendarConnected ? 'bg-green-600 hover:bg-green-700' : 'bg-[#4285F4]'
              }`}
            >
              <span className="text-xl">📅</span> {isCalendarConnected ? '✓ 已连接，点击查看日历' : '连接 Google 日历'}
            </button>

            <Link href="/settings" className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-4 text-base font-medium text-gray-900 shadow-sm transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">⚙️</span> 商家设置 (Settings)
            </Link>
          </div>

          <div id="upgrade" className="mt-8 rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-900 mb-1">升级套餐</h2>
            <p className="text-xs text-gray-400 mb-4">解锁更多语音与短信回复额度</p>
            <div className="flex flex-col gap-3">
              <a href={proUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl bg-gray-900 p-3.5 text-white transition hover:bg-gray-800">
                <div>
                  <div className="font-medium text-sm">升级 Pro 个人版</div>
                  <div className="text-[11px] text-gray-400">300次语音 + 200条短信/月</div>
                </div>
                <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-md">$30/月</span>
              </a>
              <a href={teamUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-gray-900 transition hover:bg-gray-100">
                <div>
                  <div className="font-medium text-sm">升级 Team 沙龙版</div>
                  <div className="text-[11px] text-gray-500">1000次语音 + 600条短信/月</div>
                </div>
                <span className="text-xs font-bold bg-gray-200 px-2 py-1 rounded-md">$60/月</span>
              </a>
            </div>
          </div>

          <button onClick={handleLogout} className="mt-8 w-full rounded-xl py-3 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors">
            退出登录
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
