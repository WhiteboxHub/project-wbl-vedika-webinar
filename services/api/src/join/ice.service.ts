import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import type { IceServersResponse, RTCIceServerConfig } from '@webinar/shared';

@Injectable()
export class IceService {
  private readonly logger = new Logger(IceService.name);

  constructor(private readonly config: ConfigService) {
    // Warn loudly at startup so operators know relay fallback is absent.
    // Without TURN, users behind symmetric NAT or corporate firewalls will
    // fail to establish a peer connection regardless of client-side fixes.
    const turnUrl = this.config.get<string>('TURN_URL', '');
    const turnSecret = this.config.get<string>('TURN_SECRET', '');
    if (!turnUrl || !turnSecret) {
      this.logger.warn(
        'TURN server is NOT configured (TURN_URL / TURN_SECRET are missing or empty). ' +
        'Attendees behind restrictive NATs or corporate firewalls may fail to connect. ' +
        'Set TURN_URL and TURN_SECRET in your environment to enable relay fallback.',
      );
    }
  }

  /**
   * Returns STUN + time-limited TURN credentials (coturn REST API style).
   */
  getIceServers(participantId: string): IceServersResponse {
    const ttlSeconds = this.config.get<number>('TURN_TTL_SECONDS', 3600);
    const servers: RTCIceServerConfig[] = [];

    // Default to well-known public STUN servers so that connections work
    // outside the developer's own machine.  stun:localhost:3478 is useless
    // for any remote attendee and was the previous (broken) default.
    const stunUrl = this.config.get<string>(
      'STUN_URL',
      'stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302',
    );
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
