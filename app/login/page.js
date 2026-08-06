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
        setMessage('❌ Sign up failed: ' + error.message)
      } else {
        if (data.user) {
          await supabase.from('stylists').insert({
            auth_user_id: data.user.id,
            name: email.split('@')[0],
          })
        }
        setMessage('✅ Account created! Please check your email to verify.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage('❌ Login failed: ' + error.message)
      } else {
        router.push('/')
        return
      }
    }
    setLoading(false)
  }

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl border border-gray-100">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h1>
          <p className="text-sm text-gray-500 mt-2">Salon AI Assistant</p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2 mb-4 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.5 6.5 29 4.5 24 4.5 13.5 4.5 5 13 5 23.5S13.5 42.5 24 42.5 43 34 43 23.5c0-1-.1-2-.4-3z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.5 6.5 29 4.5 24 4.5c-7.7 0-14.3 4.4-17.7 10.2z"/>
            <path fill="#4CAF50" d="M24 42.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.2-7.2 2.2-5.3 0-9.7-3.6-11.3-8.5l-6.5 5C9.6 38 16.2 42.5 24 42.5z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.2 5.2C40.9 36 43 30.1 43 23.5c0-1-.1-2-.4-3z"/>
          </svg>
          Continue with Google
        </button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
          <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">or</span></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-black focus:bg-white focus:outline-none focus:ring-1 focus:ring-black transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password (min. 6 characters)"
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
            className="mt-2 w-full rounded-xl bg-black py-3.5 text-sm font-medium text-white shadow-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-70 transition-all"
          >
            {loading ? 'Please wait...' : (mode === 'login' ? 'Log In' : 'Sign Up')}
          </button>
        </form>

        {message && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 text-center">
            {message}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-gray-500">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setMessage('')
            }}
            className="ml-2 font-medium text-black underline underline-offset-4 hover:text-gray-600"
          >
            {mode === 'login' ? 'Sign up free' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  )
}
