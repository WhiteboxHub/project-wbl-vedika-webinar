import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { AttendanceEntity } from '../database/entities/attendance.entity';
import { SessionEntity } from '../database/entities/session.entity';
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
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
    private readonly invitesService: InvitesService,
    private readonly tokenService: TokenService,
  ) {}

  async requestJoin(inviteToken: string, userName: string): Promise<JoinTokenResponse> {
    const sessionDetails = await this.invitesService.resolveInvite(inviteToken);

    const email = `${userName.toLowerCase().replace(/\s+/g, '_')}@attendee.local`;
    let user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      user = this.userRepository.create({ email, name: userName, role: UserRole.ATTENDEE });
      await this.userRepository.save(user);
    }

    const attendance = this.attendanceRepository.create({
      sessionId: sessionDetails.sessionId,
      userId: user.id,
      joinedAt: new Date(),
    });
    await this.attendanceRepository.save(attendance);

    // Use REAL room name from database
    const roomName = await this.getRoomNameForSession(sessionDetails.sessionId);
    const livekitToken = await this.tokenService.generateAttendeeToken(roomName, user.id, userName);

    return {
      livekitToken,
      livekitUrl: '', // Client constructs URL via Vite proxy
      roomName,
      sessionId: sessionDetails.sessionId,
      sessionTitle: sessionDetails.title,
      scheduledAt: sessionDetails.scheduledAt,
      instructorName: sessionDetails.instructorName,
    };
  }

  async issueInstructorToken(
    sessionId: string,
    instructorId: string,
    instructorName: string,
  ): Promise<{ token: string; roomName: string }> {
    const roomName = await this.getRoomNameForSession(sessionId);
    const token = await this.tokenService.generateInstructorToken(roomName, instructorId, instructorName);
    return { token, roomName };
  }

  async registerForSession(sessionId: string, name: string, email: string): Promise<{ token: string; inviteUrl: string }> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    let user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      user = this.userRepository.create({ email, name, role: UserRole.ATTENDEE });
      await this.userRepository.save(user);
    }

    let attendance = await this.attendanceRepository.findOne({ where: { sessionId, userId: user.id } });
    if (!attendance) {
      attendance = this.attendanceRepository.create({ sessionId, userId: user.id });
      await this.attendanceRepository.save(attendance);
    }

    const token = await this.invitesService.createRegistrationToken(sessionId, name, email);
    return { token, inviteUrl: `webinar://join?token=${token}` };
  }

  private async getRoomNameForSession(sessionId: string): Promise<string> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    return session.liveKitRoomName;
  }
}
