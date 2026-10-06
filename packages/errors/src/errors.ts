export abstract class CodeVitalsError extends Error {
  public abstract readonly code: string;
  public readonly targetPath?: string;

  constructor(message: string, targetPath?: string) {
    super(message);
    this.name = this.constructor.name;
    this.targetPath = targetPath;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public abstract toUserMessage(): string;
}

export class RepositoryNotFoundError extends CodeVitalsError {
  public readonly code = 'REPOSITORY_NOT_FOUND';

  constructor(targetPath: string) {
    super(`Repository not found at: ${targetPath}`, targetPath);
  }

  public toUserMessage(): string {
    return [
      `GreenOps could not find the repository:`,
      ``,
      `  ${this.targetPath}`,
      ``,
      `Make sure the path exists and is accessible.`,
    ].join('\n');
  }
}

export class PermissionDeniedError extends CodeVitalsError {
  public readonly code = 'PERMISSION_DENIED';

  constructor(targetPath: string) {
    super(`Permission denied accessing: ${targetPath}`, targetPath);
  }

  public toUserMessage(): string {
    return [
      `GreenOps was denied permission to access:`,
      ``,
      `  ${this.targetPath}`,
      ``,
      `Please check file permissions and try again.`,
    ].join('\n');
  }
}

export class InvalidRepositoryError extends CodeVitalsError {
  public readonly code = 'INVALID_REPOSITORY';

  constructor(targetPath: string, reason: string) {
    super(`Invalid repository at ${targetPath}: ${reason}`, targetPath);
  }

  public toUserMessage(): string {
    return [
      `GreenOps encountered an invalid repository:`,
      ``,
      `  ${this.targetPath}`,
      ``,
      `Reason: ${this.message}`,
    ].join('\n');
  }
}

export class UnsupportedOperationError extends CodeVitalsError {
  public readonly code = 'UNSUPPORTED_OPERATION';

  constructor(operation: string) {
    super(`Unsupported operation: ${operation}`);
  }

  public toUserMessage(): string {
    return `Operation not supported: ${this.message}`;
  }
}

export class ConfigurationError extends CodeVitalsError {
  public readonly code = 'CONFIGURATION_ERROR';

  constructor(message: string, targetPath?: string) {
    super(message, targetPath);
  }

  public toUserMessage(): string {
    return `Configuration error: ${this.message}`;
  }
}

export class ScannerError extends CodeVitalsError {
  public readonly code = 'SCANNER_ERROR';

  constructor(message: string, targetPath?: string) {
    super(message, targetPath);
  }

  public toUserMessage(): string {
    return `Scanner error: ${this.message}`;
  }
}

export class ParserError extends CodeVitalsError {
  public readonly code = 'PARSER_ERROR';

  constructor(message: string, targetPath?: string) {
    super(message, targetPath);
  }

  public toUserMessage(): string {
    return `Parser error: ${this.message}`;
  }
}
