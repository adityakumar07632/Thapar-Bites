import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ImageOff, QrCode, Save, Trash2, Upload } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Alert } from '@/components/ui/Field';

/**
 * Phase 6C — Restaurant Payment Settings form.
 *
 * Shared by the restaurant manager's own settings page and the admin's
 * per-restaurant view. The two surfaces differ only in the API paths they
 * talk to and in whether the enable/disable switch is shown, so they are
 * passed in rather than duplicating the form twice.
 */

export interface PaymentSettings {
  restaurantId: string;
  restaurantName: string;
  upiId: string | null;
  qrCodeUrl: string | null;
  accountHolderName: string | null;
  paymentNotes: string | null;
  onlinePaymentsEnabled: boolean;
  updatedAt: string | null;
}

/** Mirrors the server's regex so the manager gets the error before saving. */
const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,50}@[a-zA-Z][a-zA-Z0-9]{1,20}$/;

const MAX_QR_BYTES = 1_400_000;
const MAX_QR_EDGE = 600;

/**
 * Reads the picked file and, if it is bigger than a QR needs to be, redraws it
 * onto a smaller canvas. A phone photo of a printed QR is several megabytes;
 * 600px square is plenty to scan and keeps the request inside the API's limit.
 */
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
  // White backdrop: a transparent PNG would turn black on export and stop scanning.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export function PaymentSettingsPanel({
  basePath,
  canToggle = false,
  heading = 'Payment settings',
  subheading = 'Where Thapar Bites transfers your money, and what students see at checkout.',
}: {
  /** '/restaurant/payment-settings' or '/admin/restaurants/:id/payment-settings'. */
  basePath: string;
  canToggle?: boolean;
  heading?: string;
  subheading?: string;
}) {
  const { token } = useAuthStore();
  const fileInput = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [upiId, setUpiId] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [touched, setTouched] = useState(false);

  const apply = useCallback((data: PaymentSettings) => {
    setSettings(data);
    setUpiId(data.upiId ?? '');
    setAccountHolderName(data.accountHolderName ?? '');
    setPaymentNotes(data.paymentNotes ?? '');
    setQrCodeUrl(data.qrCodeUrl);
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await api.get<PaymentSettings>(basePath, token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load payment settings.');
    }
  }, [apply, basePath, token]);

  useEffect(() => {
    load();
  }, [load]);

  const upiError = useMemo(() => {
    if (!touched) return undefined;
    if (!upiId.trim()) return 'UPI ID is required.';
    if (!UPI_PATTERN.test(upiId.trim())) return "Enter a valid UPI ID, e.g. 'campuscafe@okicici'.";
    return undefined;
  }, [touched, upiId]);

  const nameError = useMemo(() => {
    if (!touched) return undefined;
    if (accountHolderName.trim().length < 2) return 'Account holder name is required.';
    return undefined;
  }, [touched, accountHolderName]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    setSuccess(null);
    if (!UPI_PATTERN.test(upiId.trim()) || accountHolderName.trim().length < 2) return;

    setSaving(true);
    try {
      const data = await api.put<PaymentSettings>(
        basePath,
        {
          upiId: upiId.trim(),
          accountHolderName: accountHolderName.trim(),
          paymentNotes: paymentNotes.trim() || null,
          qrCodeUrl,
        },
        token,
      );
      apply(data);
      setTouched(false);
      setSuccess('Payment settings saved.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save payment settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSuccess(null);
    try {
      const dataUrl = await fileToScaledDataUrl(file);
      if (dataUrl.length > MAX_QR_BYTES) {
        setError('That image is too large even after resizing. Please upload a smaller picture.');
        return;
      }
      // Uploading replaces the stored QR immediately so a manager can't leave
      // the page believing the new code is live when it was never saved.
      const data = await api.put<PaymentSettings>(`${basePath}/qr`, { qrCodeUrl: dataUrl }, token);
      apply(data);
      setSuccess('QR code updated.');
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not upload that QR code.',
      );
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleRemoveQr() {
    setError(null);
    setSuccess(null);
    try {
      apply(await api.put<PaymentSettings>(`${basePath}/qr`, { qrCodeUrl: null }, token));
      setSuccess('QR code removed.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not remove the QR code.');
    }
  }

  async function handleToggle() {
    if (!settings) return;
    setToggling(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await api.patch<PaymentSettings>(
        `${basePath}/toggle`,
        { enabled: !settings.onlinePaymentsEnabled },
        token,
      );
      apply(data);
      setSuccess(data.onlinePaymentsEnabled ? 'Online payments enabled.' : 'Online payments disabled.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change the payment status.');
    } finally {
      setToggling(false);
    }
  }

  return (
    <Panel className="p-6">
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-steel-900">{heading}</h2>
            <p className="text-sm text-steel-500">{subheading}</p>
          </div>
          {settings && (
            <Badge tone={settings.onlinePaymentsEnabled ? 'cardamom' : 'neutral'}>
              {settings.onlinePaymentsEnabled ? 'Online payments on' : 'Online payments off'}
            </Badge>
          )}
        </div>

        {error && <Alert>{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}

        {settings && !settings.onlinePaymentsEnabled && (
          <Alert tone="info">
            Online payments are switched off. Students are not shown your UPI ID or QR code at checkout.
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="UPI ID"
            hint="Where Thapar Bites transfers your payouts, e.g. campuscafe@okicici"
            error={upiError}
          >
            <Input
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="campuscafe@okicici"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </Field>

          <Field label="Account holder name" hint="The name registered on that UPI account." error={nameError}>
            <Input
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Campus Cafe Pvt Ltd"
              required
            />
          </Field>
        </div>

        <Field label="Payment notes (optional)" hint="Shown to students at checkout — max 300 characters.">
          <Textarea
            value={paymentNotes}
            maxLength={300}
            rows={3}
            onChange={(e) => setPaymentNotes(e.target.value)}
            placeholder="Add your order number in the payment remark."
          />
        </Field>

        <div className="flex flex-col gap-3 rounded-xl border border-steel-200 p-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-steel-200 bg-steel-50">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="Restaurant payment QR code" className="h-full w-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-steel-400">
                <ImageOff size={20} aria-hidden />
                <span className="text-xs">No QR code</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 font-display text-sm font-semibold text-steel-800">
              <QrCode size={15} aria-hidden /> Payment QR code
            </p>
            <p className="text-xs text-steel-500">
              PNG, JPEG or WebP. Large pictures are resized automatically before upload.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
                <Upload size={14} /> {qrCodeUrl ? 'Replace QR code' : 'Upload QR code'}
              </Button>
              {qrCodeUrl && (
                <Button type="button" size="sm" variant="danger" onClick={handleRemoveQr}>
                  <Trash2 size={14} /> Remove
                </Button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handlePickFile(e.target.files?.[0])}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-steel-150 pt-4">
          <p className="text-xs text-steel-400">
            {settings?.updatedAt
              ? `Last updated ${new Date(settings.updatedAt).toLocaleString('en-IN')}`
              : 'Not saved yet.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {canToggle && settings && (
              <Button type="button" variant="secondary" loading={toggling} onClick={handleToggle}>
                {settings.onlinePaymentsEnabled ? 'Disable online payments' : 'Enable online payments'}
              </Button>
            )}
            <Button type="submit" loading={saving}>
              <Save size={15} /> Save payment settings
            </Button>
          </div>
        </div>
      </form>
    </Panel>
  );
}
