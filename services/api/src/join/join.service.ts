import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { UserEntity } from '../database/entities/user.entity';
import { AttendanceEntity } from '../database/entities/attendance.entity';
import { SessionEntity } from '../database/entities/session.entity';
import { InvitesService } from '../invites/invites.service';
import { TokenService } from '../livekit/token.service';
import { UserRole, ParticipantRole, type JoinGrant } from '@webinar/shared';
import { IceService } from './ice.service';

@Injectable()
export class JoinService {
  private readonly useNativeWebRtc: boolean;

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
    private readonly iceService: IceService,
  ) {
    this.useNativeWebRtc = this.configService.get<string>('USE_NATIVE_WEBRTC', 'false') === 'true';
  }

  async requestJoin(inviteToken: string, userName: string): Promise<JoinGrant & { roomName: string; sessionTitle: string; instructorName: string }> {
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

    const roomId = await this.getRoomIdForSession(sessionDetails.sessionId);
    const grant = await this.buildJoinGrant(
      user.id,
      userName,
      roomId,
      sessionDetails.sessionId,
      ParticipantRole.ATTENDEE,
    );

    return {
      ...grant,
      roomName: roomId,
      sessionTitle: sessionDetails.title,
      instructorName: sessionDetails.instructorName,
    };
  }

  async issueInstructorToken(
    sessionId: string,
    instructorId: string,
    instructorName: string,
  ): Promise<{ token: string; signalToken: string; roomName: string; grant: JoinGrant }> {
    const roomId = await this.getRoomIdForSession(sessionId);
    const grant = await this.buildJoinGrant(
      instructorId,
      instructorName,
      roomId,
      sessionId,
      ParticipantRole.HOST,
    );

    return {
      token: grant.livekitToken ?? '',
      signalToken: grant.signalToken,
      roomName: roomId,
      grant,
    };
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

  getIceServersForParticipant(participantId: string) {
    return this.iceService.getIceServers(participantId);
  }

  getDiagnosticIceServers() {
    return this.iceService.getIceServers(this.iceService.createDiagnosticParticipantId());
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async buildJoinGrant(
    participantId: string,
    displayName: string,
    roomId: string,
    sessionId: string,
    role: ParticipantRole,
  ): Promise<JoinGrant> {
    const { iceServers } = this.iceService.getIceServers(participantId);
    const signalToken = this.issueSignalToken(participantId, displayName, role, roomId);

    let livekitToken: string | undefined;
    if (!this.useNativeWebRtc) {
      if (role === ParticipantRole.HOST) {
        livekitToken = await this.tokenService.generateInstructorToken(roomId, participantId, displayName);
      } else {
        livekitToken = await this.tokenService.generateAttendeeToken(roomId, participantId, displayName);
      }
    }

    return {
      participantId,
      roomId,
      sessionId,
      role,
      displayName,
      signalToken,
      iceServers,
      livekitToken,
      livekitUrl: '',
    };
  }

  private issueSignalToken(
    participantId: string,
    displayName: string,
    role: ParticipantRole,
    roomId: string,
  ): string {
    const jwtSecret = this.configService.get<string>('JWT_SECRET', 'dev-secret-change-me');
    const jti = randomUUID();
    return this.jwtService.sign(
      { sub: participantId, roomId, role, jti, displayName },
      { secret: jwtSecret, expiresIn: '6h' },
    );
  }

  /** roomId === sessionId (unified across API, signal, client) */
  private async getRoomIdForSession(sessionId: string): Promise<string> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    return session.id;
  }
}
