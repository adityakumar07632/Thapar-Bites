import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { UtensilsCrossed, AlertCircle } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Button } from '@/components/ui/Button';

interface LoginResponse {
  role: 'student' | 'restaurant' | 'admin';
  accessToken: string;
  refreshToken: string;
  owner?: { fullName: string; restaurantId: string };
  admin?: { fullName: string; adminRole: 'super_admin' | 'admin' };
}

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.post<LoginResponse>('/auth/login', { email, password });
      if (data.role === 'student') {
        throw new ApiRequestError('AUTH_003', 'This is a student account — sign in from the Thapar Bites student app instead.');
      }
      if (data.role === 'restaurant' && data.owner) {
        login({
          token: data.accessToken,
          refreshToken: data.refreshToken,
          role: 'restaurant',
          name: data.owner.fullName,
          restaurantId: data.owner.restaurantId,
        });
        navigate('/restaurant/orders');
      } else if (data.role === 'admin' && data.admin) {
        login({
          token: data.accessToken,
          refreshToken: data.refreshToken,
          role: 'admin',
          name: data.admin.fullName,
          adminRole: data.admin.adminRole,
        });
        navigate('/admin/dashboard');
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Is the API running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-steel-100 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-steel-150 bg-white p-7 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-steel-900 text-turmeric-400">
            <UtensilsCrossed size={17} />
          </span>
          <div>
            <p className="font-display text-base font-bold text-steel-900">Thapar Bites Ops</p>
            <p className="text-xs text-steel-500">Restaurant & Admin dashboard</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-steel-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-steel-200 px-3 py-2 text-sm outline-none focus:border-turmeric-500"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-steel-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-steel-200 px-3 py-2 text-sm outline-none focus:border-turmeric-500"
              required
            />
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-chili-500/10 px-3 py-2.5 text-xs text-chili-600">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="mt-1 justify-center">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-5 rounded-lg bg-steel-100 px-3 py-2.5 text-[11px] leading-relaxed text-steel-500">
          Please sign in using your administrator account.
        </p>
      </div>
    </div>
  );
}
