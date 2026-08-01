'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'

export default function SettingsPage() {
  const [form, setForm] = useState({
    business_name: '', address: '', contact_phone: '',
    business_hours_text: '', services_text: '',
    booking_mode: 'ai_collect_manual_confirm', min_advance_hours: 24,
    cancellation_policy: '', available_slots_text: '',
    tone: 'friendly', use_emoji: false,
  })
  const [status, setStatus] = useState('')

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

  const input = { padding: 10, borderRadius: 6, border: '1px solid #ccc', width: '100%' }
  const label = { fontWeight: 600, marginTop: 16, display: 'block' }

  return (
    <div style={{ padding: 40, maxWidth: 600, margin: '0 auto' }}>
      <h1>Business Settings</h1>

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
