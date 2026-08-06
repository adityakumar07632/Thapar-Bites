import { Router } from 'express';
import { db } from '../../db/client';
import type { NotificationRow } from '../../db/rows';
import { requireAuth } from '../../lib/auth';
import { ok, fail } from '../../lib/response';
import { mapNotification } from '../../lib/mappers';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth('student'));

// GET /notifications
notificationsRouter.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE student_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.auth!.sub) as NotificationRow[];
  return ok(res, rows.map(mapNotification));
});

// PATCH /notifications/:id — mark as read.
notificationsRouter.patch('/:id', (req, res) => {
  const result = db
    .prepare('UPDATE notifications SET read = 1 WHERE id = ? AND student_id = ?')
    .run(req.params.id, req.auth!.sub);
  if (result.changes === 0) return fail(res, 'ORDER_001', 'Notification not found.');
  return ok(res, { id: req.params.id, read: true });
});
