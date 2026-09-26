'use client'
import Link from 'next/link'
import { useState } from 'react'

const APPLY_MAILTO =
  'mailto:support@veloceia.com?subject=Affiliate%20Program%20Application&body=Where%20do%20you%20plan%20to%20share%20Veloceia%3F%20(Instagram%2C%20TikTok%2C%20a%20newsletter%2C%20your%20own%20clients%2C%20etc.)'

const REASONS = [
  {
    title: 'A pain point every salon has',
    body: 'Lost formulas and missed booking texts are a daily headache for stylists. Veloceia fixes both immediately, which makes it an easy thing to recommend.',
  },
  {
    title: 'Nothing for them to configure',
    body: 'Calendar sync, SMS, and Instagram DMs all work out of the box. Your referral is live in minutes, not after a support call.',
  },
  {
    title: 'Free to try before they pay',
    body: 'The free trial removes the risk from your recommendation — they can see it working before spending anything.',
  },
  {
    title: 'A wide, easy-to-reach audience',
    body: 'Solo stylists, barbershops, nail and lash studios, spas — anyone who takes appointments by text is a fit.',
  },
  {
    title: 'Sticky once they adopt it',
    body: "Once a salon stops losing bookings to a missed text, they rarely go back to sticky notes and voicemail.",
  },
]

const AUDIENCE = [
  'Hair salons', 'Barbershops', 'Nail studios', 'Lash & brow bars',
  'Med spas', 'Massage therapists', 'Independent stylists', 'Booth renters',
]

const FAQS = [
  {
    q: 'Who can apply?',
    a: 'Anyone with an audience of hairdressers, barbers, or salon owners — an Instagram or TikTok following, a newsletter, a local business network, or just people you know in the industry. Every application is reviewed by our team.',
  },
  {
    q: 'What is Veloceia?',
    a: "Veloceia is an AI front desk for salons: it records client formulas by voice, replies to booking texts and Instagram DMs automatically, and syncs confirmed appointments straight to Google Calendar.",
  },
  {
    q: 'How does it work?',
    a: 'Once approved, you get a personal referral link. Share it however you reach your audience. When someone signs up through your link and upgrades to a paid plan, the referral is attributed to you automatically.',
  },
  {
    q: 'What does it cost the salon I refer?',
    a: 'They can start free, no card required. Paid plans are $30/mo for a solo stylist or $60/mo for a small team — either one qualifies for your commission.',
  },
  {
    q: 'When do I earn the 50%?',
    a: "As soon as your referral's first payment on a paid plan clears, you earn 50% of that first payment.",
  },
  {
    q: 'How do I get paid?',
    a: 'Commissions clear a 7–12 day hold first (so refunds and disputes can be handled), then pay out automatically on the 1st or 15th of the month, whichever comes first — by bank transfer or crypto. You\u2019ll need at least $50 in cleared earnings to receive a payout; anything below that carries over to the next payout date.',
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-zinc-100 py-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-base font-medium text-zinc-900">{q}</span>
        <span className="ml-6 shrink-0 text-lg text-zinc-400">{open ? '−' : '+'}</span>
      </button>
      {open && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">{a}</p>}
    </div>
  )
}

export default function AffiliatePage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-zinc-200">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-xl font-bold tracking-tighter">Veloceia.</Link>
        <Link href="/login" className="text-sm font-medium transition-colors hover:text-zinc-500">
          Log in
        </Link>
      </nav>

      {/* Hero */}
      <main className="mx-auto max-w-4xl px-6 pb-16 pt-16 text-center">
        <div className="mb-4 text-sm font-semibold uppercase tracking-widest text-indigo-600">
          Affiliate Program
        </div>
        <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tighter md:text-6xl">
          Earn 50% when a salon you refer subscribes.
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-lg text-zinc-500">
          Share Veloceia with hairdressers and salon owners you know. When someone signs up
          through your link and upgrades to a paid plan, you keep half of what they pay in
          their first month.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={APPLY_MAILTO}
            className="inline-block rounded-full bg-black px-8 py-4 font-medium text-white transition-transform duration-300 hover:scale-105"
          >
            Apply today →
          </a>
          <a href="#how-it-works" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
            See how it works
          </a>
        </div>
      </main>

      {/* Stat row */}
      <section className="mx-auto max-w-4xl border-y border-zinc-100 px-6 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:divide-x sm:divide-zinc-100">
          <div className="text-center sm:text-left sm:pr-8">
            <div className="text-4xl font-bold tracking-tight">50%</div>
            <div className="mt-1 text-sm text-zinc-500">of their first month</div>
          </div>
          <div className="text-center sm:pl-8 sm:pr-8">
            <div className="text-4xl font-bold tracking-tight">Free</div>
            <div className="mt-1 text-sm text-zinc-500">to join, every application reviewed</div>
          </div>
          <div className="text-center sm:pl-8">
            <div className="text-4xl font-bold tracking-tight">$15–$30</div>
            <div className="mt-1 text-sm text-zinc-500">typical first payout, per referral</div>
          </div>
        </div>
      </section>

      {/* Why promote */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="mb-12 grid gap-8 md:grid-cols-2">
          <h2 className="text-3xl font-bold tracking-tight">Why promote Veloceia?</h2>
          <p className="text-zinc-500">
            Veloceia turns one sentence — a booking text — into a confirmed appointment, with
            nothing for the salon to set up. That makes it simple to describe and easy for
            your audience to say yes to.
          </p>
        </div>
        <div className="divide-y divide-zinc-100 border-y border-zinc-100">
          {REASONS.map((r) => (
            <div key={r.title} className="grid gap-2 py-6 md:grid-cols-[280px_1fr] md:gap-8">
              <div className="font-semibold text-zinc-900">{r.title}</div>
              <p className="max-w-xl text-sm leading-relaxed text-zinc-500">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Audience */}
      <section className="bg-zinc-50 px-6 py-20 border-y border-zinc-100">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-3xl font-bold tracking-tight">Who this works for</h2>
          <p className="mb-8 max-w-xl text-zinc-500">
            If your audience runs or works in any of these, Veloceia is a fit.
          </p>
          <div className="flex flex-wrap gap-3">
            {AUDIENCE.map((a) => (
              <span
                key={a}
                className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700"
              >
                {a}
              </span>
            ))}
          </div>

          {/* Earnings examples */}
          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-100 bg-white p-8">
              <div className="text-sm text-zinc-500">Referral upgrades to Solo Pro — $30/mo</div>
              <div className="mt-2 text-4xl font-bold tracking-tight">$15 <span className="text-lg font-normal text-zinc-400">to you</span></div>
            </div>
            <div className="rounded-2xl border border-zinc-100 bg-white p-8">
              <div className="text-sm text-zinc-500">Referral upgrades to Team Salon — $60/mo</div>
              <div className="mt-2 text-4xl font-bold tracking-tight">$30 <span className="text-lg font-normal text-zinc-400">to you</span></div>
            </div>
          </div>
          <p className="mt-4 text-xs text-zinc-400">Paid once your referral&apos;s first payment clears.</p>
        </div>
      </section>

      {/* Three steps */}
      <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="mb-12 text-3xl font-bold tracking-tight">Three steps.</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-100 p-8">
            <div className="mb-4 text-sm text-zinc-400">01</div>
            <h3 className="mb-2 text-lg font-bold">Apply</h3>
            <p className="text-sm leading-relaxed text-zinc-500">
              Tell us where your audience lives. Anyone can apply, and every application is reviewed.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-100 p-8">
            <div className="mb-4 text-sm text-zinc-400">02</div>
            <h3 className="mb-2 text-lg font-bold">Share your link</h3>
            <p className="text-sm leading-relaxed text-zinc-500">
              Once you&apos;re approved you get your own referral link and a dashboard that tracks clicks and signups.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-100 p-8">
            <div className="mb-4 text-sm text-zinc-400">03</div>
            <h3 className="mb-2 text-lg font-bold">Get paid</h3>
            <p className="text-sm leading-relaxed text-zinc-500">
              When your referral&apos;s first payment on a paid plan clears, you earn 50% of it.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-zinc-50 px-6 py-20 border-y border-zinc-100">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-3xl font-bold tracking-tight">Frequently asked questions</h2>
          <div>
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="mb-8 text-3xl font-bold tracking-tight md:text-5xl">
          Know a salon that needs this?
        </h2>
        <a
          href={APPLY_MAILTO}
          className="inline-block rounded-full bg-black px-8 py-4 font-medium text-white transition-transform duration-300 hover:scale-105"
        >
          Apply today →
        </a>
      </section>

      {/* Footer — shared with the marketing homepage, kept identical on purpose */}
      <footer className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-6 flex flex-col items-start justify-between gap-6 md:flex-row">
          <div className="text-sm text-zinc-400">
            © {new Date().getFullYear()} Veloceia. All rights reserved. &quot;Veloceia&quot; is operated by Xinwei (Tongxiang) E-Commerce Co., Ltd.
          </div>
          <div className="flex gap-6 text-sm font-medium text-zinc-500">
            <a href="mailto:support@veloceia.com" className="transition hover:text-black">Contact: support@veloceia.com</a>
            <Link href="/terms" className="transition hover:text-black">Terms of Service</Link>
            <Link href="/privacy" className="transition hover:text-black">Privacy Policy</Link>
          </div>
        </div>
        <div className="border-t border-zinc-100 pt-6 text-xs leading-relaxed text-zinc-400">
          Veloceia<br />
          No. 55 Xujiahuan, Jinniu Sector, Wuzhen,<br />
          Tongxiang, Zhejiang, China, 314501
        </div>
      </footer>
    </div>
  )
}
