export const dynamic = 'force-dynamic'
import { google } from 'googleapis'

export async function GET() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // 必须是 offline 才能拿到 refresh_token
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    prompt: 'consent',
  })

  return Response.redirect(url)
}
