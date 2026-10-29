import Link from 'next/link'
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm font-medium text-zinc-400 hover:text-black mb-8 inline-block">← Back to Home</Link>
        <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
        <div className="prose prose-zinc text-zinc-600 space-y-6">
          <p>Last updated: October 29, 2026</p>
          <p>Welcome to Veloceia. This website and the Veloceia services are operated and legally owned by Xinwei (Tongxiang) E-Commerce Co., Ltd. (the "Company," "we," "us," or "our").</p>
          <h2 className="text-xl font-semibold text-black mt-8">1. Acceptance of Terms</h2>
          <p>By accessing and using Veloceia (the "Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>

          <h2 className="text-xl font-semibold text-black mt-8">2. Description of Service</h2>
          <p>Veloceia provides AI-powered scheduling and client-communication tools designed specifically for hairdressers and salon professionals, including online booking requests (through a booking page and an AI chat assistant), voice formula recording, and text message (SMS) appointment notifications.</p>

          <h2 className="text-xl font-semibold text-black mt-8">3. Subscriptions and Payments</h2>
          <p>We offer Free, Pro ($30/month), and Team ($60/month) plans. Payments are processed securely via Creem. You can cancel your subscription at any time.</p>

          <h2 className="text-xl font-semibold text-black mt-8">4. Text Messaging (SMS) Program</h2>
          <p><strong>Program description.</strong> Veloceia sends appointment notification text messages on behalf of the salons that use the Service, such as confirmation that a requested appointment time has been confirmed or declined. Messages are sent only to people who have asked a salon to book an appointment and have agreed to receive them.</p>
          <p><strong>Consent.</strong> By checking the consent box on a salon's booking page and submitting your phone number, you agree to receive notification text messages from Veloceia. Consent is given separately for each booking request.</p>
          <p><strong>Message frequency and cost.</strong> Message frequency varies and depends on your bookings. Message and data rates may apply.</p>
          <p><strong>Opt-out and help.</strong> You can opt out at any time by replying STOP to any message; you will receive one confirmation and no further messages. Reply HELP for help, or contact us at support@veloceia.com. Carriers are not liable for delayed or undelivered messages.</p>
          <p><strong>Privacy.</strong> See our <Link href="/privacy" className="underline">Privacy Policy</Link>. We do not share mobile information or text messaging consent with third parties or affiliates for marketing or promotional purposes.</p>

          <h2 className="text-xl font-semibold text-black mt-8">5. Contact Information</h2>
          <p>If you have any questions about these Terms, please contact us at <strong>support@veloceia.com</strong>.</p>

          <h2 className="text-xl font-semibold text-black mt-8">6. Company Information</h2>
          <p>
            Xinwei (Tongxiang) E-Commerce Co., Ltd. (operating as Veloceia)<br />
            No. 55 Xujiahuan, Jinniu Sector, Wuzhen,<br />
            Tongxiang, Zhejiang, China, 314501
          </p>
        </div>
      </div>
    </div>
  )
}
