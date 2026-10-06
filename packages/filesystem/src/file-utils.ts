import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

export class FileUtils {
  public static isBinaryFile(filePath: string): boolean {
    try {
      const buffer = Buffer.alloc(512);
      const fd = fs.openSync(filePath, 'r');
      const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
      fs.closeSync(fd);

      if (bytesRead === 0) {
        return false;
      }

      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  public static computeHash(filePath: string): string {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      return hash.substring(0, 12);
    } catch {
      return '000000000000';
    }
  }

  public static countLines(filePath: string, isBinary: boolean): number | undefined {
    if (isBinary) {
      return undefined;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.length === 0) {
        return 0;
      }
      return content.split(/\r?\n/).length;
    } catch {
      return undefined;
    }
  }
}
