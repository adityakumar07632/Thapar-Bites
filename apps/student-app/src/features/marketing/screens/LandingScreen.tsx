import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  ChevronDown,
  Clock,
  IndianRupee,
  Receipt,
  Search,
  ShieldCheck,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { Button, Card, PageTransition } from '@campus-bites/ui';
import { useAuthStore } from '@/features/auth/store/useAuthStore';

const STEPS = [
  {
    icon: UtensilsCrossed,
    title: 'Pick your canteen',
    body: 'Browse every outlet on campus with live open / busy status and honest ETAs.',
  },
  {
    icon: Users,
    title: 'Get paired',
    body: 'We match you with another student in your hostel ordering from the same place.',
  },
  {
    icon: IndianRupee,
    title: 'Split the minimum',
    body: 'Separate carts, separate payments — one delivery, half the minimum each.',
  },
  {
    icon: ShieldCheck,
    title: 'Hand over with PairCode',
    body: 'A five-character code confirms the right bag reached the right person.',
  },
];

const FEATURES = [
  {
    icon: Search,
    title: 'Search that keeps up',
    body: 'Filter by veg, price, rating, delivery time or what is open right now — results change as you type, never a page reload.',
  },
  {
    icon: Wallet,
    title: 'Pay only your half',
    body: 'Two carts, two bills. Nobody chases anybody for money afterwards, and nobody eats what they did not order.',
  },
  {
    icon: BellRing,
    title: 'Live order tracking',
    body: 'Accepted, preparing, out for delivery, arrived — pushed as it happens, not guessed from a timer.',
  },
  {
    icon: Receipt,
    title: 'Your numbers, kept',
    body: 'Order history, shared-delivery count and exactly how much the pairing has saved you, on your profile.',
  },
  {
    icon: ShieldCheck,
    title: 'PairCode handover',
    body: 'The delivery partner reads a code off your phone. No arguing at the hostel gate about whose bag is whose.',
  },
  {
    icon: Clock,
    title: 'Built for the 12-minute gap',
    body: 'Every screen assumes one hand, one thumb, and a corridor between two classes.',
  },
];

const FAQS = [
  {
    q: 'What exactly is Shared Delivery?',
    a: 'Most canteens will not deliver below a minimum order. Shared Delivery pairs you with another student in your hostel ordering from the same canteen at the same time, so that minimum is split between you. You each keep your own cart and pay your own bill.',
  },
  {
    q: 'Do I have to know the other student?',
    a: 'No. You are matched automatically by hostel and canteen, and you never see their name, order or contact details. Only the delivery lands together.',
  },
  {
    q: 'What if my match never pays?',
    a: 'There is a fixed payment window. If your partner does not pay inside it, the match dissolves, you are not charged for their share, and their reliability score takes the hit — not yours.',
  },
  {
    q: 'Can I just order alone?',
    a: 'Yes. Individual delivery is always available whenever your cart clears the canteen\u2019s own minimum. Shared Delivery is an option, not a requirement.',
  },
  {
    q: 'How is my food kept separate?',
    a: 'Separate bags, separate bills, and a PairCode handover — a five-character code the delivery partner checks against your screen before handing over.',
  },
  {
    q: 'Does it cost anything extra?',
    a: 'A small flat convenience fee per student on a shared order, which is what replaces paying a full delivery fee on your own. Your profile shows the running total you have saved.',
  },
];

export function LandingScreen() {
  const { token, hydrated } = useAuthStore();

  // Someone already signed in has no use for the pitch.
  if (hydrated && token) return <Navigate to="/" replace />;

  return (
    <div className="min-h-dvh bg-steel-50">
      <PageTransition className="flex min-h-dvh flex-col">
        {/* Nav */}
        <header className="sticky top-0 z-20 border-b border-steel-150 bg-steel-50/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3 lg:px-8">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-steel-900 text-turmeric-400">
                <UtensilsCrossed size={16} />
              </span>
              <span className="font-display text-sm font-bold text-steel-900">Thapar Bites</span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="rounded-xl px-3 py-2 text-xs font-semibold text-steel-600 transition-colors hover:text-steel-900"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-xl bg-steel-900 px-3 py-2 text-xs font-semibold text-steel-50 transition-opacity hover:opacity-90"
              >
                Get started
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1">
          {/* Hero */}
          <section className="mx-auto max-w-5xl px-5 pb-16 pt-16 text-center lg:px-8 lg:pt-24">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-turmeric-500/15 px-3 py-1.5 text-xs font-semibold text-turmeric-700">
              <Users size={12} aria-hidden /> Split the minimum. Keep your order.
            </div>
            <h1 className="mx-auto mt-4 max-w-2xl font-display text-4xl font-bold tracking-tight text-steel-900 lg:text-5xl">
              Campus food delivery, without the minimum order problem.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-steel-600">
              Thapar Bites matches you with a hostel neighbour ordering from the same canteen. Two carts, two bills, one delivery — you each pay half the minimum.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link to="/register">
                <Button size="lg" icon={<ArrowRight size={18} />}>
                  Create a free account
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="secondary">
                  Sign in
                </Button>
              </Link>
            </div>
          </section>

          {/* How it works */}
          <section id="how-it-works" className="bg-steel-100 py-14">
            <div className="mx-auto max-w-5xl px-5 lg:px-8">
              <h2 className="mb-8 font-display text-2xl font-bold text-steel-900">
                How it works
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <Card key={step.title} className="p-5">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-steel-900 text-turmeric-400">
                          <Icon size={16} aria-hidden />
                        </span>
                        <span className="font-display text-xs font-bold text-steel-400">
                          0{index + 1}
                        </span>
                      </div>
                      <p className="mb-1 font-display text-sm font-semibold text-steel-900">{step.title}</p>
                      <p className="text-[13px] leading-snug text-steel-500">{step.body}</p>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Features */}
          <section id="features" className="py-14">
            <div className="mx-auto max-w-5xl px-5 lg:px-8">
              <h2 className="mb-8 font-display text-2xl font-bold text-steel-900">Features</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {FEATURES.map((feat) => {
                  const Icon = feat.icon;
                  return (
                    <Card key={feat.title} tray className="p-5">
                      <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-steel-100 text-steel-600">
                        <Icon size={18} aria-hidden />
                      </span>
                      <p className="mb-1 font-display text-sm font-semibold text-steel-900">{feat.title}</p>
                      <p className="text-[13px] leading-snug text-steel-500">{feat.body}</p>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" className="bg-steel-100 py-14">
            <div className="mx-auto max-w-2xl px-5 lg:px-8">
              <h2 className="mb-6 font-display text-2xl font-bold text-steel-900">FAQ</h2>
              <div className="flex flex-col gap-2">
                {FAQS.map((faq) => (
                  <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
                ))}
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="py-16 text-center">
            <div className="mx-auto max-w-lg px-5">
              <h2 className="font-display text-2xl font-bold text-steel-900">
                Ready to start splitting?
              </h2>
              <p className="mt-3 text-sm text-steel-500">
                Join your hostel neighbours on Thapar Bites. Free to use, no credit card required.
              </p>
              <Link to="/register" className="mt-6 inline-block">
                <Button size="lg" icon={<ArrowRight size={18} />}>
                  Get started — it's free
                </Button>
              </Link>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-steel-150 bg-steel-50">
          <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-steel-900 text-turmeric-400">
                    <UtensilsCrossed size={13} />
                  </span>
                  <span className="font-display text-sm font-bold text-steel-900">Thapar Bites</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-steel-500">
                  A modern campus food ordering platform built exclusively for the Thapar Institute of Engineering & Technology community.
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-steel-400">Platform</p>
                <ul className="mt-3 flex flex-col gap-2 text-xs text-steel-600">
                  <li><a href="#how-it-works" className="hover:text-steel-900 transition-colors">How it works</a></li>
                  <li><a href="#features" className="hover:text-steel-900 transition-colors">Features</a></li>
                  <li><a href="#faq" className="hover:text-steel-900 transition-colors">FAQ</a></li>
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-steel-400">Account</p>
                <ul className="mt-3 flex flex-col gap-2 text-xs text-steel-600">
                  <li><Link to="/register" className="hover:text-steel-900 transition-colors">Create an account</Link></li>
                  <li><Link to="/login" className="hover:text-steel-900 transition-colors">Log in</Link></li>
                  <li><Link to="/about" className="hover:text-steel-900 transition-colors">About</Link></li>
                  <li><Link to="/staff" className="hover:text-steel-900 transition-colors text-steel-400">Staff portal</Link></li>
                </ul>
              </div>
            </div>
            <div className="mt-8 border-t border-steel-150 pt-5 text-center text-xs text-steel-400">
              © 2026 Thapar Bites
              <br />
              Built for the Thapar Institute of Engineering & Technology community.
              <br />
              Thapar Bites · Version 1.0.1
            </div>
          </div>
        </footer>
      </PageTransition>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Card tray className="overflow-hidden p-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-steel-50"
      >
        <span className="font-display text-sm font-semibold text-steel-900">{question}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-steel-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <p className="animate-rise border-t border-steel-150 px-5 py-4 text-[13px] leading-relaxed text-steel-600">
          {answer}
        </p>
      )}
    </Card>
  );
}
