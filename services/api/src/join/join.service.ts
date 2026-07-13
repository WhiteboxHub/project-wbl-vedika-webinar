import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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
import { UserRole, SessionRole, type JoinGrant, toSignalRole } from '@webinar/shared';
import { IceService } from './ice.service';
import { ParticipantsService } from '../participants/participants.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class JoinService {
  private readonly logger = new Logger(JoinService.name);

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
    private readonly participantsService: ParticipantsService,
    private readonly emailService: EmailService,
  ) {}

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
      SessionRole.ATTENDEE,
    );

    await this.participantsService.upsertParticipant(
      sessionDetails.sessionId,
      user.id,
      userName,
      SessionRole.ATTENDEE,
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
      SessionRole.ORGANIZER,
    );

    await this.participantsService.upsertParticipant(
      sessionId,
      instructorId,
      instructorName,
      SessionRole.ORGANIZER,
    );

    return {
      token: grant.livekitToken ?? '',
      signalToken: grant.signalToken,
      roomName: roomId,
      grant,
    };
  }

  async registerForSession(sessionId: string, name: string, email: string): Promise<{ token: string; inviteUrl: string }> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId }, relations: ['instructor'] });
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

    let inviteUrl: string;
    if (session.slug) {
      const base = publicAppUrl || 'http://localhost:5173';
      inviteUrl = `${base}/w/${session.slug}`;
    } else if (publicAppUrl) {
      inviteUrl = `${publicAppUrl}/waiting/${token}`;
    } else {
      inviteUrl = `webinar://join?token=${token}`;
    }

    try {
      await this.emailService.sendRegistrationConfirmation(
        sessionId,
        user.id,
        email,
        {
          attendeeName: name,
          sessionTitle: session.title,
          scheduledAt: session.scheduledAt,
          instructorName: session.instructor?.name,
          joinUrl: inviteUrl,
        },
      );
    } catch (emailErr) {
      // Email delivery failure must NOT block registration — log and continue.
      this.logger.warn(`Registration confirmation email failed for ${email}: ${(emailErr as Error).message}`);
    }

    return { token, inviteUrl };
  }

  getIceServersForParticipant(participantId: string) {
    return this.iceService.getIceServers(participantId);
  }

  getDiagnosticIceServers() {
    return this.iceService.getIceServers(this.iceService.createDiagnosticParticipantId());
  }

  // ─── Slug-based join flow ────────────────────────────────────────────────────

  async resolveBySlug(slug: string): Promise<{
    sessionId: string;
    slug: string;
    title: string;
    description?: string;
    scheduledAt: Date;
    scheduledStartAt?: Date;
    scheduledEndAt?: Date;
    status: string;
    instructorName: string;
    maxAttendees: number;
  }> {
    const session = await this.sessionRepository.findOne({
      where: { slug },
      relations: ['instructor'],
    });
    if (!session) throw new NotFoundException(`Webinar "${slug}" not found`);

    return {
      sessionId: session.id,
      slug: session.slug!,
      title: session.title,
      description: session.description,
      scheduledAt: session.scheduledAt,
      scheduledStartAt: session.scheduledStartAt,
      scheduledEndAt: session.scheduledEndAt,
      status: session.status,
      instructorName: session.instructor?.name ?? 'Instructor',
      maxAttendees: session.maxAttendees,
    };
  }

  async joinBySlug(
    slug: string,
    userName: string,
    email?: string,
  ): Promise<JoinGrant & { roomName: string; sessionTitle: string; instructorName: string }> {
    const session = await this.sessionRepository.findOne({
      where: { slug },
      relations: ['instructor'],
    });
    if (!session) throw new NotFoundException(`Webinar "${slug}" not found`);

    if (!email) {
      throw new BadRequestException('Email address is required to join this webinar.');
    }

    const userEmail = email.trim().toLowerCase();
    const user = await this.userRepository.findOne({ where: { email: userEmail } });

    if (!user) {
      throw new BadRequestException('You must register for the webinar before joining.');
    }

    if (!user.emailVerified) {
      // In dev (no SMTP configured), skip email verification so attendees can join immediately.
      // In production with SMTP, the gate is enforced.
      const smtpConfigured = Boolean(this.configService.get<string>('SMTP_HOST', ''));
      if (!smtpConfigured) {
        user.emailVerified = true;
        await this.userRepository.save(user);
        this.logger.warn(`[DEV] Auto-verified ${user.email} — set SMTP_HOST to enforce email verification in production.`);
      } else {
        // Re-trigger verification email if they attempt to join unverified
        await this.emailService.sendVerificationEmail(user.id, userEmail, slug);
        throw new BadRequestException('EMAIL_VERIFICATION_REQUIRED: Please verify your email first. We have sent a verification link to your inbox.');
      }
    }

    const attendance = this.attendanceRepository.create({
      sessionId: session.id,
      userId: user.id,
      joinedAt: new Date(),
    });
    await this.attendanceRepository.save(attendance);

    const roomId = session.id;
    const grant = await this.buildJoinGrant(
      user.id,
      userName,
      roomId,
      session.id,
      SessionRole.ATTENDEE,
    );

    await this.participantsService.upsertParticipant(
      session.id,
      user.id,
      userName,
      SessionRole.ATTENDEE,
    );

    return {
      ...grant,
      roomName: roomId,
      sessionTitle: session.title,
      instructorName: session.instructor?.name ?? 'Instructor',
    };
  }

  async registerBySlug(
    slug: string,
    name: string,
    email?: string,
  ): Promise<{ registered: boolean; verified: boolean; slug: string }> {
    const session = await this.sessionRepository.findOne({
      where: { slug },
      relations: ['instructor'],
    });
    if (!session) throw new NotFoundException(`Webinar "${slug}" not found`);

    if (!email) {
      throw new BadRequestException('Email address is required for registration.');
    }

    const userEmail = email.trim().toLowerCase();

    // Check placeholder / blocklist domains
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!EMAIL_RE.test(userEmail)) {
      throw new BadRequestException('Please enter a valid email address.');
    }

    const domain = userEmail.split('@')[1];
    const blockedDomains = ['attendee.local', 'localhost', 'example.com', 'test.com'];
    if (blockedDomains.includes(domain)) {
      throw new BadRequestException('Registration using placeholder email domains is not allowed. Please use your real email address.');
    }

    let user = await this.userRepository.findOne({ where: { email: userEmail } });
    if (!user) {
      user = this.userRepository.create({
        email: userEmail,
        name: name.trim(),
        role: UserRole.ATTENDEE,
        emailVerified: false,
      });
      await this.userRepository.save(user);
    }

    let attendance = await this.attendanceRepository.findOne({ where: { sessionId: session.id, userId: user.id } });
    if (!attendance) {
      attendance = this.attendanceRepository.create({ sessionId: session.id, userId: user.id });
      await this.attendanceRepository.save(attendance);
    }

    // Always send/resend verification email if the user is not yet verified
    if (!user.emailVerified) {
      const smtpConfigured = Boolean(this.configService.get<string>('SMTP_HOST', ''));
      if (!smtpConfigured) {
        // Dev mode: auto-verify so the attendee doesn't get stuck in an uncompletable flow.
        user.emailVerified = true;
        await this.userRepository.save(user);
        this.logger.warn(`[DEV] Auto-verified ${userEmail} on registration — set SMTP_HOST to enforce email verification.`);
      } else {
        try {
          await this.emailService.sendVerificationEmail(user.id, userEmail, slug);
        } catch (emailErr) {
          this.logger.warn(`Verification email failed for ${userEmail}: ${(emailErr as Error).message}`);
        }
      }
    } else {
      // If already verified, send the registration confirmation
      try {
        const publicAppUrl = this.configService.get<string>('PUBLIC_APP_URL', '');
        const joinUrl = publicAppUrl
          ? `${publicAppUrl}/w/${slug}`
          : `http://localhost:5173/w/${slug}`;

        await this.emailService.sendRegistrationConfirmation(
          session.id,
          user.id,
          userEmail,
          {
            attendeeName: name,
            sessionTitle: session.title,
            scheduledAt: session.scheduledAt,
            instructorName: session.instructor?.name,
            joinUrl,
          },
        );
      } catch (emailErr) {
        this.logger.warn(`Registration confirmation email failed for ${userEmail}: ${(emailErr as Error).message}`);
      }
    }

    return { registered: true, verified: user.emailVerified, slug };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async buildJoinGrant(
    participantId: string,
    displayName: string,
    roomId: string,
    sessionId: string,
    role: SessionRole,
  ): Promise<JoinGrant> {
    const { iceServers } = this.iceService.getIceServers(participantId);
    const signalToken = this.issueSignalToken(participantId, displayName, role, roomId);

    let livekitToken: string | undefined;
    if (role === SessionRole.ORGANIZER || role === SessionRole.CO_ORGANIZER || role === SessionRole.PRESENTER) {
      livekitToken = await this.tokenService.generateInstructorToken(roomId, participantId, displayName);
    } else {
      livekitToken = await this.tokenService.generateAttendeeToken(roomId, participantId, displayName);
    }

    // GAP-01 fix: resolve the LiveKit WebSocket URL from env so attendees on any
    // machine get the correct SFU address, not an empty string.
    const livekitUrl = this.configService.get<string>('LIVEKIT_URL', 'ws://localhost:7880');

    return {
      participantId,
      roomId,
      sessionId,
      role,
      displayName,
      signalToken,
      iceServers,
      livekitToken,
      livekitUrl,
    };
  }

  private issueSignalToken(
    participantId: string,
    displayName: string,
    role: SessionRole,
    roomId: string,
  ): string {
    const jwtSecret = this.configService.get<string>('JWT_SECRET', 'dev-secret-change-me');
    const jti = randomUUID();
    return this.jwtService.sign(
      { sub: participantId, roomId, role: toSignalRole(role), jti, displayName },
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
