'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [session, setSession] = useState<any>(null)
  const [stylistInfo, setStylistInfo] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) {
        router.push('/login')
      } else {
        // 获取理发师资料和额度信息
        supabase
          .from('stylists')
          .select('*')
          .eq('auth_user_id', data.session.user.id)
          .single()
          .then(({ data: stylist }) => {
            setStylistInfo(stylist)
          })
      }
    })
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!session) return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="animate-pulse text-gray-400">加载中...</div>
    </div>
  )

  // 计算用量百分比
  const voicePercent = stylistInfo ? Math.min((stylistInfo.voice_used / stylistInfo.voice_limit) * 100, 100) : 0;
  const isFree = stylistInfo?.plan_type === 'free';

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="mx-auto max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Salon AI</h1>
          <p className="text-sm text-gray-500 mt-2">欢迎回来, {stylistInfo?.name || '发型师'}</p>
        </header>

        {/* 额度卡片 (用 Tailwind 写的漂亮进度条) */}
        {stylistInfo && (
          <div className="mb-8 rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-gray-700">
                当前套餐: {isFree ? '基础试用版' : stylistInfo.plan_type.toUpperCase()}
              </span>
              {isFree && (
                <button className="text-xs bg-black text-white px-3 py-1.5 rounded-full hover:bg-gray-800 transition">
                  升级 Pro ($19.9/月)
                </button>
              )}
            </div>
            
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>语音配方记录</span>
                <span>{stylistInfo.voice_used} / {stylistInfo.voice_limit}</span>
              </div>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${voicePercent > 80 ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${voicePercent}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <Link 
            href="/record" 
            className="flex items-center justify-center gap-3 rounded-2xl bg-black p-5 text-lg font-medium text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
          >
            <span className="text-2xl">🎙️</span> 录制配方
          </Link>
          
          <Link 
            href="/clients" 
            className="flex items-center justify-center gap-3 rounded-2xl bg-white border border-gray-200 p-5 text-lg font-medium text-gray-900 shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
          >
            <span className="text-2xl">👥</span> 顾客列表
          </Link>
          
          <a 
            href="/api/google/auth" 
            className="flex items-center justify-center gap-3 rounded-2xl bg-[#4285F4] p-5 text-lg font-medium text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
          >
            <span className="text-2xl">📅</span> 连接 Google 日历
          </a>
        </div>

        <button
          onClick={handleLogout}
          className="mt-12 w-full rounded-xl py-4 text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
        >
          退出登录
        </button>
      </div>
    </div>
  )
}
