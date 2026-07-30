'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase-client'
import Link from 'next/link'

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
    setStatus('🔴 正在聆听...')
  }

  const stopRecording = () => {
    mediaRecorderRef.current.stop()
    setRecording(false)
  }

  const handleStop = async () => {
    setStatus('✨ AI 正在提取配方信息...')
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
    setStatus(JSON.stringify(data.extracted, null, 2))
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-12 flex flex-col items-center">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm text-gray-500 hover:text-black mb-8 inline-block">
          &larr; 返回首页
        </Link>
        
        <div className="flex flex-col items-center justify-center mt-12">
          <button
            onClick={recording ? stopRecording : startRecording}
            className={`flex h-40 w-40 items-center justify-center rounded-full text-xl font-bold text-white shadow-2xl transition-all duration-300 ${
              recording 
                ? 'bg-red-500 animate-pulse scale-110 shadow-red-500/50' 
                : 'bg-black hover:scale-105 hover:bg-gray-800'
            }`}
          >
            {recording ? '停止' : '开始录音'}
          </button>
          
          <div className="mt-12 w-full">
            <h3 className="text-sm font-medium text-gray-500 mb-2">处理状态</h3>
            <div className="min-h-[150px] w-full rounded-2xl bg-white p-5 shadow-sm border border-gray-100 overflow-auto">
              {status ? (
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {status}
                </pre>
              ) : (
                <p className="text-sm text-gray-400 text-center mt-10">点击上方按钮说出您的配方</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
