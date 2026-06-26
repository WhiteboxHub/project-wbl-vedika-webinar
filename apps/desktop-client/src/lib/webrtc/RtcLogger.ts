import type { PeerState, RtcLogEvent } from '@webinar/shared';

type LogComponent = RtcLogEvent['component'];

export class RtcLogger {
  private readonly buffer: RtcLogEvent[] = [];
  private readonly maxBuffer = 200;

  constructor(
    private readonly component: LogComponent,
    private readonly roomId?: string,
    private readonly participantId?: string,
  ) {}

  private emit(level: RtcLogEvent['level'], event: string, meta?: Record<string, unknown>, state?: PeerState) {
    const entry: RtcLogEvent = {
      ts: new Date().toISOString(),
      level,
      component: this.component,
      event,
      roomId: this.roomId,
      participantId: this.participantId,
      state,
      meta,
    };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();

    const prefix = `[RTC:${this.component}]`;
    const detail = { event, roomId: this.roomId, participantId: this.participantId, state, ...meta };
    if (level === 'error') console.error(prefix, detail);
    else if (level === 'warn') console.warn(prefix, detail);
    else if (level === 'debug') console.debug(prefix, detail);
    else console.info(prefix, detail);
  }

  debug(event: string, meta?: Record<string, unknown>, state?: PeerState) { this.emit('debug', event, meta, state); }
  info(event: string, meta?: Record<string, unknown>, state?: PeerState) { this.emit('info', event, meta, state); }
  warn(event: string, meta?: Record<string, unknown>, state?: PeerState) { this.emit('warn', event, meta, state); }
  error(event: string, meta?: Record<string, unknown>, state?: PeerState) { this.emit('error', event, meta, state); }

  getEvents(): RtcLogEvent[] { return [...this.buffer]; }
  flush(): RtcLogEvent[] {
    const copy = this.getEvents();
    this.buffer.length = 0;
    return copy;
  }
}
