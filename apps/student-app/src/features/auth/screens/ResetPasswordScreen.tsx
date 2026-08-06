import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, UtensilsCrossed, X } from 'lucide-react';
import { api, ApiRequestError } from '@/shared/lib/api';
import { Button } from '@/shared/components/ui/Button';

function passwordStrength(pw: string) {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
  };
}

function StrengthHint({ met, label }: { met: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1 text-xs ${met ? 'text-cardamom-600' : 'text-steel-400'}`}>
      {met ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
      {label}
    </span>
  );
}

export function ResetPasswordScreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = passwordStrength(newPassword);
  const allMet = Object.values(strength).every(Boolean);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!allMet) {
      setError('Password does not meet the requirements below.');
      setShowHints(true);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('Invalid reset link. Please request a new one.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reset password. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-steel-50 px-6 text-center">
        <AlertCircle size={32} className="mb-3 text-chili-500" />
        <p className="font-semibold text-steel-900">Invalid reset link</p>
        <p className="mt-1 text-sm text-steel-500">This link is missing a reset token.</p>
        <Link to="/forgot-password" className="mt-4 text-sm font-medium text-turmeric-700">Request a new link</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-steel-50 px-6">
      <div className="mx-auto w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-steel-900 text-turmeric-400">
            <UtensilsCrossed size={22} />
          </span>
          <p className="mt-3 font-display text-2xl font-bold text-steel-900">Set new password</p>
          <p className="mt-1 text-sm text-steel-500">Choose a strong password you haven't used before.</p>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle2 size={40} className="text-cardamom-500" />
            <p className="font-semibold text-steel-900">Password updated!</p>
            <p className="text-sm text-steel-500">You can now sign in with your new password.</p>
            <Button size="lg" fullWidth onClick={() => navigate('/login', { replace: true })}>
              Sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* New password */}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onFocus={() => setShowHints(true)}
                className="w-full rounded-xl border border-steel-200 py-3 pl-3.5 pr-10 text-sm outline-none focus:border-turmeric-500"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Strength hints */}
            {showHints && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-steel-100 px-3.5 py-2.5">
                <StrengthHint met={strength.length} label="8+ characters" />
                <StrengthHint met={strength.upper} label="Uppercase" />
                <StrengthHint met={strength.lower} label="Lowercase" />
                <StrengthHint met={strength.number} label="Number" />
              </div>
            )}

            {/* Confirm password */}
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-xl border border-steel-200 px-3.5 py-3 text-sm outline-none focus:border-turmeric-500"
              required
              autoComplete="new-password"
            />

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-chili-500/10 px-3.5 py-2.5 text-xs text-chili-600">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" size="lg" fullWidth disabled={loading || !allMet}>
              {loading ? 'Updating…' : 'Update password'}
            </Button>

            <Link to="/login" className="text-center text-sm text-steel-500 hover:text-steel-700">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
