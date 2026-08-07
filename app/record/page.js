'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'
import Link from 'next/link'

export default function RecordPage() {
  const [recording, setRecording] = useState(false)
  const [status, setStatus] = useState('')
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: stylist } = await supabase.from('stylists').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (!stylist) return
      const { data } = await supabase.from('clients').select('id, name, phone_number').eq('stylist_id', stylist.id).order('created_at', { ascending: false })
      setClients(data || [])
    })()
  }, [])

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    recorder.onstop = handleStop
    recorder.start()
    mediaRecorderRef.current = recorder
    setRecording(true)
    setStatus('🎙️ Recording...')
  }

  const stopRecording = () => {
    mediaRecorderRef.current.stop()
    setRecording(false)
  }

  const handleStop = async () => {
    setStatus('🤖 AI is processing...')
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const formData = new FormData()
    formData.append('audio', blob, 'recording.webm')
    if (selectedClientId) formData.append('clientId', selectedClientId)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setStatus('Please log in before recording.')
      return
    }
    const res = await fetch('/api/process-audio', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: formData,
    })
    const data
