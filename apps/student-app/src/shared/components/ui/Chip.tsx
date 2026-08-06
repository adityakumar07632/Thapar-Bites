import type { HTMLAttributes } from 'react';
import { Badge } from '@campus-bites/ui';
import type { Tone } from '@campus-bites/ui';

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

/** The student app's name for the shared Badge. */
export function Chip(props: ChipProps) {
  return <Badge {...props} />;
}
