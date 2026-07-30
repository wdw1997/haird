'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setMessage('❌ 注册失败: ' + error.message)
      } else {
        if (data.user) {
          await supabase.from('stylists').insert({
            auth_user_id: data.user.id,
            name: email.split('@')[0],
          })
        }
        setMessage('✅ 注册成功! 请检查邮箱完成验证。')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage('❌ 登录失败: ' + error.message)
      } else {
        router.push('/')
        return // 登录成功直接跳转，不取消 loading 状态
      }
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl border border-gray-100">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">{mode === 'login' ? '欢迎回来' : '创建账号'}</h1>
          <p className="text-sm text-gray-500 mt-2">Salon AI 智能助理</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-black focus:bg-white focus:outline-none focus:ring-1 focus:ring-black transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="密码 (至少6位)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-black focus:bg-white focus:outline-none focus:ring-1 focus:ring-black transition-colors"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-black py-3.5 text-sm font-medium text-white shadow-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-70 transition-all"
          >
            {loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
          </button>
        </form>

        {message && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 text-center">
            {message}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-gray-500">
          {mode === 'login' ? '还没有账号?' : '已经有账号了?'}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setMessage('')
            }}
            className="ml-2 font-medium text-black underline underline-offset-4 hover:text-gray-600"
          >
            {mode === 'login' ? '免费注册' : '直接登录'}
          </button>
        </div>
      </div>
    </div>
  )
}
