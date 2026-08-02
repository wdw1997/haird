'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import Link from 'next/link'

export default function SettingsPage() {
  const [form, setForm] = useState({
    business_name: '', address: '', contact_phone: '',
    business_hours_text: '', services_text: '',
    booking_mode: 'ai_collect_manual_confirm', min_advance_hours: 24,
    cancellation_policy: '', available_slots_text: '',
    tone: 'friendly', use_emoji: false,
  })
  const [status, setStatus] = useState('')

  // 🔥 日历同步测试相关状态
  const [calendarEvents, setCalendarEvents] = useState([])
  const [loadingCalendar, setLoadingCalendar] = useState(false)
  const [calendarError, setCalendarError] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: stylist } = await supabase.from('stylists').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (!stylist) return
      const { data: biz } = await supabase.from('business_settings').select('*').eq('stylist_id', stylist.id).maybeSingle()
      if (biz) {
        setForm({
          business_name: biz.business_name || '',
          address: biz.address || '',
          contact_phone: biz.contact_phone || '',
          business_hours_text: biz.business_hours ? JSON.stringify(biz.business_hours) : '',
          services_text: biz.services ? biz.services.map(s => `${s.name},${s.price},${s.duration_min}`).join('\n') : '',
          booking_mode: biz.booking_mode || 'ai_collect_manual_confirm',
          min_advance_hours: biz.min_advance_hours || 24,
          cancellation_policy: biz.cancellation_policy || '',
          available_slots_text: biz.available_slots_text || '',
          tone: biz.tone || 'friendly',
          use_emoji: biz.use_emoji || false,
        })
      }
    })()
  }, [])

  const handleSave = async () => {
    setStatus('Saving...')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: stylist } = await supabase.from('stylists').select('id').eq('auth_user_id', user.id).maybeSingle()
    if (!stylist) { setStatus('Error: stylist profile not found'); return }

    const services = form.services_text.split('\n').filter(Boolean).map(line => {
      const [name, price, duration_min] = line.split(',').map(s => s.trim())
      return { name, price: Number(price), duration_min: Number(duration_min) }
    })

    const { error } = await supabase.from('business_settings').upsert({
      stylist_id: stylist.id,
      business_name: form.business_name,
      address: form.address,
      contact_phone: form.contact_phone,
      business_hours: { text: form.business_hours_text },
      services,
      booking_mode: form.booking_mode,
      min_advance_hours: Number(form.min_advance_hours),
      cancellation_policy: form.cancellation_policy,
      available_slots_text: form.available_slots_text,
      tone: form.tone,
      use_emoji: form.use_emoji,
      updated_at: new Date().toISOString(),
    })
    setStatus(error ? 'Save failed: ' + error.message : 'Saved successfully!')
  }

  // 🔥 拉取 Google 日历事件（测试用）
  const fetchCalendar = async () => {
    setLoadingCalendar(true)
    setCalendarError('')
    setCalendarEvents([])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setCalendarError('请先登录')
        return
      }

      const res = await fetch('/api/calendar', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setCalendarError(data.error || '读取日历失败，请稍后重试')
        return
      }

      setCalendarEvents(data.events || [])
    } catch (err) {
      console.error('fetchCalendar 出错:', err)
      setCalendarError('网络异常，请检查网络后重试')
    } finally {
      setLoadingCalendar(false)
    }
  }

  const formatEventTime = (value) => {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return value // 全天事件是纯日期字符串，直接显示
    return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const input = { padding: 10, borderRadius: 6, border: '1px solid #ccc', width: '100%' }
  const label = { fontWeight: 600, marginTop: 16, display: 'block' }

  return (
    <div style={{ padding: 40, maxWidth: 600, margin: '0 auto' }}>
      <Link href="/" style={{ fontSize: 14, color: '#666', textDecoration: 'none', marginBottom: 20, display: 'inline-block' }}>
        &larr; 返回首页
      </Link>

      <h1>Business Settings</h1>

      {/* 🔥 日历同步测试区块 */}
      <div style={{ padding: 20, background: '#f8f9fa', borderRadius: 12, marginTop: 20, marginBottom: 10, border: '1px solid #e9ecef' }}>
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 10 }}>📅 Google 日历同步测试</h2>
        <p style={{ fontSize: 13, color: '#666', marginTop: 0, marginBottom: 12 }}>
          点击下方按钮，测试是否能正确读取你已连接的 Google 日历未来 7 天的事件。
        </p>

        <button
          onClick={fetchCalendar}
          disabled={loadingCalendar}
          style={{
            padding: '10px 16px',
            background: loadingCalendar ? '#999' : '#4285F4',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: loadingCalendar ? 'not-allowed' : 'pointer',
            fontSize: 14,
          }}
        >
          {loadingCalendar ? '读取中...' : '读取未来 7 天日历'}
        </button>

        {calendarError && (
          <p style={{ marginTop: 12, color: '#d93025', fontSize: 13 }}>
            ⚠️ {calendarError}
          </p>
        )}

        {!calendarError && !loadingCalendar && calendarEvents.length === 0 && (
          <p style={{ marginTop: 12, color: '#999', fontSize: 13 }}>
            暂无数据，点击上方按钮开始读取。
          </p>
        )}

        {calendarEvents.length > 0 && (
          <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: 'none' }}>
            {calendarEvents.map((event) => (
              <li
                key={event.id}
                style={{
                  padding: '8px 12px',
                  background: 'white',
                  borderRadius: 8,
                  marginBottom: 6,
                  border: '1px solid #eee',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600 }}>{event.title}</div>
                <div style={{ color: '#666', marginTop: 2 }}>
                  {formatEventTime(event.start)} — {formatEventTime(event.end)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label style={label}>Business Name</label>
      <input style={input} value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} />

      <label style={label}>Address</label>
      <input style={input} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />

      <label style={label}>Contact Phone (for handoff to a human)</label>
      <input style={input} value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />

      <label style={label}>Business Hours (free text, e.g. "Mon-Fri 9-6, Sat 10-4")</label>
      <input style={input} value={form.business_hours_text} onChange={e => setForm({ ...form, business_hours_text: e.target.value })} />

      <label style={label}>Services (one per line: Name,Price,DurationMinutes)</label>
      <textarea style={{ ...input, height: 100 }} placeholder={"Haircut,30,30\nHighlights,80,120"} value={form.services_text} onChange={e => setForm({ ...form, services_text: e.target.value })} />

      <label style={label}>Booking Mode</label>
      <select style={input} value={form.booking_mode} onChange={e => setForm({ ...form, booking_mode: e.target.value })}>
        <option value="ai_collect_manual_confirm">AI collects request, owner confirms manually</option>
        <option value="ai_auto_confirm">AI confirms bookings automatically</option>
      </select>

      <label style={label}>Minimum Advance Booking (hours)</label>
      <input type="number" style={input} value={form.min_advance_hours} onChange={e => setForm({ ...form, min_advance_hours: e.target.value })} />

      <label style={label}>Cancellation Policy</label>
      <textarea style={{ ...input, height: 60 }} placeholder="e.g. 50% fee for cancellations within 24 hours" value={form.cancellation_policy} onChange={e => setForm({ ...form, cancellation_policy: e.target.value })} />

      <label style={label}>Available Slots This Week (free text, manual for now)</label>
      <textarea style={{ ...input, height: 60 }} value={form.available_slots_text} onChange={e => setForm({ ...form, available_slots_text: e.target.value })} />

      <label style={label}>Reply Tone</label>
      <select style={input} value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })}>
        <option value="professional">Professional & concise</option>
        <option value="friendly">Warm & friendly</option>
        <option value="humorous">Playful & humorous</option>
      </select>

      <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={form.use_emoji} onChange={e => setForm({ ...form, use_emoji: e.target.checked })} />
        Allow emojis in replies
      </label>

      <button onClick={handleSave} style={{ marginTop: 24, padding: 12, background: '#333', color: 'white', border: 'none', borderRadius: 6, width: '100%' }}>
        Save Settings
      </button>
      {status && <p style={{ marginTop: 12, color: '#666' }}>{status}</p>}
    </div>
  )
}
