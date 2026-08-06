import { Button } from './Button';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-steel-900/40 px-3 pb-3 sm:items-center">
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-5 shadow-xl">
        <p className="font-display text-base font-semibold text-steel-900">{title}</p>
        <p className="mt-1.5 text-sm leading-snug text-steel-500">{description}</p>
        <div className="mt-5 flex gap-2.5">
          <Button variant="secondary" fullWidth onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="primary" fullWidth onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
