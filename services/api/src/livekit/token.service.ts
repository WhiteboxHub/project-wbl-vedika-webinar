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
    this.apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    this.apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');
    this.livekitUrl = this.configService.get<string>('LIVEKIT_URL');

    if (!this.apiKey || !this.apiSecret || !this.livekitUrl) {
      throw new Error('LiveKit credentials not configured');
    }
  }

  generateToken(options: TokenOptions): string {
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

    return at.toJwt();
  }

  generateInstructorToken(roomName: string, identity: string, name: string): string {
    return this.generateToken({
      roomName,
      identity,
      name,
      canPublish: true,
      canSubscribe: true,
      metadata: JSON.stringify({ role: 'instructor' }),
    });
  }

  generateAttendeeToken(roomName: string, identity: string, name: string): string {
    return this.generateToken({
      roomName,
      identity,
      name,
      canPublish: false,
      canSubscribe: true,
      metadata: JSON.stringify({ role: 'attendee' }),
    });
  }

  getRoomServiceClient(): RoomServiceClient {
    return new RoomServiceClient(this.livekitUrl, this.apiKey, this.apiSecret);
  }
}
