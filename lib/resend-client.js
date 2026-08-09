// Calls the Resend API directly with fetch — no extra SDK installed
export async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured — email sending skipped')
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
      console.error('Resend send failed:', res.status, errText)
      return { error: errText }
    }

    return { success: true }
  } catch (err) {
    console.error('Error calling Resend:', err)
    return { error: err.message }
  }
}
