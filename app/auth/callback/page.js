'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

export default function AuthCallback() {
  const router = useRouter()
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: existing } = await supabase.from('stylists').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (!existing) {
        await supabase.from('stylists').insert({
          auth_user_id: user.id,
          name: user.email?.split('@')[0] || 'New Salon',
        })
      }
      router.push('/')
    })()
  }, [])
  return <div style={{ padding: 40, textAlign: 'center' }}>Signing you in...</div>
}
