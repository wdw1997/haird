// 用原生 fetch 调用 Resend API,不额外装SDK
export async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('未配置 RESEND_API_KEY,邮件发送已跳过')
    return { error: 'RESEND_API_KEY missing' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to,
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Resend发送失败:', res.status, errText)
      return { error: errText }
    }

    return { success: true }
  } catch (err) {
    console.error('调用Resend出错:', err)
    return { error: err.message }
  }
}
