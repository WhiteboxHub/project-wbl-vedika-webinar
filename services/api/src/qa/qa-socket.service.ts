import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { QAService } from '../signal/qa.service';
import { ConfigService } from '@nestjs/config';
import { canModerateSession, normalizeSessionRole } from '@webinar/shared';

interface QaJoinPayload {
  sessionId: string;
  signalToken: string;
}

@Injectable()
export class QaSocketService implements OnApplicationBootstrap {
  private readonly logger = new Logger(QaSocketService.name);
  private io: Server | null = null;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly qaService: QAService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const httpServer = this.adapterHost.httpAdapter.getHttpServer();
    this.io = new Server(httpServer, {
      cors: { origin: true, credentials: true },
      path: '/socket.io',
    });

    const qaNs = this.io.of('/qa');
    const secret = this.config.get<string>('JWT_SECRET', 'dev-secret-change-me');

    qaNs.use((socket, next) => {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Unauthorized'));
      try {
        const payload = this.jwtService.verify(token, { secret }) as {
          sub: string;
          roomId: string;
          role: string;
          displayName?: string;
        };
        socket.data.participantId = payload.sub;
        socket.data.sessionId = payload.roomId;
        socket.data.role = payload.role;
        socket.data.displayName = payload.displayName ?? 'User';
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });

    qaNs.on('connection', (socket) => {
      const sessionId = socket.data.sessionId as string;
      const participantId = socket.data.participantId as string;
      const userName = socket.data.displayName as string;
      const role = normalizeSessionRole(socket.data.role as string);

      socket.join(sessionId);
      this.logger.debug(`QA connected: ${participantId} session=${sessionId}`);

      socket.on('submit-question', async (payload: { text: string }, ack?: (r: unknown) => void) => {
        const q = await this.qaService.submit(sessionId, participantId, userName, payload.text?.trim() ?? '');
        qaNs.to(sessionId).fetchSockets().then((sockets) => {
          for (const s of sockets) {
            const r = normalizeSessionRole(s.data.role as string);
            if (canModerateSession(r)) {
              s.emit('question-pending', q);
            }
          }
        });
        ack?.({ id: q.id, status: q.status });
      });

      socket.on('approve-question', async (payload: { questionId: string }) => {
        if (!canModerateSession(role)) return;
        const q = await this.qaService.approve(payload.questionId);
        qaNs.to(sessionId).emit('question-approved', q);
      });

      socket.on('reject-question', async (payload: { questionId: string }) => {
        if (!canModerateSession(role)) return;
        const q = await this.qaService.reject(payload.questionId);
        qaNs.to(sessionId).emit('question-rejected', { id: q.id });
      });

      socket.on('answer-question', async (payload: { questionId: string; answer: string }) => {
        if (role !== normalizeSessionRole('presenter') && !canModerateSession(role)) return;
        const q = await this.qaService.answer(payload.questionId, payload.answer);
        qaNs.to(sessionId).emit('question-answered', q);
      });

      socket.on('upvote-question', async (payload: { questionId: string }) => {
        const q = await this.qaService.upvote(payload.questionId, participantId);
        qaNs.to(sessionId).emit('question-upvoted', { id: q.id, upvotes: q.upvotes });
      });

      socket.on('disconnect', () => {
        this.logger.debug(`QA disconnected: ${participantId}`);
      });
    });

    this.logger.log('Socket.IO Q&A namespace ready at /qa');
  }

  getNamespace() {
    return this.io?.of('/qa') ?? null;
  }
}
