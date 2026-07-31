import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm font-medium text-zinc-400 hover:text-black mb-8 inline-block">← Back to Home</Link>
        <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
        <div className="prose prose-zinc text-zinc-600 space-y-6">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <h2 className="text-xl font-semibold text-black mt-8">1. Acceptance of Terms</h2>
          <p>By accessing and using Veloceia (the "Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
          
          <h2 className="text-xl font-semibold text-black mt-8">2. Description of Service</h2>
          <p>Veloceia provides AI-powered voice formula recording and SMS auto-reply tools designed specifically for hairdressers and salon professionals.</p>
          
          <h2 className="text-xl font-semibold text-black mt-8">3. Subscriptions and Payments</h2>
          <p>We offer Free, Pro ($19.90/month), and Team ($29.90/month) plans. Payments are processed securely via Creem. You can cancel your subscription at any time.</p>

          <h2 className="text-xl font-semibold text-black mt-8">4. Contact Information</h2>
          <p>If you have any questions about these Terms, please contact us at <strong>support@veloceia.com</strong>.</p>
        </div>
      </div>
    </div>
  )
}
