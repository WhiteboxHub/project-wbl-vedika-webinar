import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserEntity } from '../database/entities/user.entity';
import { AttendanceEntity } from '../database/entities/attendance.entity';
import { SessionEntity } from '../database/entities/session.entity';
import { InvitesService } from '../invites/invites.service';
import { TokenService } from '../livekit/token.service';
import { UserRole } from '@webinar/shared';

export interface JoinTokenResponse {
  livekitToken: string;
  signalToken: string;
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
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    // Signal token — uses the app JWT_SECRET so the signal gateway can validate it.
    // This is intentionally different from livekitToken (signed with LIVEKIT_API_SECRET).
    const signalToken = this.issueSignalToken(user.id, email, 'attendee', roomName);

    return {
      livekitToken,
      signalToken,
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
  ): Promise<{ token: string; signalToken: string; roomName: string }> {
    const roomName = await this.getRoomNameForSession(sessionId);
    const token = await this.tokenService.generateInstructorToken(roomName, instructorId, instructorName);

    // Signal token for the host — role 'host' allows creating polls, closing Q&A, etc.
    const email = `${instructorName.toLowerCase().replace(/\s+/g, '_')}@instructor.local`;
    const signalToken = this.issueSignalToken(instructorId, email, 'host', roomName);

    return { token, signalToken, roomName };
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
    const publicAppUrl = this.configService.get<string>('PUBLIC_APP_URL', '');
    const inviteUrl = publicAppUrl
      ? `${publicAppUrl}/waiting/${token}`
      : `webinar://join?token=${token}`;
    return { token, inviteUrl };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Issues an app JWT for the signal gateway.
   * The gateway calls jwtService.verify() with JWT_SECRET — this token passes.
   * The LiveKit token (signed with LIVEKIT_API_SECRET) does NOT pass, which is
   * why chat/polls/Q&A were broken before this fix.
   */
  private issueSignalToken(userId: string, email: string, role: string, roomId: string): string {
    const jwtSecret = this.configService.get<string>('JWT_SECRET', 'dev-secret-change-me');
    return this.jwtService.sign(
      { sub: userId, email, role, roomId },
      { secret: jwtSecret, expiresIn: '6h' },
    );
  }

  private async getRoomNameForSession(sessionId: string): Promise<string> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    return session.liveKitRoomName;
  }
}
