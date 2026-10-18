import { queryOne, run } from './db';
import { Server as SocketIOServer } from 'socket.io';

export type OrderStatus =
  | 'PLACED'
  | 'CONFIRMED'
  | 'PICKING'
  | 'PICKED'
  | 'PACKING'
  | 'PACKED'
  | 'ON_CONVEYOR'
  | 'CONVEYOR_QUEUED'
  | 'SCANNED'
  | 'DETECTED'
  | 'SORTING'
  | 'SORTED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED';

const VALID_TRANSITIONS: Record<string, string[]> = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PICKING', 'CANCELLED'],
  PICKING: ['PICKED', 'CANCELLED'],
  PICKED: ['PACKING', 'PACKED', 'CANCELLED'],
  PACKING: ['PACKED', 'CANCELLED'],
  PACKED: ['ON_CONVEYOR', 'CONVEYOR_QUEUED', 'SCANNED'],
  CONVEYOR_QUEUED: ['ON_CONVEYOR', 'DETECTED'],
  ON_CONVEYOR: ['SCANNED', 'DETECTED', 'SORTING', 'CANCELLED'],
  SCANNED: ['DETECTED', 'SORTING', 'CANCELLED'],
  DETECTED: ['SORTING', 'CANCELLED'],
  SORTING: ['SORTED', 'CANCELLED', 'CONFIRMED'],
  SORTED: ['DISPATCHED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: ['RETURN_REQUESTED'],
  CANCELLED: [],
  RETURN_REQUESTED: []
};

export function isValidTransition(currentStatus: string, targetStatus: string, isAdmin = false): boolean {
  if (isAdmin) return true; // Admin override permitted
  if (currentStatus === targetStatus) return true;
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

export function transitionOrderStatus(
  orderId: string,
  newStatus: string,
  note: string,
  io?: SocketIOServer | null,
  isAdmin = false,
  changedBy?: string
): { success: boolean; error?: string; oldStatus?: string } {
  const current = queryOne<{ status: string }>("SELECT status FROM orders WHERE id = ?", [orderId]);
  if (!current) {
    return { success: false, error: `Order ${orderId} not found` };
  }

  const oldStatus = current.status;
  if (!isValidTransition(oldStatus, newStatus, isAdmin)) {
    return {
      success: false,
      error: `Invalid status transition from ${oldStatus} to ${newStatus}.`,
      oldStatus
    };
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", [newStatus, now, orderId]);

  const histId = `hist-${orderId}-${Date.now()}`;
  run(
    "INSERT INTO order_status_history (id, order_id, status, note, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)",
    [histId, orderId, newStatus, note || `Transitioned to ${newStatus}`, changedBy || null, now]
  );

  if (io) {
    const payload = {
      orderId,
      oldStatus,
      newStatus,
      status: newStatus,
      note: note || '',
      timestamp: now,
      changedAt: now
    };
    io.emit('order:status_changed', payload);
    io.emit('order:status:changed', payload);
  }

  return { success: true, oldStatus };
}
