import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ImageOff, QrCode, Save, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Alert } from '@/components/ui/Field';

/**
 * Phase 6E — Platform Payment Settings.
 *
 * Thapar Bites acts as the payment intermediary: students always pay Campus
 * Bites, not a restaurant directly. This page lets a Platform Admin configure
 * the UPI ID, QR code, account holder name, payment instructions, and notes
 * that are shown to every student at checkout.
 *
 * Restaurant UPI settings (managed per-restaurant) are only used for admin
 * payouts after an order is confirmed — they are never shown to students.
 */

interface PlatformPaymentSettings {
  upiId: string | null;
  accountHolderName: string | null;
  qrCodeUrl: string | null;
  paymentInstructions: string | null;
  paymentNotes: string | null;
  updatedAt: string | null;
}

/** Mirrors the server regex so the admin gets the error before saving. */
const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,50}@[a-zA-Z][a-zA-Z0-9]{1,20}$/;

const MAX_QR_BYTES = 1_400_000;
const MAX_QR_EDGE = 600;

async function fileToScaledDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a readable image.'));
    img.src = raw;
  });

  const longest = Math.max(image.width, image.height);
  if (longest <= MAX_QR_EDGE && raw.length <= MAX_QR_BYTES) return raw;

  const scale = Math.min(1, MAX_QR_EDGE / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that image.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export function AdminPlatformPaymentSettingsScreen() {
  const { token } = useAuthStore();
  const fileInput = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<PlatformPaymentSettings | null>(null);
  const [upiId, setUpiId] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const apply = useCallback((data: PlatformPaymentSettings) => {
    setSettings(data);
    setUpiId(data.upiId ?? '');
    setAccountHolderName(data.accountHolderName ?? '');
    setPaymentInstructions(data.paymentInstructions ?? '');
    setPaymentNotes(data.paymentNotes ?? '');
    setQrCodeUrl(data.qrCodeUrl ?? null);
    setTouched(false);
  }, []);

  useEffect(() => {
    api
      .get<PlatformPaymentSettings>('/admin/platform-payment-settings', token)
      .then(apply)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load settings.'));
  }, [token, apply]);

  const upiError = useMemo(() => {
    if (!upiId) return null;
    return UPI_PATTERN.test(upiId) ? null : "UPI ID must look like 'name@bank'.";
  }, [upiId]);

  async function handlePickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await fileToScaledDataUrl(file);
      setQrCodeUrl(dataUrl);
      setTouched(true);

      // Upload the QR immediately, independently of the rest of the form.
      setSaving(true);
      const data = await api.put<PlatformPaymentSettings>(
        '/admin/platform-payment-settings/qr',
        { qrCodeUrl: dataUrl },
        token,
      );
      apply(data);
      setSuccess('QR code updated.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not upload QR code.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveQr() {
    setError(null);
    setSaving(true);
    try {
      const data = await api.put<PlatformPaymentSettings>(
        '/admin/platform-payment-settings/qr',
        { qrCodeUrl: null },
        token,
      );
      apply(data);
      setSuccess('QR code removed.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not remove QR code.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (upiError) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const data = await api.put<PlatformPaymentSettings>(
        '/admin/platform-payment-settings',
        {
          upiId,
          accountHolderName,
          paymentInstructions: paymentInstructions || null,
          paymentNotes: paymentNotes || null,
          qrCodeUrl,
        },
        token,
      );
      apply(data);
      setSuccess('Platform payment settings saved.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-xl font-bold text-steel-900">Platform Payment Settings</h1>
        <p className="text-sm text-steel-500">
          Thapar Bites' own UPI details shown to students at checkout. Students always pay Thapar Bites —
          never the restaurant directly.
        </p>
      </div>

      {/* Callout explaining the payment model */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-cardamom-200 bg-cardamom-50 p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-cardamom-700" />
        <div className="text-sm text-cardamom-800">
          <p className="font-semibold">Payment flow: Student → Thapar Bites → Restaurant</p>
          <p className="mt-0.5 text-cardamom-700">
            Students scan the QR code or use the UPI ID below to pay Thapar Bites. Thapar Bites then
            confirms the order and pays each restaurant using their saved payout details.
            Restaurant UPI settings (under each restaurant's profile) are only used for admin payouts
            and are never visible to students.
          </p>
        </div>
      </div>

      <Panel>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && <Alert tone="error">{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Thapar Bites UPI ID" hint="e.g. campusbites@upi or campusbites@okaxis">
              <Input
                required
                value={upiId}
                onChange={(e) => { setUpiId(e.target.value); setTouched(true); }}
                placeholder="campusbites@bank"
                autoComplete="off"
                spellCheck={false}
              />
              {upiError && touched && (
                <p className="mt-1 text-xs text-chili-600">{upiError}</p>
              )}
            </Field>

            <Field label="Account Holder Name" hint="Name shown to students at checkout">
              <Input
                required
                value={accountHolderName}
                onChange={(e) => { setAccountHolderName(e.target.value); setTouched(true); }}
                placeholder="Thapar Bites Pvt Ltd"
              />
            </Field>
          </div>

          <Field
            label="Payment Instructions"
            hint="Step-by-step instructions shown to students at checkout (optional)"
          >
            <Textarea
              value={paymentInstructions}
              onChange={(e) => { setPaymentInstructions(e.target.value); setTouched(true); }}
              placeholder="1. Open any UPI app&#10;2. Scan the QR code or enter the UPI ID&#10;3. Enter the exact amount shown&#10;4. Add your order ID in remarks"
              rows={4}
            />
          </Field>

          <Field
            label="Payment Notes"
            hint="Short note displayed below the UPI details (optional)"
          >
            <Textarea
              value={paymentNotes}
              onChange={(e) => { setPaymentNotes(e.target.value); setTouched(true); }}
              placeholder="Please ensure the payment reference matches your order ID."
              rows={2}
            />
          </Field>

          {/* QR Code */}
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-1.5 font-display text-sm font-semibold text-steel-800">
              <QrCode size={15} aria-hidden /> Thapar Bites QR Code
            </p>
            {qrCodeUrl ? (
              <div className="flex items-start gap-4">
                <img
                  src={qrCodeUrl}
                  alt="Thapar Bites UPI QR code"
                  className="h-32 w-32 rounded-lg border border-steel-200 bg-white object-contain p-1.5"
                />
                <div className="flex flex-col gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
                    <Upload size={14} /> Replace QR code
                  </Button>
                  <Button type="button" size="sm" variant="danger" onClick={handleRemoveQr}>
                    <Trash2 size={14} /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-steel-200 bg-steel-50 text-steel-300">
                  <ImageOff size={28} />
                </div>
                <p className="text-xs text-steel-500">PNG, JPEG or WebP. Large images are resized automatically.</p>
                <Button type="button" size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
                  <Upload size={14} /> Upload QR code
                </Button>
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handlePickFile(e.target.files?.[0])}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-steel-150 pt-4">
            <p className="text-xs text-steel-400">
              {settings?.updatedAt
                ? `Last updated ${new Date(settings.updatedAt).toLocaleString('en-IN')}`
                : 'Not saved yet.'}
            </p>
            <Button type="submit" loading={saving} disabled={!!upiError}>
              <Save size={15} /> Save settings
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
