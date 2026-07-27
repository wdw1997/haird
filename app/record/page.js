'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase-client'

export default function RecordPage() {
  const [recording, setRecording] = useState(false)
  const [status, setStatus] = useState('')
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    recorder.onstop = handleStop
    recorder.start()
    mediaRecorderRef.current = recorder
    setRecording(true)
    setStatus('录音中...')
  }

  const stopRecording = () => {
    mediaRecorderRef.current.stop()
    setRecording(false)
  }

  const handleStop = async () => {
    setStatus('正在处理...')
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const formData = new FormData()
    formData.append('audio', blob, 'recording.webm')

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/process-audio', {
      method: 'POST',
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      body: formData,
    })
    const data = await res.json()
    setStatus(JSON.stringify(data, null, 2))
  }

  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <h1>语音配方本</h1>
      <button
        onClick={recording ? stopRecording : startRecording}
        style={{
          width: 120, height: 120, borderRadius: '50%',
          background: recording ? 'red' : '#333', color: 'white', fontSize: 18
        }}
      >
        {recording ? '停止' : '录音'}
      </button>
      <pre style={{ marginTop: 20, textAlign: 'left', whiteSpace: 'pre-wrap' }}>{status}</pre>
    </div>
  )
}