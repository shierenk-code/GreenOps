import { CodeHealthReport } from "../types/findings.js";

export class JSONFormatter {
  static format(report: CodeHealthReport): string {
    return JSON.stringify(report, null, 2);
  }
}
