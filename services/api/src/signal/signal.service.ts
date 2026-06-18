import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WebSocket } from 'ws';

export interface RoomClient {
  ws: WebSocket;
  userId: string;
  userName: string;
  roomId: string;
  role: string;
}

@Injectable()
export class SignalService {
  private readonly logger = new Logger(SignalService.name);
  private readonly rooms = new Map<string, Set<RoomClient>>();
  private readonly clients = new Map<string, RoomClient>();

  constructor(private readonly jwtService: JwtService) {}

  validateToken(token: string): { sub: string; email: string; role: string } | null {
    try {
      return this.jwtService.verify<{ sub: string; email: string; role: string }>(token);
    } catch {
      return null;
    }
  }

  addClient(client: RoomClient): void {
    this.clients.set(client.userId, client);
    if (!this.rooms.has(client.roomId)) this.rooms.set(client.roomId, new Set());
    this.rooms.get(client.roomId)!.add(client);
    this.logger.log(`[${client.roomId}] +${client.userName} (${client.role})`);
  }

  removeClient(userId: string): RoomClient | undefined {
    const client = this.clients.get(userId);
    if (client) {
      this.clients.delete(userId);
      this.rooms.get(client.roomId)?.delete(client);
      this.logger.log(`[${client.roomId}] -${client.userName}`);
    }
    return client;
  }

  getClient(userId: string): RoomClient | undefined {
    return this.clients.get(userId);
  }

  getRoomClients(roomId: string): RoomClient[] {
    return [...(this.rooms.get(roomId) ?? [])];
  }

  broadcast(roomId: string, event: string, payload: unknown, excludeUserId?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const msg = JSON.stringify({ event, data: payload });
    room.forEach((c) => {
      if (c.userId !== excludeUserId && c.ws.readyState === 1) {
        c.ws.send(msg);
      }
    });
  }

  sendTo(userId: string, event: string, payload: unknown): void {
    const client = this.clients.get(userId);
    if (client?.ws.readyState === 1) {
      client.ws.send(JSON.stringify({ event, data: payload }));
    }
  }

  sendDirect(ws: WebSocket, event: string, payload: unknown): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ event, data: payload }));
    }
  }
}
