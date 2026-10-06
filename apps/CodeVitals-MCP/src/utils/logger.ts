export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel) {
    this.level = level;
  }

  debug(message: string, context?: Record<string, unknown>) {
    if (this.level <= LogLevel.DEBUG) {
      console.error(JSON.stringify({ level: "DEBUG", message, ...context, timestamp: new Date().toISOString() }));
    }
  }

  info(message: string, context?: Record<string, unknown>) {
    if (this.level <= LogLevel.INFO) {
      console.error(JSON.stringify({ level: "INFO", message, ...context, timestamp: new Date().toISOString() }));
    }
  }

  warn(message: string, context?: Record<string, unknown>) {
    if (this.level <= LogLevel.WARN) {
      console.error(JSON.stringify({ level: "WARN", message, ...context, timestamp: new Date().toISOString() }));
    }
  }

  error(message: string, context?: Record<string, unknown>) {
    if (this.level <= LogLevel.ERROR) {
      console.error(JSON.stringify({ level: "ERROR", message, ...context, timestamp: new Date().toISOString() }));
    }
  }
}

export const logger = new Logger();
