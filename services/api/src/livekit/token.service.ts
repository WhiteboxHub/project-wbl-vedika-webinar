import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

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
      roomName,
      identity,
      name,
      canPublish: true,
      canSubscribe: true,
      metadata: JSON.stringify({ role: 'instructor' }),
    });
  }

  async generateAttendeeToken(roomName: string, identity: string, name: string): Promise<string> {
    return await this.generateToken({
      roomName,
      identity,
      name,
      canPublish: false,
      canSubscribe: true,
      metadata: JSON.stringify({ role: 'attendee' }),
    });
  }

  async generatePresenterToken(roomName: string, identity: string, name: string): Promise<string> {
    return await this.generateToken({
      roomName,
      identity,
      name,
      canPublish: true,
      canSubscribe: true,
      metadata: JSON.stringify({ role: 'presenter' }),
    });
  }

  async generateModeratorToken(roomName: string, identity: string, name: string): Promise<string> {
    return await this.generateToken({
      roomName,
      identity,
      name,
      canPublish: false,
      canSubscribe: true,
      metadata: JSON.stringify({ role: 'moderator' }),
    });
  }

  getRoomServiceClient(): RoomServiceClient {
    return new RoomServiceClient(this.livekitUrl, this.apiKey, this.apiSecret);
  }

  /**
   * Update a participant's publish permissions at runtime.
   * Called when the host approves audio for an attendee, or promotes to co-organizer.
   */
  async updateParticipantPermissions(
    roomName: string,
    identity: string,
    canPublish: boolean,
    canPublishSources?: ('camera' | 'microphone' | 'screen_share' | 'screen_share_audio')[],
  ): Promise<void> {
    const client = this.getRoomServiceClient();
    await client.updateParticipant(roomName, identity, undefined, {
      canPublish,
      canSubscribe: true,
      canPublishData: true,
      ...(canPublishSources ? { canPublishSources } : {}),
    } as any);
  }
}
