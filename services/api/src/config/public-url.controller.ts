import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';

function detectLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

/**
 * GET /config
 *
 * Returns the server-side PUBLIC_APP_URL so the frontend can build
 * shareable links without needing a manual tunnel-URL input or a
 * build-time VITE env variable.
 *
 * Priority:
 *   1. PUBLIC_APP_URL env var  (set to your tunnel / domain)
 *   2. BASE_URL env var        (legacy alias)
 *   3. Auto-detected LAN IP    (fallback for local dev)
 */
@Controller('config')
export class PublicUrlController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getConfig(): { publicUrl: string; isLocalhost: boolean } {
    const explicit =
      this.configService.get<string>('PUBLIC_APP_URL') ||
      this.configService.get<string>('BASE_URL');

    const lanIp = detectLanIp();
    const publicUrl = explicit?.replace(/\/$/, '') ?? `http://${lanIp}:5173`;
    const isLocalhost =
      publicUrl.includes('localhost') || publicUrl.includes('127.0.0.1');

    return { publicUrl, isLocalhost };
  }
}
