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

  // 🔥 新增：带有登录 Token 的 Google 授权跳转函数
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
                </di
