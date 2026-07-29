'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [session, setSession] = useState(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) {
        router.push('/login')
      }
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!session) return <div style={{ padding: 40 }}>加载中...</div>

  return (
    <div style={{ padding: 40, maxWidth: 500, margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center' }}>Salon AI Assistant</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 30 }}>
        <Link href="/record" style={{ padding: 16, background: '#333', color: 'white', textAlign: 'center', borderRadius: 8, textDecoration: 'none' }}>
          🎙️ 录制配方
        </Link>
        <Link href="/clients" style={{ padding: 16, background: '#333', color: 'white', textAlign: 'center', borderRadius: 8, textDecoration: 'none' }}>
          👥 顾客列表
        </Link>
        <button
          onClick={handleLogout}
          style={{ padding: 12, background: '#eee', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          退出登录
        </button>
      </div>
    </div>
  )
}
