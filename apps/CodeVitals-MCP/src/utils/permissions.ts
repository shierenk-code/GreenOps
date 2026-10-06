import path from "path";
import { SecureContext } from "../types/config.js";

export class PermissionModel {
  static createDefaultContext(targetPath: string): SecureContext {
    return {
      allowedPermissions: [
        "READ_FILES",
        "READ_GIT",
        "READ_PACKAGE_JSON",
        "READ_LOCKFILES",
        "NETWORK_ACCESS",
      ],
      sandboxPath: path.resolve(targetPath),
      maxFileSize: 52428800, // 50MB
      maxDepth: 15,
      timeout: 60000,
    };
  }

  static validatePathAccess(targetPath: string, context: SecureContext): boolean {
    const resolved = path.resolve(targetPath);
    return resolved.startsWith(context.sandboxPath);
  }
}
