import type { Response } from 'express';

/**
 * A minimal in-memory pub/sub for Server-Sent Events. Events carry only a
 * type and enough ids to know what changed — never the payload itself.
 * Clients react by re-fetching through the normal REST endpoints, which
 * stay the single source of truth. This keeps the event bus "dumb" and
 * avoids maintaining a second serialization path alongside the mappers.
 */

type SseEvent = { type: string; [key: string]: unknown };

const studentConnections = new Map<string, Set<Response>>();
const restaurantConnections = new Map<string, Set<Response>>();

function add(map: Map<string, Set<Response>>, key: string, res: Response) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(res);
}

function remove(map: Map<string, Set<Response>>, key: string, res: Response) {
  map.get(key)?.delete(res);
  if (map.get(key)?.size === 0) map.delete(key);
}

export function registerStudentConnection(studentId: string, res: Response) {
  add(studentConnections, studentId, res);
}
export function unregisterStudentConnection(studentId: string, res: Response) {
  remove(studentConnections, studentId, res);
}
export function registerRestaurantConnection(restaurantId: string, res: Response) {
  add(restaurantConnections, restaurantId, res);
}
export function unregisterRestaurantConnection(restaurantId: string, res: Response) {
  remove(restaurantConnections, restaurantId, res);
}

/**
 * Phase 2 SSE hardening: `res.write` on a socket that has already gone away
 * throws (ERR_STREAM_DESTROYED / EPIPE). That exception used to propagate
 * into whichever route was pushing the event — a student closing their tab
 * mid-order could fail the restaurant's status update. Writes are now
 * isolated and a dead connection is evicted on the spot.
 */
function write(map: Map<string, Set<Response>>, key: string, res: Response, event: SseEvent) {
  if (res.writableEnded || res.destroyed) {
    remove(map, key, res);
    return;
  }
  try {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch (error) {
    console.error('[eventBus] dropping dead SSE connection:', error);
    remove(map, key, res);
  }
}

export function pushToStudent(studentId: string, event: SseEvent) {
  const conns = studentConnections.get(studentId);
  if (!conns) return;
  for (const res of [...conns]) write(studentConnections, studentId, res, event);
}

export function pushToRestaurant(restaurantId: string, event: SseEvent) {
  const conns = restaurantConnections.get(restaurantId);
  if (!conns) return;
  for (const res of [...conns]) write(restaurantConnections, restaurantId, res, event);
}

export function connectionStats() {
  return {
    students: studentConnections.size,
    restaurants: restaurantConnections.size,
  };
}
