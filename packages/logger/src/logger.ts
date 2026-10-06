export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
}

const LOG_LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.prefix = options.prefix ?? '';
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  private shouldLog(targetLevel: LogLevel): boolean {
    return LOG_LEVEL_WEIGHTS[targetLevel] >= LOG_LEVEL_WEIGHTS[this.level];
  }

  private format(level: LogLevel, message: string): string {
    const tag = level.toUpperCase().padEnd(5, ' ');
    const prefixStr = this.prefix ? `[${this.prefix}] ` : '';
    return `${tag} ${prefixStr}${message}`;
  }

  public debug(message: string): void {
    if (this.shouldLog('debug')) {
      // eslint-disable-next-line no-console
      console.warn(this.format('debug', message));
    }
  }

  public info(message: string): void {
    if (this.shouldLog('info')) {
      // eslint-disable-next-line no-console
      console.warn(this.format('info', message));
    }
  }

  public warn(message: string): void {
    if (this.shouldLog('warn')) {
      // eslint-disable-next-line no-console
      console.warn(this.format('warn', message));
    }
  }

  public error(message: string): void {
    if (this.shouldLog('error')) {
      // eslint-disable-next-line no-console
      console.error(this.format('error', message));
    }
  }

  public child(prefix: string): Logger {
    const combinedPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger({
      level: this.level,
      prefix: combinedPrefix,
    });
  }
}

export const defaultLogger = new Logger();
