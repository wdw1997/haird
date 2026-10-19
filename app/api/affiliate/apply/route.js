import { sendEmail } from '@/lib/resend-client'

export const dynamic = 'force-dynamic'

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function POST(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { name, email, channel, plan, notes } = body || {}
  if (!name || !email || !channel || !plan) {
    return Response.json({ error: 'Please fill in all required fields.' }, { status: 400 })
  }

  const html = `
    <h2>New affiliate application</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Website / channel:</strong> ${escapeHtml(channel)}</p>
    <p><strong>How they plan to promote:</strong><br/>${escapeHtml(plan).replace(/\n/g, '<br/>')}</p>
    ${notes ? `<p><strong>Additional notes:</strong><br/>${escapeHtml(notes).replace(/\n/g, '<br/>')}</p>` : ''}
  `

  const result = await sendEmail({
    to: process.env.AFFILIATE_NOTIFY_EMAIL || 'support@veloceia.com',
    subject: `New affiliate application: ${name}`,
    html,
  })

  if (result.error) {
    console.error('Failed to send affiliate application email:', result.error)
    return Response.json(
      { error: 'Failed to submit your application — please try again later.' },
      { status: 500 }
    )
  }

  return Response.json({ success: true })
}
