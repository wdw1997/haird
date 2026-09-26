'use client'
import Link from 'next/link'
import { useState } from 'react'

const input =
  'w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10'
const label = 'block text-sm font-medium text-zinc-900 mb-1.5'

export default function AffiliateApplyPage() {
  const [form, setForm] = useState({
    name: '', email: '', channel: '', plan: '', notes: '',
  })
  const [agreed, setAgreed] = useState(false)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.channel || !form.plan || !agreed) return
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setErrorMsg(data.error || 'Something went wrong — please try again.')
        return
      }
      setStatus('sent')
    } catch {
      setStatus('error')
      setErrorMsg('Something went wrong — please try again.')
    }
  }

  if (status === 'sent') {
    return (
      <div className="min-h-screen bg-white text-zinc-900 font-sans">
        <nav className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
          <Link href="/" className="text-xl font-bold tracking-tighter">Veloceia.</Link>
          <Link href="/login" className="text-sm font-medium hover:text-zinc-500 transition-colors">Log in</Link>
        </nav>
        <main className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="mb-4 text-3xl font-bold tracking-tight">Application sent.</h1>
          <p className="text-zinc-500">
            Thanks{form.name ? `, ${form.name}` : ''} — we review every application and will
            get back to you at {form.email} within a few days.
          </p>
          <Link href="/affiliate" className="mt-8 inline-block text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
            ← Back to the affiliate program
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      <nav className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-xl font-bold tracking-tighter">Veloceia.</Link>
        <Link href="/login" className="text-sm font-medium hover:text-zinc-500 transition-colors">Log in</Link>
      </nav>

      <main className="mx-auto max-w-2xl px-6 pb-24 pt-8">
        <div className="mb-2 inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500">
          Step 1 of 1
        </div>
        <h1 className="mb-4 text-4xl font-bold tracking-tighter">
          Refer once. Earn on their first month.
        </h1>
        <p className="mb-8 text-zinc-500">
          Submit your application to join the Veloceia affiliate program and start earning
          commission on the salons you refer.
        </p>

        <div className="mb-8 rounded-2xl border border-zinc-100 bg-zinc-50 p-6">
          <div className="mb-1 text-sm font-semibold text-zinc-900">Reward</div>
          <div className="text-sm text-zinc-600">
            Earn 50% of a referral&apos;s first month, once their payment clears.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className={label}>Name <span className="text-orange-600 text-xs align-middle ml-1">Required</span></label>
            <input className={input} value={form.name} onChange={set('name')} required />
          </div>
          <div>
            <label className={label}>Email <span className="text-orange-600 text-xs align-middle ml-1">Required</span></label>
            <input type="email" className={input} value={form.email} onChange={set('email')} required />
          </div>
          <div>
            <label className={label}>Website / Social media channel <span className="text-orange-600 text-xs align-middle ml-1">Required</span></label>
            <input className={input} placeholder="https://instagram.com/yourhandle" value={form.channel} onChange={set('channel')} required />
          </div>
          <div>
            <label className={label}>How do you plan to promote Veloceia? <span className="text-orange-600 text-xs align-middle ml-1">Required</span></label>
            <textarea className={`${input} min-h-[100px] resize-y`} value={form.plan} onChange={set('plan')} required />
          </div>
          <div>
            <label className={label}>Any additional questions or comments?</label>
            <textarea className={`${input} min-h-[80px] resize-y`} value={form.notes} onChange={set('notes')} />
          </div>

          <label className="flex items-start gap-2.5 text-sm text-zinc-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              required
            />
            <span>
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="underline hover:text-zinc-900">
                Veloceia affiliate program terms
              </Link>
            </span>
          </label>

          {status === 'error' && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'sending' || !form.name || !form.email || !form.channel || !form.plan || !agreed}
            className="w-full rounded-lg bg-black py-3.5 font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none"
          >
            {status === 'sending' ? 'Sending…' : 'Continue'}
          </button>
        </form>
      </main>
    </div>
  )
}
