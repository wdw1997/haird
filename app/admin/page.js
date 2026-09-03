'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import Link from 'next/link'

export default function AdminPage() {
  const [status, setStatus] = useState('loading') // loading | denied | ready
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [pool, setPool] = useState(null)
  const [buying, setBuying] = useState(false)
  const [buyStatus, setBuyStatus] = useState('')

  const loadPool = async (session) => {
    const res = await fetch('/api/admin/phone-pool', { headers: { Authorization: `Bearer ${session.access_token}` } })
    const data = await res.json()
    if (res.ok) setPool(data)
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setStatus('denied'); setError('Please log in first'); return }
      try {
        const res = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await res.json()
        if (!res.ok || data.error) { setStatus('denied'); setError(data.error || 'Failed to load'); return }
        setStats(data)
        setStatus('ready')
        loadPool(session)
      } catch (err) {
        setStatus('denied'); setError('Network error')
      }
    })()
  }, [])

  const handleBuyNumbers = async (count) => {
    setBuying(true)
    setBuyStatus(`Buying ${count} number${count > 1 ? 's' : ''}...`)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/phone-pool', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, tollFree: true }),
    })
    const data = await res.json()
    setBuyStatus(res.ok
      ? `✅ Bought ${data.bought.length}${data.failedCount ? `, ${data.failedCount} failed` : ''}`
      : `❌ ${data.error || 'Failed'}`)
    await loadPool(session)
    setBuying(false)
  }

  const card = { background: 'white', borderRadius: 12, padding: 16, border: '1px solid #eee' }
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  if (status === 'loading') {
    return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Loading...</div>
  }

  if (status === 'denied') {
    return (
      <div style={{ padding: 40, maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: '#d93025' }}>{error}</p>
        <Link href="/" style={{ color: '#666' }}>&larr; Back to Home</Link>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px 20px', maxWidth: 1000, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <Link href="/" style={{ fontSize: 14, color: '#666', textDecoration: 'none', marginBottom: 20, display: 'inline-block' }}>
        &larr; Back to Home
      </Link>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>📊 Operations Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={card}>
          <div style={{ fontSize: 12, color: '#888' }}>Total Salons</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.totalStylists}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: '#888' }}>Estimated MRR</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>${stats.estimatedMrr}</div>
          <div style={{ fontSize: 11, color: '#bbb' }}>Plan-based estimate, excludes top-up packs</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: '#888' }}>Plan Breakdown</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {Object.entries(stats.byPlan).map(([plan, count]) => (
              <div key={plan} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ textTransform: 'capitalize' }}>{plan}</span><span>{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: '#888' }}>Total Usage This Cycle</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            <div>SMS/DM: {stats.totalSmsUsed}</div>
            <div>Voice: {stats.totalVoiceUsed}</div>
          </div>
        </div>
      </div>

      {stats.nearingLimit.length > 0 && (
        <div style={{ ...card, background: '#fff8e6', borderColor: '#ffe4a3', marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>⚠️ Nearing or over their limit ({stats.nearingLimit.length})</h2>
          {stats.nearingLimit.map(s => (
            <div key={s.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid #ffe4a3' }}>
              <strong>{s.name || s.email || s.id}</strong> — {s.plan_type} — SMS {s.sms_used}/{s.sms_limit}, Voice {s.voice_used}/{s.voice_limit}
            </div>
          ))}
        </div>
      )}

      {pool && (
        <div style={{ ...card, marginBottom: 24, ...(pool.available === 0 ? { background: '#fff5f5', borderColor: '#ffd6d6' } : {}) }}>
          <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 4 }}>📞 Phone Number Pool</h2>
          <p style={{ fontSize: 12, color: '#888', marginTop: 0, marginBottom: 12 }}>
            Numbers bought and verified ahead of time — handed to a stylist the instant they pay, no waiting on Twilio verification.
          </p>
          <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: pool.available === 0 ? '#d93025' : '#111' }}>{pool.available}</div>
              <div style={{ fontSize: 11, color: '#888' }}>Available</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{pool.assigned}</div>
              <div style={{ fontSize: 11, color: '#888' }}>Assigned</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{pool.total}</div>
              <div style={{ fontSize: 11, color: '#888' }}>Total owned</div>
            </div>
          </div>

          {pool.waitingStylists?.length > 0 && (
            <div style={{ fontSize: 12.5, background: '#fff8e6', border: '1px solid #ffe4a3', borderRadius: 8, padding: 10, marginBottom: 12 }}>
              ⚠️ {pool.waitingStylists.length} paying salon(s) waiting on a number: {pool.waitingStylists.map(s => s.name || s.email).join(', ')}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => handleBuyNumbers(1)} disabled={buying} style={{ padding: '8px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: buying ? 'not-allowed' : 'pointer' }}>
              Buy 1 toll-free number
            </button>
            <button onClick={() => handleBuyNumbers(5)} disabled={buying} style={{ padding: '8px 14px', fontSize: 13, borderRadius: 6, border: 'none', background: '#111', color: 'white', cursor: buying ? 'not-allowed' : 'pointer' }}>
              Buy 5 more
            </button>
            {buyStatus && <span style={{ fontSize: 12.5, color: '#666' }}>{buyStatus}</span>}
          </div>
        </div>
      )}

      <div style={card}>
        <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 12 }}>All Salons</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#888', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '6px 8px' }}>Name / Email</th>
                <th style={{ padding: '6px 8px' }}>Plan</th>
                <th style={{ padding: '6px 8px' }}>SMS Usage</th>
                <th style={{ padding: '6px 8px' }}>Voice Usage</th>
                <th style={{ padding: '6px 8px' }}>Number</th>
                <th style={{ padding: '6px 8px' }}>Signed Up</th>
              </tr>
            </thead>
            <tbody>
              {stats.stylists.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                  <td style={{ padding: '6px 8px' }}>{s.name || '—'}<div style={{ color: '#999', fontSize: 11 }}>{s.email}</div></td>
                  <td style={{ padding: '6px 8px', textTransform: 'capitalize' }}>{s.plan_type}</td>
                  <td style={{ padding: '6px 8px' }}>{s.sms_used}/{s.sms_limit}</td>
                  <td style={{ padding: '6px 8px' }}>{s.voice_used}/{s.voice_limit}</td>
                  <td style={{ padding: '6px 8px' }}>{s.has_number ? '✅' : '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{formatDate(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
