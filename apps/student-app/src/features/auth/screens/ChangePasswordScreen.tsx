import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, X } from 'lucide-react';
import { AppShell } from '@/shared/components/layout/AppShell';
import { TopBar } from '@/shared/components/layout/TopBar';
import { Button } from '@/shared/components/ui/Button';
import { Compartment } from '@/shared/components/ui/Compartment';
import { api, ApiRequestError } from '@/shared/lib/api';

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

const INPUT_CLS =
  'w-full rounded-xl border border-steel-200 py-3 pl-3.5 pr-10 text-sm outline-none focus:border-turmeric-500';

export function ChangePasswordScreen() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
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
      setError('New password does not meet the requirements below.');
      setShowHints(true);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('New password must be different from your current password.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change password. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <TopBar title="Change password" />

      <div className="px-5 pt-4">
        {success ? (
          <Compartment className="flex flex-col items-center gap-3 p-6 text-center">
            <CheckCircle2 size={36} className="text-cardamom-500" />
            <p className="font-semibold text-steel-900">Password updated!</p>
            <p className="text-sm text-steel-500">Your password has been changed successfully.</p>
            <Button className="mt-1" onClick={() => navigate(-1)}>
              Go back
            </Button>
          </Compartment>
        ) : (
          <Compartment className="p-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {/* Current password */}
              <div>
                <label className="mb-1 block text-xs font-medium text-steel-500">Current password</label>
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={INPUT_CLS}
                    placeholder="Enter current password"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400"
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label className="mb-1 block text-xs font-medium text-steel-500">New password</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onFocus={() => setShowHints(true)}
                    className={INPUT_CLS}
                    placeholder="Enter new password"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400"
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {showHints && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-steel-100 px-3 py-2">
                    <StrengthHint met={strength.length} label="8+ characters" />
                    <StrengthHint met={strength.upper} label="Uppercase" />
                    <StrengthHint met={strength.lower} label="Lowercase" />
                    <StrengthHint met={strength.number} label="Number" />
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="mb-1 block text-xs font-medium text-steel-500">Confirm new password</label>
                <input
                  type={showNew ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-steel-200 px-3.5 py-3 text-sm outline-none focus:border-turmeric-500"
                  placeholder="Repeat new password"
                  required
                  autoComplete="new-password"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="mt-1 text-xs text-chili-600 flex items-center gap-1">
                    <X size={11} strokeWidth={3} /> Passwords do not match
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-chili-500/10 px-3.5 py-2.5 text-xs text-chili-600">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                fullWidth
                disabled={loading || !currentPassword || !allMet || newPassword !== confirmPassword}
                className="mt-1"
              >
                {loading ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          </Compartment>
        )}
      </div>
    </AppShell>
  );
}
