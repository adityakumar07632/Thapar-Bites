import { Link } from 'react-router-dom';
import { ArrowLeft, UtensilsCrossed } from 'lucide-react';

/**
 * About page — Thapar Bites branding, tagline, description and version.
 * Purely informational: no data fetching, no auth requirements.
 */
export function AboutScreen() {
  return (
    <div className="flex min-h-dvh flex-col bg-steel-50">
      <header className="sticky top-0 z-30 border-b border-steel-150 bg-steel-50/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 py-3.5">
          <Link
            to="/welcome"
            className="flex items-center gap-1.5 text-sm font-medium text-steel-500 transition-colors hover:text-steel-800"
          >
            <ArrowLeft size={15} />
            Back
          </Link>
          <div className="ml-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-steel-900 text-turmeric-400">
              <UtensilsCrossed size={13} />
            </span>
            <span className="font-display text-sm font-bold text-steel-900">THAPAR BITES</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <h1 className="font-display text-3xl font-bold tracking-tight text-steel-900">About Thapar Bites</h1>
        <p className="mt-2 text-sm font-semibold text-turmeric-700">Your Campus Food Companion</p>

        <p className="mt-6 text-base leading-relaxed text-steel-600">
          A modern campus food ordering platform built exclusively for the Thapar Institute of
          Engineering &amp; Technology community.
        </p>

        <p className="mt-4 text-sm leading-relaxed text-steel-500">
          Thapar Bites pairs you with a hostel neighbour ordering from the same canteen, so two
          separate carts travel as one delivery. You keep your own order and your own bill, and each
          of you covers only half of the minimum order value.
        </p>

        <dl className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-steel-150 bg-white p-5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-steel-400">
              Application
            </dt>
            <dd className="mt-1 font-display text-sm font-bold text-steel-900">Thapar Bites</dd>
          </div>
          <div className="rounded-2xl border border-steel-150 bg-white p-5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-steel-400">
              Version
            </dt>
            <dd className="mt-1 font-display text-sm font-bold text-steel-900">Version 1.0.1</dd>
          </div>
        </dl>

        <div className="mt-10 border-t border-steel-150 pt-5 text-xs leading-relaxed text-steel-400">
          © 2026 Thapar Bites
          <br />
          Built for the Thapar Institute of Engineering &amp; Technology community.
        </div>
      </main>
    </div>
  );
}
