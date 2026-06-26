import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WebSocket } from 'ws';
import type { SignalTokenPayload } from '@webinar/shared';

export interface RoomClient {
  ws: WebSocket;
  participantId: string;
  userName: string;
  roomId: string;
  role: string;
  connectionEpoch: number;
  jti: string;
}

@Injectable()
export class SignalService {
  private readonly logger = new Logger(SignalService.name);
  private readonly rooms = new Map<string, Set<RoomClient>>();
  private readonly clients = new Map<string, RoomClient>();

  constructor(private readonly jwtService: JwtService) {}

  validateToken(token: string): SignalTokenPayload | null {
    try {
      return this.jwtService.verify<SignalTokenPayload>(token);
    } catch {
      return null;
    }
  }

  /**
   * Idempotent join: same participantId replaces stale socket.
   * Rejects room mismatch and duplicate jti on different sockets.
   */
  registerClient(
    ws: WebSocket,
    payload: SignalTokenPayload,
    roomId: string,
    userName: string,
    role: string,
  ): RoomClient {
    if (payload.roomId !== roomId) {
      throw new UnauthorizedException('Room ID does not match token');
    }

    const existing = this.clients.get(payload.sub);
    if (existing) {
      if (existing.jti === payload.jti && existing.ws !== ws) {
        this.logger.warn(`[${roomId}] Replacing stale socket for ${payload.sub}`);
        this.removeClient(payload.sub, false);
      } else if (existing.ws !== ws) {
        existing.ws.close(4000, 'DUPLICATE_IDENTITY');
        this.removeClient(payload.sub, false);
      }
    }

    const client: RoomClient = {
      ws,
      participantId: payload.sub,
      userName,
      roomId,
      role,
      connectionEpoch: (existing?.connectionEpoch ?? 0) + 1,
      jti: payload.jti,
    };

    this.clients.set(payload.sub, client);
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId)!.add(client);
    this.logger.log(`[${roomId}] +${userName} (${role}) epoch=${client.connectionEpoch}`);
    return client;
  }

  addClient(client: RoomClient): void {
    this.clients.set(client.participantId, client);
    if (!this.rooms.has(client.roomId)) this.rooms.set(client.roomId, new Set());
    this.rooms.get(client.roomId)!.add(client);
  }

  removeClient(participantId: string, removeFromRoom = true): RoomClient | undefined {
    const client = this.clients.get(participantId);
    if (client) {
      this.clients.delete(participantId);
      if (removeFromRoom) {
        this.rooms.get(client.roomId)?.delete(client);
      }
      this.logger.log(`[${client.roomId}] -${client.userName}`);
    }
    return client;
  }

  getClient(participantId: string): RoomClient | undefined {
    return this.clients.get(participantId);
  }

  getRoomClients(roomId: string): RoomClient[] {
    return [...(this.rooms.get(roomId) ?? [])];
  }

  broadcast(roomId: string, event: string, payload: unknown, excludeParticipantId?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const msg = JSON.stringify({ event, data: payload });
    room.forEach((c) => {
      if (c.participantId !== excludeParticipantId && c.ws.readyState === 1) {
        c.ws.send(msg);
      }
    });
  }

  sendTo(participantId: string, event: string, payload: unknown): void {
    const client = this.clients.get(participantId);
    if (client?.ws.readyState === 1) {
      client.ws.send(JSON.stringify({ event, data: payload }));
    }
  }

  sendDirect(ws: WebSocket, event: string, payload: unknown): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ event, data: payload }));
    }
  }

  /** Relay WebRTC signaling to a specific participant in the same room */
  relayWebRtc(
    fromParticipantId: string,
    targetParticipantId: string,
    event: string,
    data: Record<string, unknown>,
  ): void {
    const sender = this.clients.get(fromParticipantId);
    const target = this.clients.get(targetParticipantId);
    if (!sender || !target) return;
    if (sender.roomId !== target.roomId) {
      this.logger.warn(`Room mismatch relay ${fromParticipantId} -> ${targetParticipantId}`);
      return;
    }
    this.sendTo(targetParticipantId, event, {
      ...data,
      fromParticipantId,
      targetParticipantId,
    });
  }
}
