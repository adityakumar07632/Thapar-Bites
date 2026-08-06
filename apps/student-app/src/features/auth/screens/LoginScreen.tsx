import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, UtensilsCrossed } from 'lucide-react';
import { api, ApiRequestError, setAuthToken } from '@/shared/lib/api';
import { useAuthStore, type StudentProfile } from '@/features/auth/store/useAuthStore';
import { Button } from '@/shared/components/ui/Button';

interface LoginResponse {
  role: 'student' | 'restaurant' | 'admin';
  student?: StudentProfile;
  accessToken: string;
  refreshToken: string;
}

const INPUT_CLS =
  'w-full rounded-xl border border-steel-200 px-3.5 py-3 text-sm outline-none transition-colors focus:border-turmeric-500 focus-visible:ring-2 focus-visible:ring-turmeric-500/25';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function doLogin(loginEmail: string, loginPassword: string) {
    setError(null);
    setLoading(true);
    try {
      setAuthToken(null);
      const data = await api.post<LoginResponse>('/auth/login', { email: loginEmail, password: loginPassword });
      if (data.role !== 'student' || !data.student) {
        throw new ApiRequestError('AUTH_003', 'That account is not a student account.');
      }
      login({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.student);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the API — is it running?');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    doLogin(email, password);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-steel-50 px-6">
      <div className="w-full max-w-[360px] animate-rise">
        {/* Brand mark */}
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-steel-900 text-turmeric-400">
            <UtensilsCrossed size={24} />
          </span>
          <p className="mt-3 font-display text-2xl font-bold text-steel-900">Thapar Bites</p>
          <p className="text-sm text-steel-500">Split the minimum, not the meal.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className="text-xs font-medium text-steel-600">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              placeholder="you@thapar.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLS}
              required
              autoComplete="email"
              autoCapitalize="none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-password" className="text-xs font-medium text-steel-600">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLS}
              required
              autoComplete="current-password"
            />
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-turmeric-700 hover:text-turmeric-800 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-chili-500/10 px-3.5 py-2.5 text-xs text-chili-600"
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          <Button type="submit" size="lg" fullWidth loading={loading}>
            Sign in
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-steel-500">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-turmeric-700 transition-colors hover:text-turmeric-800">
            Create one
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-steel-400">
          Restaurant or admin?{' '}
          <Link to="/staff" className="text-steel-600 hover:text-steel-800 transition-colors">
            Staff portal
          </Link>
        </p>
      </div>
    </div>
  );
}
