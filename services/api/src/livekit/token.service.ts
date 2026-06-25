import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';

export interface TokenOptions {
  roomName: string;
  identity: string;
  name: string;
  canPublish: boolean;
  canSubscribe: boolean;
  metadata?: string;
}

@Injectable()
export class TokenService {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly livekitUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('LIVEKIT_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET') || '';
    this.livekitUrl = this.configService.get<string>('LIVEKIT_URL') || '';

    if (!this.apiKey || !this.apiSecret || !this.livekitUrl) {
      throw new Error('LiveKit credentials not configured');
    }
  }

  async generateToken(options: TokenOptions): Promise<string> {
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: options.identity,
      name: options.name,
      metadata: options.metadata,
    });

    at.addGrant({
      room: options.roomName,
      roomJoin: true,
      canPublish: options.canPublish,
      canSubscribe: options.canSubscribe,
      canPublishData: true,
    });

    return await at.toJwt();
  }

  async generateInstructorToken(roomName: string, identity: string, name: string): Promise<string> {
    return await this.generateToken({
      roomName, identity, name,
      canPublish: true,
      canSubscribe: true,
      metadata: JSON.stringify({ role: 'instructor' }),
    });
  }

  /**
   * Attendees and moderators join with canPublish: true so that:
   *  - After host audio-approval the attendee calls setMicrophoneEnabled(true) immediately
   *  - After promotion to co-organizer they call setScreenShareEnabled(true) immediately
   * The UX gate (approval flow, button visibility) is enforced via the signal layer.
   * This avoids a round-trip updateParticipant call that may fail in dev environments.
   */
  async generateAttendeeToken(roomName: string, identity: string, name: string): Promise<string> {
    return await this.generateToken({
      roomName, identity, name,
      canPublish: true,
      canSubscribe: true,
      metadata: JSON.stringify({ role: 'attendee' }),
    });
  }

  async generatePresenterToken(roomName: string, identity: string, name: string): Promise<string> {
    return await this.generateToken({
      roomName, identity, name,
      canPublish: true,
      canSubscribe: true,
      metadata: JSON.stringify({ role: 'presenter' }),
    });
  }

  async generateModeratorToken(roomName: string, identity: string, name: string): Promise<string> {
    return await this.generateToken({
      roomName, identity, name,
      canPublish: true,
      canSubscribe: true,
      metadata: JSON.stringify({ role: 'moderator' }),
    });
  }

  getRoomServiceClient(): RoomServiceClient {
    return new RoomServiceClient(this.livekitUrl, this.apiKey, this.apiSecret);
  }

  /**
   * Upgrade publish permissions at runtime (best-effort).
   * Uses numeric TrackSource enum values required by livekit-server-sdk protobuf.
   * Falls through silently if LiveKit is unreachable (token-level permission covers it).
   */
  async updateParticipantPermissions(
    roomName: string,
    identity: string,
    canPublish: boolean,
    sources: ('microphone' | 'camera' | 'screen_share' | 'screen_share_audio')[] = [],
  ): Promise<void> {
    const sourceMap: Record<string, TrackSource> = {
      camera:             TrackSource.CAMERA,
      microphone:         TrackSource.MICROPHONE,
      screen_share:       TrackSource.SCREEN_SHARE,
      screen_share_audio: TrackSource.SCREEN_SHARE_AUDIO,
    };

    const canPublishSources = sources.length > 0
      ? sources.map(s => sourceMap[s]).filter(Boolean)
      : undefined;

    try {
      const client = this.getRoomServiceClient();
      await client.updateParticipant(roomName, identity, undefined, {
        canPublish,
        canSubscribe: true,
        canPublishData: true,
        ...(canPublishSources ? { canPublishSources } : {}),
      });
    } catch (err) {
      console.warn('[token] updateParticipantPermissions skipped:', (err as Error).message);
    }
  }
}
