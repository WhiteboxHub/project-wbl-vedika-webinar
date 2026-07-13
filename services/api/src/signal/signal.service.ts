import { Injectable, Logger, UnauthorizedException, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
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

/**
 * SignalService — manages WebSocket clients and room state.
 *
 * Hybrid approach: WebSocket references are kept in-memory (they can't be
 * serialized to Redis), but room membership metadata is mirrored to Redis
 * so that session restarts can broadcast accurate participant-left events
 * and future horizontal scaling can use Redis pub/sub for cross-instance
 * message routing.
 */
@Injectable()
export class SignalService implements OnModuleDestroy {
  private readonly logger = new Logger(SignalService.name);
  private readonly rooms = new Map<string, Set<RoomClient>>();
  private readonly clients = new Map<string, RoomClient>();
  private readonly redis: Redis;
  private readonly redisSub: Redis;
  private readonly redisPub: Redis;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.get('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
    this.redisSub = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
    this.redisPub = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });

    this.redis.connect().catch((err) => this.logger.warn(`Redis connect failed: ${err.message}`));
    this.redisSub.connect().catch((err) => this.logger.warn(`Redis sub connect failed: ${err.message}`));
    this.redisPub.connect().catch((err) => this.logger.warn(`Redis pub connect failed: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => {});
    await this.redisSub.quit().catch(() => {});
    await this.redisPub.quit().catch(() => {});
  }

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
   * Mirrors membership to Redis for persistence.
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

    // Mirror to Redis (fire-and-forget for performance)
    this.mirrorToRedis(roomId, payload.sub, userName, role).catch(() => {});

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

      // Remove from Redis mirror (fire-and-forget)
      this.removeFromRedis(client.roomId, participantId).catch(() => {});
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

  // ─── Redis mirror helpers ─────────────────────────────────────────────────

  private async mirrorToRedis(roomId: string, participantId: string, userName: string, role: string): Promise<void> {
    const key = `signal:room:${roomId}`;
    const value = JSON.stringify({ participantId, userName, role, joinedAt: Date.now() });
    await this.redis.hset(key, participantId, value);
    await this.redis.expire(key, 86400); // 24h TTL
  }

  private async removeFromRedis(roomId: string, participantId: string): Promise<void> {
    await this.redis.hdel(`signal:room:${roomId}`, participantId);
  }

  /** Get room membership from Redis (for recovery after restart) */
  async getRoomMembersFromRedis(roomId: string): Promise<Array<{ participantId: string; userName: string; role: string }>> {
    const data = await this.redis.hgetall(`signal:room:${roomId}`);
    return Object.values(data).map((v) => JSON.parse(v));
  }

  /**
   * GAP-08: Purge all in-memory and Redis state for a room after session ends.
   * Call this from SessionsService.endSession() to prevent memory leaks in
   * long-running processes that host many sequential webinars.
   */
  purgeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      // Remove every client in this room from the clients map
      room.forEach((client) => {
        this.clients.delete(client.participantId);
      });
      this.rooms.delete(roomId);
      this.logger.log(`[${roomId}] Room purged from memory (${room.size} clients removed)`);
    }
    // Remove from Redis mirror (fire-and-forget)
    this.redis.del(`signal:room:${roomId}`).catch(() => {});
  }
}
