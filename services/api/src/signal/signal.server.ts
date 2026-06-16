import { Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import type { Server as HttpServer } from 'http';

/**
 * Minimal WebSocket signaling server for WebRTC.
 *
 * Handles:
 *  - Room-based join/leave
 *  - SDP offer/answer relay
 *  - ICE candidate relay
 *  - Chat message relay
 *  - Hand raise relay
 *  - Room user listing
 *
 * Attaches to an existing HTTP server on path /signal.
 */

interface Client {
  ws: WebSocket;
  userId: string;
  roomId: string | null;
  metadata: Record<string, any>;
}

export function attachSignalServer(httpServer: HttpServer): void {
  const logger = new Logger('SignalServer');

  const wss = new WebSocket.Server({ server: httpServer, path: '/signal' });

  // Track all connected clients
  const clients = new Map<WebSocket, Client>();

  wss.on('connection', (ws: WebSocket) => {
    const client: Client = { ws, userId: '', roomId: null, metadata: {} };
    clients.set(ws, client);

    logger.log('Client connected');

    ws.on('message', (raw: WebSocket.RawData) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case 'join':
          handleJoin(client, msg);
          break;
        case 'leave':
          handleLeave(client);
          break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          relayToPeer(client, msg);
          break;
        case 'chat':
          broadcastToRoom(client, {
            type: 'chat',
            from: client.userId,
            message: msg.message,
            timestamp: Date.now(),
          });
          break;
        case 'hand-raise':
          broadcastToRoom(client, {
            type: 'hand-raise',
            userId: client.userId,
            raised: msg.raised,
          });
          break;
        default:
          logger.warn(`Unknown message type: ${msg.type}`);
      }
    });

    ws.on('close', () => {
      handleLeave(client);
      clients.delete(ws);
      logger.log(`Client disconnected: ${client.userId || 'unknown'}`);
    });

    ws.on('error', (err) => {
      logger.error(`WebSocket error: ${err.message}`);
    });
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleJoin(client: Client, msg: any): void {
    client.userId = msg.userId;
    client.roomId = msg.roomId;
    client.metadata = msg.metadata || {};

    logger.log(`User ${client.userId} joined room ${client.roomId}`);

    // Send the new user the list of existing users in the room
    const existingUsers: { userId: string; metadata: any }[] = [];
    clients.forEach((c) => {
      if (c !== client && c.roomId === client.roomId && c.userId) {
        existingUsers.push({ userId: c.userId, metadata: c.metadata });
      }
    });

    send(client.ws, {
      type: 'room-users',
      users: existingUsers,
    });

    // Notify everyone else in the room that this user joined
    broadcastToRoom(client, {
      type: 'user-joined',
      userId: client.userId,
      metadata: client.metadata,
    });
  }

  function handleLeave(client: Client): void {
    if (!client.roomId || !client.userId) return;

    logger.log(`User ${client.userId} left room ${client.roomId}`);

    // Notify room members
    broadcastToRoom(client, {
      type: 'user-left',
      userId: client.userId,
    });

    client.roomId = null;
  }

  function relayToPeer(sender: Client, msg: any): void {
    const targetId = msg.to;
    if (!targetId) return;

    // Find the target client in the same room
    const target = Array.from(clients.values()).find(
      (c) => c.userId === targetId && c.roomId === sender.roomId,
    );

    if (!target) {
      logger.warn(`Peer ${targetId} not found in room ${sender.roomId}`);
      return;
    }

    // Relay the message, replacing 'to' with 'from'
    const relayed = { ...msg, from: sender.userId };
    delete relayed.to;
    send(target.ws, relayed);
  }

  function broadcastToRoom(sender: Client, msg: any): void {
    clients.forEach((c) => {
      if (c !== sender && c.roomId === sender.roomId && c.ws.readyState === WebSocket.OPEN) {
        send(c.ws, msg);
      }
    });
  }

  function send(ws: WebSocket, msg: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  logger.log('Signal server attached at /signal');
}
