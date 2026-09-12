import Link from 'next/link'
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm font-medium text-zinc-400 hover:text-black mb-8 inline-block">← Back to Home</Link>
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
        <div className="prose prose-zinc text-zinc-600 space-y-6">
          <p>Last updated: August 3, 2026</p>
          <p>Welcome to Veloceia. This website and the Veloceia services are operated and legally owned by Dong Wei Wang (a Sole Proprietor).</p>

          <h2 className="text-xl font-semibold text-black mt-8">1. Information We Collect</h2>
          <p>We collect information you provide directly to us when you create an account, such as your email address. We also collect the voice memos and client data you input into the system to provide our core AI services.</p>

          <h2 className="text-xl font-semibold text-black mt-8">2. How We Use Your Information</h2>
          <p>We use the information we collect to provide, maintain, and improve our services, including processing voice-to-text and generating AI SMS replies. We do not sell your personal data or your clients' data to third parties.</p>
          <p>No mobile information will be shared with third parties/affiliates for marketing/promotional purposes. All other categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.</p>

          <h2 className="text-xl font-semibold text-black mt-8">3. Data Security</h2>
          <p>We implement appropriate technical and organizational measures to protect the security of your personal information.</p>

          <h2 className="text-xl font-semibold text-black mt-8">4. Contact Us</h2>
          <p>If you have any questions about this Privacy Policy, please contact us at <strong>support@veloceia.com</strong>.</p>

          <h2 className="text-xl font-semibold text-black mt-8">5. Company Information</h2>
          <p>
            Veloceia<br />
            No. 55 Xujiahuan, Jinniu Sector, Wuzhen,<br />
            Tongxiang, Zhejiang, China, 314501
          </p>
        </div>
      </div>
    </div>
  )
}
