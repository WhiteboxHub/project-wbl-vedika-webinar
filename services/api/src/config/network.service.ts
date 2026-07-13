import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';

/**
 * Auto-detects the machine's LAN IP address so the webinar platform
 * can be accessed from other devices on the same network.
 */
@Injectable()
export class NetworkService implements OnModuleInit {
  private readonly logger = new Logger(NetworkService.name);
  private readonly lanIp: string;
  private readonly baseUrl: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.lanIp = this.detectLanIp();

    const explicitBaseUrl = this.configService.get<string>('BASE_URL');
    const appPort = 5173;
    const apiPort = this.configService.get<number>('API_PORT', 3000);

    this.baseUrl = explicitBaseUrl || `http://${this.lanIp}:${appPort}`;
    this.apiUrl = `http://${this.lanIp}:${apiPort}`;
  }

  onModuleInit(): void {
    this.logger.log(`LAN IP detected: ${this.lanIp}`);
    this.logger.log(`Base URL: ${this.baseUrl}`);
    this.logger.log(`API  URL: ${this.apiUrl}`);
  }

  /**
   * Returns the base URL for the frontend app (e.g. `http://192.168.1.42:5173`).
   * If `BASE_URL` is set in the environment, that value is used instead.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Returns the detected LAN IP address (e.g. `192.168.1.42`).
   */
  getLanIp(): string {
    return this.lanIp;
  }

  /**
   * Returns the API URL (e.g. `http://192.168.1.42:3000`).
   */
  getApiUrl(): string {
    return this.apiUrl;
  }

  /**
   * Detects the first non-internal IPv4 address from the machine's
   * network interfaces. Falls back to `localhost` if none is found.
   */
  private detectLanIp(): string {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      const addrs = interfaces[name];
      if (!addrs) continue;

      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          return addr.address;
        }
      }
    }

    this.logger.warn('No LAN IP detected; falling back to localhost');
    return 'localhost';
  }
}
