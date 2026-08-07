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
    const data = await res.json()
    if (data.error) {
      setStatus('Error: ' + data.error)
      return
    }
    setStatus(
      JSON.stringify(data.extracted, null, 2) +
      (data.needsClientLink ? '\n\n⚠️ Could not automatically match a client. Please link it manually from the Client List.' : '')
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-12 flex flex-col items-center">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm text-gray-500 hover:text-black mb-8 inline-block">
          &larr; Back to Home
        </Link>

        <div className="mt-6">
          <label className="text-sm font-medium text-gray-500 mb-2 block">Which client is this for? (optional — AI will try to detect automatically)</label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm"
          >
            <option value="">Not specified / let AI detect</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.phone_number}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col items-center justify-center mt-12">
          <button
            onClick={recording ? stopRecording : startRecording}
            className={`flex h-40 w-40 items-center justify-center rounded-full text-xl font-bold text-white shadow-2xl transition-all duration-300 ${
              recording
                ? 'bg-red-500 animate-pulse scale-110 shadow-red-500/50'
                : 'bg-black hover:scale-105 hover:bg-gray-800'
            }`}
          >
            {recording ? 'Stop' : 'Start Recording'}
          </button>

          <div className="mt-12 w-full">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Result</h3>
            <div className="min-h-[150px] w-full rounded-2xl bg-white p-5 shadow-sm border border-gray-100 overflow-auto">
              {status ? (
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{status}</pre>
              ) : (
                <p className="text-sm text-gray-400 text-center mt-10">Tap the button to start recording</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
