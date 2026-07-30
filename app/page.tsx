'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [session, setSession] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) {
        router.push('/login')
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

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="mx-auto max-w-md">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Salon AI</h1>
          <p className="text-sm text-gray-500 mt-2">您的智能发型师助手</p>
        </header>

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
