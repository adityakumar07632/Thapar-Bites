import type { HTMLAttributes } from 'react';
import { Card } from '@campus-bites/ui';

interface CompartmentProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

/**
 * The "tiffin compartment" surface: a steel tray with a faint inset ring,
 * like looking down into one compartment of a dabba. Now a thin wrapper over
 * the shared `Card` with the tray detail enabled.
 */
export function Compartment(props: CompartmentProps) {
  return <Card tray {...props} />;
}
