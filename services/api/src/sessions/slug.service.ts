import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEntity } from '../database/entities/session.entity';

/**
 * Generates unique, short, human-readable slugs for webinar sessions.
 * Format: `{adjective}-{noun}-{4digits}` — always ≤20 chars.
 */
@Injectable()
export class SlugService {
  private readonly logger = new Logger(SlugService.name);

  private static readonly ADJECTIVES: string[] = [
    'bold', 'calm', 'cool', 'dark', 'deep',
    'fast', 'fine', 'free', 'full', 'gold',
    'good', 'gray', 'keen', 'kind', 'late',
    'lean', 'live', 'long', 'loud', 'main',
    'neat', 'next', 'nice', 'open', 'pale',
    'pure', 'rare', 'real', 'rich', 'safe',
    'slim', 'soft', 'sure', 'tall', 'thin',
    'tiny', 'true', 'vast', 'warm', 'wide',
    'wild', 'wise', 'blue', 'fair', 'firm',
    'flat', 'glad', 'hard', 'high', 'just',
    'pink', 'red', 'star', 'epic', 'nova',
  ];

  private static readonly NOUNS: string[] = [
    'apex', 'arch', 'base', 'beam', 'bolt',
    'cape', 'clip', 'code', 'core', 'cove',
    'cube', 'dawn', 'desk', 'dome', 'door',
    'drop', 'edge', 'fern', 'fire', 'flow',
    'flux', 'fork', 'gate', 'glow', 'grid',
    'hive', 'hub', 'isle', 'jade', 'jump',
    'knot', 'lake', 'lane', 'leaf', 'lens',
    'link', 'loop', 'mast', 'mesa', 'mint',
    'moon', 'nest', 'node', 'opal', 'orb',
    'palm', 'peak', 'pine', 'pond', 'port',
    'rail', 'reef', 'ring', 'root', 'sage',
  ];

  private static readonly MAX_SLUG_LENGTH = 20;
  private static readonly MAX_RETRIES = 10;

  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
  ) {}

  /**
   * Generates a unique slug in the format `{adjective}-{noun}-{4digits}`.
   * Checks the database for collisions and retries up to 10 times.
   */
  async generateUniqueSlug(): Promise<string> {
    for (let attempt = 1; attempt <= SlugService.MAX_RETRIES; attempt++) {
      const slug = this.buildRandomSlug();

      const existing = await this.sessionRepository.findOne({
        where: { liveKitRoomName: slug },
      });

      if (!existing) {
        this.logger.debug(`Generated unique slug "${slug}" on attempt ${attempt}`);
        return slug;
      }

      this.logger.warn(
        `Slug collision "${slug}" on attempt ${attempt}/${SlugService.MAX_RETRIES}`,
      );
    }

    // Extremely unlikely but handle it: append timestamp fragment
    const fallback = this.buildRandomSlug().slice(0, 14) + Date.now().toString(36).slice(-5);
    this.logger.warn(`All ${SlugService.MAX_RETRIES} slug attempts collided; using fallback "${fallback}"`);
    return fallback;
  }

  /**
   * Creates a slug derived from a session title.
   * Converts to kebab-case, truncates, and appends a random numeric suffix.
   */
  generateSlugFromTitle(title: string): string {
    const kebab = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const suffix = this.randomDigits(4);
    const maxBaseLength = SlugService.MAX_SLUG_LENGTH - suffix.length - 1; // -1 for the hyphen

    const truncated = kebab.slice(0, maxBaseLength).replace(/-$/, '');

    return `${truncated}-${suffix}`;
  }

  /**
   * Builds a random slug: `{adjective}-{noun}-{4digits}`.
   */
  private buildRandomSlug(): string {
    const adj = this.pickRandom(SlugService.ADJECTIVES);
    const noun = this.pickRandom(SlugService.NOUNS);
    const digits = this.randomDigits(4);

    const slug = `${adj}-${noun}-${digits}`;

    // Guarantee ≤ 20 chars (all our words are ≤ 4 chars so this is inherently safe,
    // but we enforce the contract defensively)
    if (slug.length > SlugService.MAX_SLUG_LENGTH) {
      return slug.slice(0, SlugService.MAX_SLUG_LENGTH);
    }

    return slug;
  }

  private pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private randomDigits(count: number): string {
    const min = Math.pow(10, count - 1);
    const max = Math.pow(10, count) - 1;
    return String(Math.floor(Math.random() * (max - min + 1)) + min);
  }
}
