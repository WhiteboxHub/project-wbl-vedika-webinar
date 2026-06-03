import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEntity } from '../database/entities/session.entity';
import { CreateInviteResponse, ResolveInviteResponse, SessionStatus } from '@webinar/shared';

interface InviteTokenPayload {
  sessionId: string;
  type: 'invite' | 'registration';
  createdAt: number;
  registeredName?: string;
  registeredEmail?: string;
}

@Injectable()
export class InvitesService {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async createInvite(
    sessionId: string,
    expiresInHours: number = 24,
  ): Promise<CreateInviteResponse> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    if (session.status === SessionStatus.CANCELLED) {
      throw new UnauthorizedException('Cannot create invite for cancelled session');
    }

    const payload: InviteTokenPayload = {
      sessionId,
      type: 'invite',
      createdAt: Date.now(),
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: `${expiresInHours}h`,
    });

    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const inviteUrl = `webinar://join?token=${token}`;

    return {
      id: sessionId,
      token,
      expiresAt,
      inviteUrl,
    };
  }

  async createRegistrationToken(
    sessionId: string,
    name: string,
    email: string,
  ): Promise<string> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const payload: InviteTokenPayload = {
      sessionId,
      type: 'registration',
      createdAt: Date.now(),
      registeredName: name,
      registeredEmail: email,
    };

    return this.jwtService.sign(payload, { expiresIn: '7d' });
  }

  async resolveInvite(token: string): Promise<ResolveInviteResponse> {
    let payload: InviteTokenPayload;

    try {
      payload = this.jwtService.verify<InviteTokenPayload>(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired invite token');
    }

    if (payload.type !== 'invite' && payload.type !== 'registration') {
      throw new UnauthorizedException('Invalid token type');
    }

    const session = await this.sessionRepository.findOne({
      where: { id: payload.sessionId },
      relations: ['instructor'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status === SessionStatus.CANCELLED) {
      throw new UnauthorizedException('This session has been cancelled');
    }

    return {
      sessionId: session.id,
      title: session.title,
      description: session.description,
      scheduledAt: session.scheduledAt,
      status: session.status,
      instructorName: session.instructor.name,
      maxAttendees: session.maxAttendees,
      registeredName: payload.registeredName,
      registeredEmail: payload.registeredEmail,
    };
  }
}

