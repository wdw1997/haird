'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'

export default function ClientsPage() {
  const [clients, setClients] = useState([])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: stylist } = await supabase.from('stylists').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (!stylist) return
      const { data } = await supabase.from('clients').select('*, formulas(*)').eq('stylist_id', stylist.id)
      setClients(data || [])
    })()
  }, [])

  return (
    <div style={{ padding: 40 }}>
      <h1>Client List</h1>
      {clients.map((c) => (
        <div key={c.id} style={{ border: '1px solid #ddd', padding: 12, marginTop: 12, borderRadius: 8 }}>
          <strong>{c.name || c.phone_number}</strong>
          <div style={{ fontSize: 14, color: '#666' }}>
            Formula history: {c.formulas?.map((f) => f.formula_text).join(', ') || 'None yet'}
          </div>
        </div>
      ))}
    </div>
  )
}
