import { db } from '../db/client';
import { generateId } from './ids';

export function notifyStudent(studentId: string, title: string, body: string): void {
  db.prepare('INSERT INTO notifications (id, student_id, title, body) VALUES (?, ?, ?, ?)').run(
    generateId('note'),
    studentId,
    title,
    body,
  );
}

/**
 * Phase 6B — kitchen-facing notification. Only ever called once an admin has
 * confirmed the restaurant payout, which is the moment the order becomes
 * visible to the restaurant at all.
 */
export function notifyRestaurant(
  restaurantId: string,
  title: string,
  body: string,
  orderId?: string | null,
): void {
  db.prepare(
    'INSERT INTO restaurant_notifications (id, restaurant_id, order_id, title, body) VALUES (?, ?, ?, ?, ?)',
  ).run(generateId('rnote'), restaurantId, orderId ?? null, title, body);
}
