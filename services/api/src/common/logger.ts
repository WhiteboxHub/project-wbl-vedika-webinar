import { Logger as NestLogger } from '@nestjs/common';

export class Logger extends NestLogger {
  log(message: string, context?: string) {
    super.log(this.formatMessage(message), context);
  }

  error(message: string, trace?: string, context?: string) {
    super.error(this.formatMessage(message), trace, context);
  }

  warn(message: string, context?: string) {
    super.warn(this.formatMessage(message), context);
  }

  debug(message: string, context?: string) {
    super.debug(this.formatMessage(message), context);
  }

  private formatMessage(message: string): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
