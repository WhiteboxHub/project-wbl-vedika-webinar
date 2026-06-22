import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenService } from '../livekit/token.service';
import { SessionEntity } from '../database/entities/session.entity';
import { SignalService } from '../signal/signal.service';
import { NotFoundException } from '@nestjs/common';
import type { SessionParticipantRecord } from '@webinar/shared';

@Injectable()
export class ModerationService {
  constructor(
    private readonly tokenService: TokenService,
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
    private readonly signalService: SignalService,
  ) {}

  private async getLiveKitRoomName(sessionId: string): Promise<string> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    return session.liveKitRoomName;
  }

  async muteParticipant(
    sessionId: string,
    identity: string,
    trackSid: string,
    muted: boolean,
  ): Promise<void> {
    const roomName = await this.getLiveKitRoomName(sessionId);
    const roomClient = this.tokenService.getRoomServiceClient();
    await roomClient.mutePublishedTrack(roomName, identity, trackSid, muted);
    this.signalService.broadcast(sessionId, 'participant-muted', {
      userId: identity,
      trackSid,
      muted,
    });
  }

  async removeParticipant(sessionId: string, identity: string): Promise<void> {
    const roomName = await this.getLiveKitRoomName(sessionId);
    const roomClient = this.tokenService.getRoomServiceClient();
    await roomClient.removeParticipant(roomName, identity);
    this.signalService.broadcast(sessionId, 'participant-removed', { userId: identity });
  }

  broadcastRoleChanged(sessionId: string, participant: SessionParticipantRecord): void {
    this.signalService.broadcast(sessionId, 'role-changed', participant);
  }

  broadcastAudioApproval(sessionId: string, userId: string, approved: boolean): void {
    this.signalService.broadcast(sessionId, approved ? 'audio-approved' : 'audio-denied', { userId });
  }
}
