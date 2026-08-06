import { Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface StepperItem {
  key: string;
  label: string;
}

interface OrderStepperProps {
  steps: StepperItem[];
  currentIndex: number; // -1 means nothing completed yet
}

export function OrderStepper({ steps, currentIndex }: OrderStepperProps) {
  return (
    <ol>
      {steps.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === steps.length - 1;
        return (
          <li key={step.key} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                className={cn(
                  'absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px',
                  isDone ? 'bg-cardamom-500' : 'bg-steel-200',
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-display text-xs font-semibold',
                isDone && 'bg-cardamom-500 border-cardamom-500 text-white',
                isCurrent && 'border-turmeric-500 bg-turmeric-500/15 text-turmeric-700',
                !isDone && !isCurrent && 'border-steel-200 bg-white text-steel-300',
              )}
            >
              {isDone ? <Check size={14} strokeWidth={3} /> : index + 1}
            </span>
            <span
              className={cn(
                'pt-0.5 text-sm font-medium',
                isCurrent && 'text-steel-900',
                isDone && 'text-steel-700',
                !isDone && !isCurrent && 'text-steel-400',
              )}
            >
              {step.label}
              {isCurrent && (
                <span className="ml-2 inline-flex items-center gap-1 align-middle">
                  <span className="h-1.5 w-1.5 rounded-full bg-turmeric-500 animate-pulse" />
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
