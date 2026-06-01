import { ConsoleLogger as NestLogger } from '@nestjs/common';

export class Logger extends NestLogger {
  log(message: string, context?: string) {
    super.log(this.formatCustomMessage(message), context);
  }

  error(message: string, trace?: string, context?: string) {
    super.error(this.formatCustomMessage(message), trace, context);
  }

  warn(message: string, context?: string) {
    super.warn(this.formatCustomMessage(message), context);
  }

  debug(message: string, context?: string) {
    super.debug(this.formatCustomMessage(message), context);
  }

  private formatCustomMessage(message: string): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
