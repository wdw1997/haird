'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import Link from 'next/link'

// Wraps a value in double quotes and escapes any quotes inside it, per the
// CSV spec — without this, a client name or note containing a comma or a
// quote character would silently corrupt the column alignment when opened
// in Excel/Sheets.
function csvCell(value) {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: stylist } = await supabase.from('stylists').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (!stylist) { setLoading(false); return }
      const { data } = await supabase.from('clients').select('*, formulas(*)').eq('stylist_id', stylist.id)
      setClients(data || [])
      setLoading(false)
    })()
  }, [])

  const handleExportCsv = () => {
    const header = ['Name', 'Phone Number', 'Formula History']
    const rows = clients.map((c) => [
      csvCell(c.name || ''),
      csvCell(c.phone_number || ''),
      csvCell(c.formulas?.map((f) => f.formula_text).join(' | ') || ''),
    ])
    // A leading BOM keeps Excel from mangling non-ASCII characters (accented
    // names, etc.) when it opens the file — plain UTF-8 without it often
    // shows up as garbled text in Excel specifically (Sheets doesn't need it).
    const csvContent = '\uFEFF' + [header, ...rows].map((row) => row.join(',')).join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: 40, maxWidth: 700, margin: '0 auto' }}>
      <Link href="/" style={{ fontSize: 14, color: '#666', textDecoration: 'none', marginBottom: 20, display: 'inline-block' }}>
        &larr; Back to Home
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h1 style={{ margin: 0 }}>Client List</h1>
        <button
          onClick={handleExportCsv}
          disabled={loading || clients.length === 0}
          style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd', background: 'white',
            fontSize: 13, fontWeight: 600, cursor: loading || clients.length === 0 ? 'not-allowed' : 'pointer',
            opacity: loading || clients.length === 0 ? 0.5 : 1,
          }}
        >
          ⬇ Export CSV
        </button>
      </div>

      {loading && <p style={{ color: '#888' }}>Loading...</p>}
      {!loading && clients.length === 0 && <p style={{ color: '#888' }}>No clients yet.</p>}

      {clients.map((c) => (
        <div key={c.id} style={{ border: '1px solid #ddd', padding: 12, marginTop: 12, borderRadius: 8 }}>
          <strong>{c.name || c.phone_number}</strong>
          {c.name && <div style={{ fontSize: 13, color: '#888' }}>{c.phone_number}</div>}
          <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
            Formula history: {c.formulas?.map((f) => f.formula_text).join(', ') || 'None yet'}
          </div>
        </div>
      ))}
    </div>
  )
}
