'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import Link from 'next/link'

export default function InboxPage() {
  const [conversations, setConversations] = useState([])
  const [selectedPhone, setSelectedPhone] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: stylist } = await supabase.from('stylists').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (!stylist) { setLoading(false); return }

      // 拉最近500条消息,按客户号码分组成会话列表
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('stylist_id', stylist.id)
        .order('created_at', { ascending: false })
        .limit(500)

      const { data: clients } = await supabase
        .from('clients').select('id, name, phone_number').eq('stylist_id', stylist.id)
      const clientByPhone = {}
      ;(clients || []).forEach(c => { clientByPhone[c.phone_number] = c })

      const grouped = {}
      ;(messages || []).forEach(m => {
        if (!grouped[m.phone_number]) {
          grouped[m.phone_number] = {
            phone_number: m.phone_number,
            name: clientByPhone[m.phone_number]?.name || null,
            messages: [],
            lastMessage: m,
          }
        }
        grouped[m.phone_number].messages.push(m)
      })

      const list = Object.values(grouped).sort(
        (a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at)
      )
      // messages目前是倒序(最新在前),会话内展示时反转成正序方便阅读
      list.forEach(c => c.messages.reverse())

      setConversations(list)
      setLoading(false)
    })()
  }, [])

  const selected = conversations.find(c => c.phone_number === selectedPhone)

  const formatTime = (t) => {
    const d = new Date(t)
    return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ padding: '40px 20px', maxWidth: 900, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <Link href="/" style={{ fontSize: 14, color: '#666', textDecoration: 'none', marginBottom: 20, display: 'inline-block' }}>
        &larr; 返回首页
      </Link>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>📨 对话记录</h1>

      {loading && <p style={{ color: '#999' }}>加载中...</p>}

      {!loading && conversations.length === 0 && (
        <p style={{ color: '#999' }}>暂时还没有任何短信对话记录。</p>
      )}

      {!loading && conversations.length > 0 && (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* 左侧会话列表 */}
          <div style={{ width: 280, flexShrink: 0, border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
            {conversations.map(c => (
              <div
                key={c.phone_number}
                onClick={() => setSelectedPhone(c.phone_number)}
                style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid #f2f2f2',
                  cursor: 'pointer',
                  background: selectedPhone === c.phone_number ? '#f5f7ff' : 'white',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name || c.phone_number}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.lastMessage.direction === 'outbound' ? '我方: ' : ''}{c.lastMessage.body}
                </div>
                <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>{formatTime(c.lastMessage.created_at)}</div>
              </div>
            ))}
          </div>

          {/* 右侧对话详情 */}
          <div style={{ flex: 1, border: '1px solid #eee', borderRadius: 12, minHeight: 400, padding: 16 }}>
            {!selected && (
              <p style={{ color: '#999', textAlign: 'center', marginTop: 100 }}>选择左侧一个对话查看详情</p>
            )}
            {selected && (
              <>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                  {selected.name || selected.phone_number}
                </div>
                {selected.name && (
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>{selected.phone_number}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.messages.map(m => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        background: m.direction === 'outbound' ? '#111' : '#f1f1f1',
                        color: m.direction === 'outbound' ? 'white' : '#111',
                        padding: '8px 12px',
                        borderRadius: 12,
                        fontSize: 14,
                      }}
                    >
                      <div>{m.body}</div>
                      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>{formatTime(m.created_at)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
