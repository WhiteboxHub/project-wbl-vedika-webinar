import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SessionRole,
  canModerateSession,
  defaultCapabilities,
  normalizeSessionRole,
  type SessionParticipantRecord,
} from '@webinar/shared';
import { SessionParticipantEntity } from '../database/entities/session-participant.entity';
import { SessionEntity } from '../database/entities/session.entity';

@Injectable()
export class ParticipantsService {
  constructor(
    @InjectRepository(SessionParticipantEntity)
    private readonly repo: Repository<SessionParticipantEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
  ) {}

  async upsertParticipant(
    sessionId: string,
    userId: string,
    displayName: string,
    role: SessionRole,
  ): Promise<SessionParticipantEntity> {
    const caps = defaultCapabilities(role);
    let row = await this.repo.findOne({ where: { sessionId, userId } });
    if (row) {
      row.displayName = displayName;
      row.role = role;
      row.canPublishAudio = caps.canPublishAudio;
      row.canPublishVideo = caps.canPublishVideo;
      row.canShareScreen = caps.canShareScreen;
      row.joinedAt = row.joinedAt ?? new Date();
      row.leftAt = null;
    } else {
      row = this.repo.create({
        sessionId,
        userId,
        displayName,
        role,
        ...caps,
        joinedAt: new Date(),
      });
    }
    return this.repo.save(row);
  }

  async getParticipant(sessionId: string, userId: string): Promise<SessionParticipantEntity | null> {
    return this.repo.findOne({ where: { sessionId, userId } });
  }

  async getParticipants(sessionId: string): Promise<SessionParticipantRecord[]> {
    const rows = await this.repo.find({
      where: { sessionId },
      order: { joinedAt: 'ASC' },
    });
    return rows.map((r) => this.toRecord(r));
  }

  async assertCanModerate(sessionId: string, actorUserId: string): Promise<SessionParticipantEntity> {
    const actor = await this.repo.findOne({ where: { sessionId, userId: actorUserId } });
    if (!actor || !canModerateSession(normalizeSessionRole(actor.role))) {
      throw new ForbiddenException('Organizer or co-organizer role required');
    }
    return actor;
  }

  async promoteRole(
    sessionId: string,
    actorUserId: string,
    targetUserId: string,
    newRole: SessionRole,
  ): Promise<SessionParticipantRecord> {
    await this.assertCanModerate(sessionId, actorUserId);

    const target = await this.repo.findOne({ where: { sessionId, userId: targetUserId } });
    if (!target) throw new NotFoundException('Participant not found in session');

    if (newRole === SessionRole.ORGANIZER) {
      throw new BadRequestException('Cannot promote to organizer via API');
    }

    const caps = defaultCapabilities(newRole);
    target.role = newRole;
    target.canPublishAudio = caps.canPublishAudio;
    target.canPublishVideo = caps.canPublishVideo;
    target.canShareScreen = caps.canShareScreen;
    const saved = await this.repo.save(target);
    return this.toRecord(saved);
  }

  async setAudioApproved(sessionId: string, userId: string, approved: boolean): Promise<SessionParticipantRecord> {
    const row = await this.repo.findOne({ where: { sessionId, userId } });
    if (!row) throw new NotFoundException('Participant not found');
    row.canPublishAudio = approved;
    const saved = await this.repo.save(row);
    return this.toRecord(saved);
  }

  async markLeft(sessionId: string, userId: string): Promise<void> {
    const row = await this.repo.findOne({ where: { sessionId, userId } });
    if (row) {
      row.leftAt = new Date();
      await this.repo.save(row);
    }
  }

  private toRecord(r: SessionParticipantEntity): SessionParticipantRecord {
    return {
      id: r.id,
      sessionId: r.sessionId,
      userId: r.userId,
      displayName: r.displayName,
      role: normalizeSessionRole(r.role),
      canPublishAudio: r.canPublishAudio,
      canPublishVideo: r.canPublishVideo,
      canShareScreen: r.canShareScreen,
      joinedAt: r.joinedAt ?? undefined,
      leftAt: r.leftAt ?? undefined,
    };
  }
}
