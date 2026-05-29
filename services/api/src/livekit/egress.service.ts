import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoomCompositeEgressRequest, EncodedFileOutput, EgressClient } from 'livekit-server-sdk';

export interface StartEgressOptions {
  roomName: string;
  outputPath: string;
}

export interface StartEgressResult {
  egressId: string;
}

export interface StopEgressResult {
  success: boolean;
}

@Injectable()
export class EgressService {
  private readonly logger = new Logger(EgressService.name);
  private readonly egressClient: EgressClient;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get('LIVEKIT_API_SECRET');
    const url = this.configService.get('LIVEKIT_URL');

    this.enabled = this.configService.get('LIVEKIT_EGRESS_ENABLED', 'true') === 'true';

    if (this.enabled && apiKey && apiSecret && url) {
      this.egressClient = new EgressClient(url, apiKey, apiSecret);
      this.logger.log('LiveKit Egress client initialized');
    } else {
      this.logger.warn('LiveKit Egress is disabled or not configured');
    }
  }

  async startRoomCompositeEgress(options: StartEgressOptions): Promise<StartEgressResult> {
    if (!this.enabled || !this.egressClient) {
      throw new Error('LiveKit Egress is not enabled');
    }

    this.logger.log(`Starting egress for room ${options.roomName} -> ${options.outputPath}`);

    const output: EncodedFileOutput = {
      fileType: 'MP4',
      filepath: options.outputPath,
    };

    const egressRequest: RoomCompositeEgressRequest = {
      roomName: options.roomName,
      layout: 'speaker',
      output: {
        case: 'file',
        value: output,
      },
    };

    try {
      const egress = await this.egressClient.startRoomCompositeEgress(options.roomName, output);

      this.logger.log(`Egress started: ${egress.egressId}`);

      return {
        egressId: egress.egressId,
      };
    } catch (error) {
      this.logger.error('Failed to start egress', error);
      throw error;
    }
  }

  async stopEgress(egressId: string): Promise<StopEgressResult> {
    if (!this.enabled || !this.egressClient) {
      throw new Error('LiveKit Egress is not enabled');
    }

    this.logger.log(`Stopping egress ${egressId}`);

    try {
      await this.egressClient.stopEgress(egressId);

      this.logger.log(`Egress stopped: ${egressId}`);

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error(`Failed to stop egress ${egressId}`, error);
      throw error;
    }
  }
}
