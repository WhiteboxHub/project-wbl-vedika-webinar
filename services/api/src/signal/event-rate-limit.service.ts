import { Injectable } from '@nestjs/common';

/**
 * In-memory per-key rate limiter for high-frequency signal events.
 * Keys should include the event type and participant id.
 */
@Injectable()
export class EventRateLimitService {
  private readonly lastEvent = new Map<string, number>();

  /** Returns true when the action should be dropped (too soon after the last one). */
  isLimited(key: string, minIntervalMs: number): boolean {
    const last = this.lastEvent.get(key) ?? 0;
    if (Date.now() - last < minIntervalMs) return true;
    this.lastEvent.set(key, Date.now());
    return false;
  }
}
