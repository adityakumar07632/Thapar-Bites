import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Mail, UtensilsCrossed } from 'lucide-react';
import { api, ApiRequestError } from '@/shared/lib/api';
import { Button } from '@/shared/components/ui/Button';

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.post<{ sent: boolean; resetToken: string | null }>('/auth/forgot-password', { email });
      setResetToken(data.resetToken);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-steel-50 px-6">
      <div className="mx-auto w-full max-w-[360px]">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-steel-900 text-turmeric-400">
            <UtensilsCrossed size={22} />
          </span>
          <p className="mt-3 font-display text-2xl font-bold text-steel-900">Forgot password?</p>
          <p className="mt-1 text-sm text-steel-500">Enter your email and we'll send a reset link.</p>
        </div>

        {resetToken ? (
          /* Success state — show the reset link (demo mode: no email service) */
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-cardamom-500/10 p-5 text-center">
              <CheckCircle2 size={28} className="text-cardamom-600" />
              <p className="font-semibold text-cardamom-800">Reset link generated</p>
              <p className="text-sm text-cardamom-700">
                In a production app this would arrive in your inbox. Since this is a demo, use the link below.
              </p>
            </div>

            <Link
              to={`/reset-password?token=${resetToken}`}
              className="block rounded-xl bg-turmeric-500 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-turmeric-600 transition-colors"
            >
              Open reset link →
            </Link>

            <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm text-steel-500 hover:text-steel-700">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        ) : (
          /* Email form */
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel-400 pointer-events-none" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-steel-200 py-3 pl-9 pr-3.5 text-sm outline-none focus:border-turmeric-500"
                required
                autoComplete="email"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-chili-500/10 px-3.5 py-2.5 text-xs text-chili-600">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" size="lg" fullWidth disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>

            <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm text-steel-500 hover:text-steel-700">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
