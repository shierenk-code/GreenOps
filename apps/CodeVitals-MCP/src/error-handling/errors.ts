export class CodeVitalsError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CodeVitalsError";
  }
}

export class InputValidationError extends CodeVitalsError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "INPUT_VALIDATION_ERROR", details);
    this.name = "InputValidationError";
  }
}

export class AnalysisEngineError extends CodeVitalsError {
  constructor(engineName: string, message: string, details?: Record<string, unknown>) {
    super(`Engine [${engineName}] error: ${message}`, "ANALYSIS_ENGINE_ERROR", details);
    this.name = "AnalysisEngineError";
  }
}

export class FileAccessError extends CodeVitalsError {
  constructor(filePath: string, message: string) {
    super(`Failed to access file '${filePath}': ${message}`, "FILE_ACCESS_ERROR", { filePath });
    this.name = "FileAccessError";
  }
}
