import { db } from '../../db/client';
import type { OrderRow } from '../../db/rows';
import { generateId } from '../../lib/ids';
import { notifyStudent } from '../../lib/notify';
import { pushToStudent } from '../../lib/eventBus';

const TICK_MS = 1200;

/**
 * Ch. 10's delivery workflow (collected → out for delivery → driver
 * arrived) is normally driven by a delivery partner's own app, which is out
 * of scope here. This auto-advances those specific steps a few seconds
 * apart once a restaurant marks an order 'ready_for_pickup', so the loop
 * doesn't dead-end waiting for an app that doesn't exist yet. Everything
 * before this point (accept/preparing/ready) is a real, manual action from
 * the Restaurant Dashboard — see restaurantDashboard.routes.ts.
 */
const NEXT_STEP: Record<string, string> = {
  ready_for_pickup: 'collected',
  collected: 'out_for_delivery',
  out_for_delivery: 'driver_arrived',
  // 'delivered' → 'completed' was previously handled by a one-shot setTimeout
  // in delivery.routes.ts that did not survive server restarts. The engine
  // tick is the right place: idempotent, always running, restart-safe.
  delivered: 'completed',
};

const STEP_AGE_MS = 3000; // how long an order sits in a step before advancing

export function startFulfillmentEngine(): void {
  setInterval(() => {
    try {
      for (const [fromStatus, toStatus] of Object.entries(NEXT_STEP)) {
        const cutoff = new Date(Date.now() - STEP_AGE_MS).toISOString();
        const due = db
          .prepare('SELECT * FROM orders WHERE status = ? AND updated_at < ?')
          .all(fromStatus, cutoff) as OrderRow[];

        for (const order of due) {
          db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(
            toStatus,
            new Date().toISOString(),
            order.id,
          );
          pushToStudent(order.student_id, { type: 'order_updated', orderId: order.id });

          if (toStatus === 'collected') {
            const existing = db.prepare('SELECT id FROM deliveries WHERE order_id = ?').get(order.id);
            if (!existing) {
              db.prepare(
                "INSERT INTO deliveries (id, order_id, driver_name, assigned_at) VALUES (?, ?, ?, ?)",
              ).run(generateId('del'), order.id, 'Ramesh (Delivery Partner)', new Date().toISOString());
            }
          }
          if (toStatus === 'driver_arrived') {
            db.prepare('UPDATE deliveries SET arrived_at = ? WHERE order_id = ?').run(
              new Date().toISOString(),
              order.id,
            );
            notifyStudent(order.student_id, 'Your delivery partner has arrived', 'Share your PairCode to confirm handover.');
          }
        }
      }
    } catch (err) {
      console.error('[fulfillment-engine] tick error:', err);
    }
  }, TICK_MS);
  console.log(`[fulfillment-engine] started — checking every ${TICK_MS}ms`);
}
