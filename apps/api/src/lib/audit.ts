import { db } from '../db/client';
import { generateId } from './ids';

export type ActorType = 'student' | 'restaurant' | 'admin' | 'system';

export function logAudit(actorType: ActorType, actorId: string | null, action: string, details?: string): void {
  db.prepare('INSERT INTO audit_logs (id, actor_type, actor_id, action, details) VALUES (?, ?, ?, ?, ?)').run(
    generateId('audit'),
    actorType,
    actorId,
    action,
    details ?? null,
  );
}
