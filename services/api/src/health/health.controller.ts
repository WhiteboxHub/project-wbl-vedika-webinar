import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthCheck } from '@webinar/shared';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthCheck> {
    return this.healthService.check();
  }
}
