export const dynamic = 'force-dynamic'
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [message, setMessage] = useState('')
  const router = useRouter()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('处理中...')

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setMessage('注册失败: ' + error.message)
        return
      }
      if (data.user) {
        await supabase.from('stylists').insert({
          auth_user_id: data.user.id,
          name: email.split('@')[0],
        })
      }
      setMessage('注册成功!请检查邮箱完成验证后再登录。')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage('登录失败: ' + error.message)
        return
      }
      router.push('/')
    }
  }

  return (
    <div style={{ padding: 40, maxWidth: 400, margin: '0 auto' }}>
      <h1>{mode === 'login' ? '登录' : '注册'}</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: 10, borderRadius: 6, border: '1px solid #ccc' }}
        />
        <input
          type="password"
          placeholder="密码(至少6位)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={{ padding: 10, borderRadius: 6, border: '1px solid #ccc' }}
        />
        <button
          type="submit"
          style={{ padding: 12, background: '#333', color: 'white', border: 'none', borderRadius: 6 }}
        >
          {mode === 'login' ? '登录' : '注册'}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 14 }}>
        {mode === 'login' ? '还没有账号?' : '已经有账号了?'}
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          style={{ marginLeft: 6, color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {mode === 'login' ? '去注册' : '去登录'}
        </button>
      </p>
      {message && <p style={{ marginTop: 12, color: '#666' }}>{message}</p>}
    </div>
  )
}
