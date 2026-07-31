export const dynamic = 'force-dynamic'
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import Link from 'next/link'

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('clients').select('*, formulas(*)').order('created_at', { ascending: false })
      setClients(data || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">顾客记录</h1>
          <Link href="/" className="text-sm text-gray-500 hover:text-black">
            返回
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded-2xl w-full"></div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {clients.length === 0 && (
              <div className="text-center py-10 text-gray-400">暂无顾客记录</div>
            )}
            {clients.map((c) => (
              <div key={c.id} className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100 transition hover:shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <strong className="text-lg text-gray-900">{c.name || c.phone_number}</strong>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {c.formulas?.length || 0} 次记录
                  </span>
                </div>
                <div className="text-sm text-gray-500 leading-relaxed">
                  <span className="font-medium text-gray-700">最新配方：</span>
                  {c.formulas && c.formulas.length > 0 
                    ? c.formulas[0].formula_text 
                    : '暂无配方信息'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
