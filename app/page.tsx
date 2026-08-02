'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { useRouter, useSearchParams } from 'next/navigation'

export default function Home() {
  const [session, setSession] = useState<any>(undefined)
  const [stylist, setStylist] = useState<any>(null)
  const [calendarMsg, setCalendarMsg] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

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
      // 重新拉一次 stylist，把最新的 google_cal_refresh_token_encrypted 状态刷新出来
      supabase.auth.getSession().then(({ data: { session } }) => {
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
  }, [searchParams])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  // 🔥 带有登录 Token 的 Google 授权跳转函数
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

  // 1. 加载中状态
  if (session === undefined) {
    return <div className="flex h-screen items-center justify-center bg-white"><div className="animate-pulse text-gray-400">Loading...</div></div>
  }

  // 2. 已登录：显示理发师控制台 (Dashboard)
  if (session) {
    const proUrl = stylist ? `/api/checkout?plan=pro&stylist=${stylist.id}` : '#'
    const teamUrl = stylist ? `/api/checkout?plan=team&stylist=${stylist.id}` : '#'

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
                  <span>{stylist?.voice_used || 0} / {stylist?.voice_limit || 10} 次</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-black transition-all" style={{ width: `${Math.min(100, ((stylist?.voice_used || 0) / (stylist?.voice_limit || 10)) * 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>💬 短信自动回复</span>
                  <span>{stylist?.sms_used || 0} / {stylist?.sms_limit || 10} 条</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, ((stylist?.sms_used || 0) / (stylist?.sms_limit || 10)) * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Link href="/record" className="flex items-center justify-center gap-3 rounded-2xl bg-black p-4 text-base font-medium text-white shadow-md transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">🎙️</span> 录制配方
            </Link>
            <Link href="/clients" className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-4 text-base font-medium text-gray-900 shadow-sm transition-transform hover:scale-[1.01] active:scale-95">
              <span className="text-xl">👥</span> 顾客列表
            </Link>

            <button
              onClick={handleConnectGoogle}
              className={`flex w-full items-center justify-center gap-3 rounded-2xl p-4 text-base font-medium text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-95 border-0 cursor-pointer ${
                isCalendarConnected ? 'bg-green-600 hover:bg-green-700' : 'bg-[#4285F4]'
              }`}
            >
              <span className="text-xl">📅</span> {isCalendarConnected ? '✓ 已连接 Google 日历' : '连接 Google 日历'}
            </button>

            <Link href="/settings" className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-4 text-base
