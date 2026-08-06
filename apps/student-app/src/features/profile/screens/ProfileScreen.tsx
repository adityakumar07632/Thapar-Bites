import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  Heart,
  Home as HomeIcon,
  IndianRupee,
  KeyRound,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Pencil,
  Phone,
  Receipt,
  ShieldCheck,
  Store,
  Sun,
  Users,
} from 'lucide-react';
import { Alert, Field, Input, Modal, SkeletonProfileStats, useTheme } from '@campus-bites/ui';
import type { ThemeMode } from '@campus-bites/ui';
import { HostelSelect } from '@/shared/components/ui/HostelSelect';
import { AppShell } from '@/shared/components/layout/AppShell';
import { TopBar } from '@/shared/components/layout/TopBar';
import { BottomNav } from '@/shared/components/layout/BottomNav';
import { Compartment } from '@/shared/components/ui/Compartment';
import { Button } from '@/shared/components/ui/Button';
import { useAuthStore, type StudentProfile } from '@/features/auth/store/useAuthStore';
import { useFavoritesStore } from '@/features/favorites/store/useFavoritesStore';
import { api, ApiRequestError } from '@/shared/lib/api';
import { formatINR } from '@/shared/lib/utils';
import type { StudentStats } from '@/shared/types/domain';

export const THAPAR_HOSTELS = [
  'A Hostel', 'B Hostel', 'C Hostel', 'D Hostel', 'E Hostel',
  'F Hostel', 'G Hostel', 'H Hostel', 'J Hostel', 'K Hostel',
  'L Hostel', 'M Hostel', 'PG Hostel', 'Q Hostel', 'R Hostel',
] as const;

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  if (url) {
    return (
      <img
        src={url}
        alt={`${name}'s avatar`}
        className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-steel-200"
      />
    );
  }

  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-steel-800 font-display text-base font-bold text-steel-50 dark:bg-steel-700 dark:text-steel-100"
      aria-label={`${name} avatar`}
    >
      {initials}
    </span>
  );
}

const TONE_CLASSES = {
  turmeric: 'bg-turmeric-500/10 text-turmeric-700',
  cardamom: 'bg-cardamom-500/10 text-cardamom-700',
  steel: 'bg-steel-100 text-steel-700',
  chili: 'bg-chili-500/10 text-chili-600',
};

function StatCard({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: keyof typeof TONE_CLASSES;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-steel-150 bg-white p-3 shadow-tray animate-rise">
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${TONE_CLASSES[tone]}`}
        aria-hidden
      >
        {icon}
      </span>
      <p className="mt-1.5 font-display text-lg font-bold text-steel-900">{value}</p>
      <p className="text-xs font-medium text-steel-600">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-tight text-steel-400">{hint}</p>}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-steel-100 last:border-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-steel-100 text-steel-500" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-steel-400">{label}</p>
        <p className="text-sm font-medium text-steel-800">{value}</p>
      </div>
    </div>
  );
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: ReactNode; desc: string }[] = [
  { mode: 'light', label: 'Light', icon: <Sun size={15} aria-hidden />, desc: 'Always use light appearance' },
  { mode: 'dark',  label: 'Dark',  icon: <Moon size={15} aria-hidden />, desc: 'Always use dark appearance' },
  { mode: 'system', label: 'System Default', icon: <Monitor size={15} aria-hidden />, desc: 'Follow device settings' },
];

function AppearanceSection() {
  const { mode, setMode } = useTheme();

  return (
    <div className="mt-5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-steel-400">
        Appearance
      </p>
      <Compartment className="overflow-hidden p-0">
        {THEME_OPTIONS.map(({ mode: m, label, icon, desc }, i) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={[
                'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                i < THEME_OPTIONS.length - 1 ? 'border-b border-steel-100' : '',
                active ? 'bg-turmeric-500/8' : 'hover:bg-steel-100',
              ].join(' ')}
              aria-pressed={active}
            >
              <span
                className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  active
                    ? 'bg-turmeric-500/15 text-turmeric-600'
                    : 'bg-steel-100 text-steel-500',
                ].join(' ')}
              >
                {icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${active ? 'text-steel-900' : 'text-steel-700'}`}>
                  {label}
                </p>
                <p className="text-[11px] text-steel-400">{desc}</p>
              </div>
              {active && (
                <Check size={16} className="shrink-0 text-turmeric-600" aria-hidden />
              )}
            </button>
          );
        })}
      </Compartment>
    </div>
  );
}

export function ProfileScreen() {
  const { student, logout, updateStudent } = useAuthStore();
  const navigate = useNavigate();
  const favorites = useFavoritesStore();
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api
      .get<StudentProfile>('/students/profile')
      .then((fresh) => updateStudent(fresh))
      .catch(() => {
        // Best-effort refresh — fall back to the cached profile.
      });
  }, [updateStudent]);

  useEffect(() => {
    setStatsLoading(true);
    api
      .get<StudentStats>('/students/stats')
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
    void favorites.fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!student) return null;

  const favoriteCount = favorites.restaurants.length + favorites.dishes.length;

  return (
    <AppShell bottomNav={<BottomNav />}>
      <TopBar title="Profile" showBack={false} />

      <div className="px-5 pt-4">
        {/* Avatar + name card */}
        <Compartment className="flex items-center gap-3.5 p-4">
          <Avatar name={student.fullName} url={student.avatarUrl ?? null} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-semibold text-steel-900">
              {student.fullName}
            </p>
            <p className="text-xs text-steel-500">Roll no. {student.rollNumber}</p>
            <p className="text-xs text-steel-400">{student.hostel}</p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-steel-900 px-3 py-1.5 text-xs font-semibold text-steel-50 transition-opacity hover:opacity-80"
            aria-label="Edit profile"
          >
            <Pencil size={12} aria-hidden /> Edit
          </button>
        </Compartment>

        {/* Stats */}
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-steel-400">
            Your Thapar Bites
          </p>
          {statsLoading ? (
            <SkeletonProfileStats />
          ) : stats ? (
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard
                icon={<IndianRupee size={15} />}
                label="Money saved"
                value={formatINR(stats.moneySaved)}
                tone="turmeric"
                hint="Via Shared Delivery"
              />
              <StatCard
                icon={<Users size={15} />}
                label="Shared orders"
                value={String(stats.sharedOrders)}
                tone="cardamom"
                hint={`out of ${stats.totalOrders} total`}
              />
              <StatCard
                icon={<Receipt size={15} />}
                label="Total orders"
                value={String(stats.totalOrders)}
                tone="steel"
              />
              <StatCard
                icon={<ShieldCheck size={15} />}
                label="Reliability"
                value={`${student.reliabilityScore}/100`}
                tone={student.reliabilityScore >= 85 ? 'cardamom' : student.reliabilityScore >= 60 ? 'turmeric' : 'chili'}
                hint="Based on payment history"
              />
            </div>
          ) : null}
        </div>

        {/* Contact details */}
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-steel-400">
            Details
          </p>
          <Compartment className="p-4">
            <InfoRow icon={<Mail size={14} />} label="Email" value={student.email} />
            <InfoRow icon={<Phone size={14} />} label="Phone" value={student.phone ?? undefined} />
            <InfoRow icon={<Store size={14} />} label="Hostel" value={student.hostel} />
            <InfoRow icon={<HomeIcon size={14} />} label="Room" value={student.roomNumber ?? undefined} />
          </Compartment>
        </div>

        {/* Appearance / theme picker */}
        <AppearanceSection />

        {/* Links */}
        <div className="mt-4 flex flex-col gap-1">
          <Link
            to="/favorites"
            className="flex items-center justify-between rounded-2xl px-4 py-3 hover:bg-steel-100 transition-colors"
          >
            <span className="flex items-center gap-2.5 text-sm font-medium text-steel-700">
              <Heart size={16} aria-hidden /> Favourites
            </span>
            <span className="text-xs text-steel-400">{favoriteCount} saved</span>
          </Link>
          <Link
            to="/change-password"
            className="flex items-center justify-between rounded-2xl px-4 py-3 hover:bg-steel-100 transition-colors"
          >
            <span className="flex items-center gap-2.5 text-sm font-medium text-steel-700">
              <KeyRound size={16} aria-hidden /> Change password
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void logout().then(() => navigate('/login'))}
            className="flex w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium text-chili-600 hover:bg-chili-500/5 transition-colors"
          >
            <LogOut size={16} aria-hidden /> Log out
          </button>
        </div>

        <p className="mt-6 pb-6 text-center text-[11px] text-steel-400">
          Thapar Bites · {student.hostel} Hostel
          <br />
          Version 1.0.1 ·{' '}
          <Link to="/about" className="underline hover:text-steel-600">
            About
          </Link>
        </p>
      </div>

      {editing && (
        <EditProfileModal
          student={student}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            updateStudent(updated);
            setEditing(false);
          }}
        />
      )}
    </AppShell>
  );
}

function EditProfileModal({
  student,
  onClose,
  onSaved,
}: {
  student: StudentProfile;
  onClose: () => void;
  onSaved: (updated: StudentProfile) => void;
}) {
  const [fullName, setFullName] = useState(student.fullName);
  const [phone, setPhone] = useState(student.phone ?? '');
  const [hostel, setHostel] = useState(student.hostel);
  const [roomNumber, setRoomNumber] = useState(student.roomNumber ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch<StudentProfile>('/students/profile', {
        fullName,
        phone: phone || null,
        hostel,
        roomNumber: roomNumber || null,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit profile" onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>

        <div className="rounded-lg border border-steel-150 bg-steel-50 px-3 py-2.5">
          <p className="text-[11px] text-steel-400">Roll Number</p>
          <p className="text-sm font-medium text-steel-700">{student.rollNumber}</p>
          <p className="mt-0.5 text-[10px] text-steel-400">Roll number cannot be changed.</p>
        </div>

        <Field label="Phone" hint="Your mobile number for delivery notifications.">
          <Input
            value={phone}
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98765 43210"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Hostel">
            <HostelSelect
              value={hostel}
              onChange={setHostel}
              hostels={THAPAR_HOSTELS}
              required
            />
          </Field>
          <Field label="Room number">
            <Input
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="e.g. A-214"
            />
          </Field>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="mt-1 flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button fullWidth loading={saving} onClick={() => void save()}>
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
