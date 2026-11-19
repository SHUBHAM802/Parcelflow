import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    // Pass JWT token for authenticated Socket.IO connections
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('parcelflow_token') : null;
    socketInstance = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: token ? { token } : undefined
    });
  }
  return socketInstance;
}

/** Reconnect socket with fresh auth token (call after login/logout) */
export function reconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
  getSocket();
}

export function initSocket(): Socket {
  return getSocket();
}
