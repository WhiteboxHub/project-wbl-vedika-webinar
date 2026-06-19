import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import type { IceServersResponse, RTCIceServerConfig } from '@webinar/shared';

@Injectable()
export class IceService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Returns STUN + time-limited TURN credentials (coturn REST API style).
   */
  getIceServers(participantId: string): IceServersResponse {
    const ttlSeconds = this.config.get<number>('TURN_TTL_SECONDS', 3600);
    const servers: RTCIceServerConfig[] = [];

    const stunUrl = this.config.get<string>('STUN_URL', 'stun:localhost:3478');
    if (stunUrl) servers.push({ urls: stunUrl });

    const turnUrl = this.config.get<string>('TURN_URL', '');
    const turnSecret = this.config.get<string>('TURN_SECRET', '');

    if (turnUrl && turnSecret) {
      const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
      const username = `${expiry}:${participantId}`;
      const credential = createHmac('sha1', turnSecret).update(username).digest('base64');
      servers.push({ urls: turnUrl, username, credential });
    }

    return { iceServers: servers, ttlSeconds };
  }

  /** Ephemeral participant id for anonymous pre-join diagnostics */
  createDiagnosticParticipantId(): string {
    return randomBytes(16).toString('hex');
  }
}
