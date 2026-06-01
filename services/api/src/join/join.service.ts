import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { AttendanceEntity } from '../database/entities/attendance.entity';
import { InvitesService } from '../invites/invites.service';
import { TokenService } from '../livekit/token.service';
import { UserRole } from '@webinar/shared';

export interface JoinTokenResponse {
  livekitToken: string;
  livekitUrl: string;
  roomName: string;
  sessionId: string;
  sessionTitle: string;
  scheduledAt: Date;
  instructorName: string;
}

@Injectable()
export class JoinService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(AttendanceEntity)
    private readonly attendanceRepository: Repository<AttendanceEntity>,
    private readonly invitesService: InvitesService,
    private readonly tokenService: TokenService,
  ) {}

  async requestJoin(inviteToken: string, userName: string): Promise<JoinTokenResponse> {
    // Resolve invite to get session details
    const sessionDetails = await this.invitesService.resolveInvite(inviteToken);

    // Find or create ephemeral user
    const email = `${userName.toLowerCase().replace(/\s+/g, '_')}@attendee.local`;
    let user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      user = this.userRepository.create({
        email,
        name: userName,
        role: UserRole.ATTENDEE,
      });
      await this.userRepository.save(user);
    }

    // Record attendance
    const attendance = this.attendanceRepository.create({
      sessionId: sessionDetails.sessionId,
      userId: user.id,
      joinedAt: new Date(),
    });
    await this.attendanceRepository.save(attendance);

    // Generate LiveKit token for attendee
    const roomName = await this.getRoomNameForSession(sessionDetails.sessionId);
    const livekitToken = await this.tokenService.generateAttendeeToken(
      roomName,
      user.id,
      userName,
    );

    return {
      livekitToken,
      livekitUrl: process.env.LIVEKIT_URL || '',
      roomName,
      sessionId: sessionDetails.sessionId,
      sessionTitle: sessionDetails.title,
      scheduledAt: sessionDetails.scheduledAt,
      instructorName: sessionDetails.instructorName,
    };
  }

  async issueInstructorToken(sessionId: string, instructorId: string, instructorName: string): Promise<string> {
    const roomName = await this.getRoomNameForSession(sessionId);
    return await this.tokenService.generateInstructorToken(roomName, instructorId, instructorName);
  }

  private async getRoomNameForSession(sessionId: string): Promise<string> {
    // In a real implementation, fetch this from session entity
    // For now, return a generated room name
    return `session_${sessionId}`;
  }
}
