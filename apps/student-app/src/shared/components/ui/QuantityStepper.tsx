import { Minus, Plus } from 'lucide-react';

interface QuantityStepperProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

export function QuantityStepper({ quantity, onIncrement, onDecrement }: QuantityStepperProps) {
  if (quantity === 0) {
    return (
      <button
        type="button"
        onClick={onIncrement}
        className="rounded-lg border border-turmeric-500 px-3.5 py-1.5 text-xs font-display font-semibold text-turmeric-700 active:bg-turmeric-500/10"
      >
        Add
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-turmeric-500 px-1.5 py-1.5 text-steel-900">
      <button
        type="button"
        onClick={onDecrement}
        className="flex h-5 w-5 items-center justify-center"
        aria-label="Decrease quantity"
      >
        <Minus size={14} strokeWidth={2.5} />
      </button>
      <span className="min-w-[1ch] text-center text-xs font-display font-bold">{quantity}</span>
      <button
        type="button"
        onClick={onIncrement}
        className="flex h-5 w-5 items-center justify-center"
        aria-label="Increase quantity"
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}
