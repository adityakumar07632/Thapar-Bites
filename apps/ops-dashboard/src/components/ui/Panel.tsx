import type { HTMLAttributes } from 'react';
import { Card } from '@campus-bites/ui';

/** Ops surface: the shared Card without the tiffin tray ring. */
export function Panel(props: HTMLAttributes<HTMLDivElement>) {
  return <Card {...props} />;
}

export { Badge } from '@campus-bites/ui';
