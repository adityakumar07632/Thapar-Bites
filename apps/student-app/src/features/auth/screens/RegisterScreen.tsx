import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, Check, UtensilsCrossed, X } from 'lucide-react';
import { api, ApiRequestError } from '@/shared/lib/api';
import { useAuthStore, type StudentProfile } from '@/features/auth/store/useAuthStore';
import { Button } from '@/shared/components/ui/Button';
import { HostelSelect } from '@/shared/components/ui/HostelSelect';

interface RegisterResponse {
  student: StudentProfile;
  accessToken: string;
  refreshToken: string;
}

/**
 * Official Thapar Institute of Engineering & Technology hostel names.
 * Must stay in sync with THAPAR_HOSTELS in:
 *   apps/api/src/modules/auth/auth.routes.ts
 *   apps/api/src/modules/students/students.routes.ts
 *   apps/student-app/src/features/profile/screens/ProfileScreen.tsx
 */
export const THAPAR_HOSTELS = [
  'A Hostel', 'B Hostel', 'C Hostel', 'D Hostel', 'E Hostel',
  'F Hostel', 'G Hostel', 'H Hostel', 'J Hostel', 'K Hostel',
  'L Hostel', 'M Hostel', 'PG Hostel', 'Q Hostel', 'R Hostel',
] as const;

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
      {met ? <Check size={11} strokeWidth={3} aria-hidden /> : <X size={11} strokeWidth={3} aria-hidden />}
      {label}
    </span>
  );
}

const INPUT_CLS =
  'rounded-xl border border-steel-200 px-3.5 py-3 text-sm outline-none transition-colors focus:border-turmeric-500 w-full';

const LABEL_CLS = 'mb-1 block text-xs font-medium text-steel-600';

export function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [hostel, setHostel] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordHints, setShowPasswordHints] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const strength = passwordStrength(password);
  const passwordValid = strength.length && strength.upper && strength.lower && strength.number;
  const passwordsMatch = confirmPassword === '' || password === confirmPassword;
  const emailIsThapar = email.toLowerCase().endsWith('@thapar.edu');

  function validateClient(): string | null {
    if (fullName.trim().length < 2) return 'Please enter your full name.';
    if (rollNumber.trim().length < 3) return 'Roll number is required.';
    if (!email.trim()) return 'Email address is required.';
    if (phone.trim().length < 7) return 'Enter a valid mobile number.';
    if (!hostel) return 'Please select your hostel.';
    if (!roomNumber.trim()) return 'Room number is required.';
    if (!passwordValid)
      return 'Password must be at least 8 characters with an uppercase letter, lowercase letter, and number.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const clientError = validateClient();
    if (clientError) {
      setError(clientError);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await api.post<RegisterResponse>('/auth/register', {
        fullName,
        rollNumber,
        email,
        phone,
        hostel,
        roomNumber,
        password,
      });
      login({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.student);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-steel-50 px-6 py-8">
      <div className="w-full max-w-[380px] animate-rise">
        {/* Brand mark */}
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-steel-900 text-turmeric-400">
            <UtensilsCrossed size={22} />
          </span>
          <p className="mt-3 font-display text-xl font-bold text-steel-900">Create your account</p>
          <p className="text-sm text-steel-500">Thapar Bites · Thapar Institute</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
          {/* Full Name */}
          <div>
            <label htmlFor="reg-fullname" className={LABEL_CLS}>Full name</label>
            <input
              id="reg-fullname"
              type="text"
              placeholder="Asha Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={INPUT_CLS}
              required
              autoComplete="name"
              maxLength={100}
            />
          </div>

          {/* Roll Number */}
          <div>
            <label htmlFor="reg-roll" className={LABEL_CLS}>Roll number</label>
            <input
              id="reg-roll"
              type="text"
              placeholder="102217XXX"
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              className={INPUT_CLS}
              required
              maxLength={20}
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="reg-email" className={LABEL_CLS}>
              Email
              {email && (
                <span className={`ml-2 text-[11px] ${emailIsThapar ? 'text-cardamom-600' : 'text-steel-400'}`}>
                  {emailIsThapar ? '✓ Thapar email' : 'Non-Thapar emails are accepted'}
                </span>
              )}
            </label>
            <input
              id="reg-email"
              type="email"
              placeholder="you@thapar.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLS}
              required
              autoComplete="email"
              autoCapitalize="none"
              maxLength={200}
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="reg-phone" className={LABEL_CLS}>Phone</label>
            <input
              id="reg-phone"
              type="tel"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT_CLS}
              required
              inputMode="tel"
              maxLength={15}
            />
          </div>

          {/* Hostel + Room */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="reg-hostel" className={LABEL_CLS}>Hostel</label>
              <HostelSelect
                id="reg-hostel"
                value={hostel}
                onChange={setHostel}
                hostels={THAPAR_HOSTELS}
                required
              />
            </div>
            <div>
              <label htmlFor="reg-room" className={LABEL_CLS}>Room number</label>
              <input
                id="reg-room"
                type="text"
                placeholder="A-214"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                className={INPUT_CLS}
                required
                maxLength={20}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="reg-password" className={LABEL_CLS}>Password</label>
            <input
              id="reg-password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setShowPasswordHints(true)}
              className={INPUT_CLS}
              required
              maxLength={200}
              autoComplete="new-password"
            />
            {(showPasswordHints || password.length > 0) && (
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                <StrengthHint met={strength.length} label="8+ chars" />
                <StrengthHint met={strength.upper} label="Uppercase" />
                <StrengthHint met={strength.lower} label="Lowercase" />
                <StrengthHint met={strength.number} label="Number" />
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="reg-confirm" className={LABEL_CLS}>Confirm password</label>
            <input
              id="reg-confirm"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={INPUT_CLS}
              required
              maxLength={200}
              autoComplete="new-password"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-chili-600">
                <X size={11} strokeWidth={3} aria-hidden /> Passwords do not match.
              </p>
            )}
            {confirmPassword && passwordsMatch && confirmPassword.length > 0 && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-cardamom-600">
                <Check size={11} strokeWidth={3} aria-hidden /> Passwords match.
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-chili-500/10 px-3.5 py-2.5 text-xs text-chili-600"
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          <Button type="submit" size="lg" fullWidth loading={loading} className="mt-1">
            Create account
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-steel-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-turmeric-700 transition-colors hover:text-turmeric-800">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
