'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'

export default function ClientsPage() {
  const [clients, setClients] = useState([])

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('clients').select('*, formulas(*)')
      setClients(data || [])
    }
    load()
  }, [])

  return (
    <div style={{ padding: 40 }}>
      <h1>顾客列表</h1>
      {clients.map((c) => (
        <div key={c.id} style={{ border: '1px solid #ddd', padding: 12, marginTop: 12, borderRadius: 8 }}>
          <strong>{c.name || c.phone_number}</strong>
          <div style={{ fontSize: 14, color: '#666' }}>
            历史配方:{c.formulas?.map((f) => f.formula_text).join(', ') || '暂无'}
          </div>
        </div>
      ))}
    </div>
  )
}
