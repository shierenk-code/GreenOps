import { FindingCategory, Severity } from "../types/findings.js";

export interface SecurityPatternRule {
  id: string;
  category: FindingCategory;
  severity: Severity;
  pattern: RegExp;
  message: string;
  suggestion: string;
}

export const SECURITY_RULES: SecurityPatternRule[] = [
  // Secret Leaks (Universal across all languages)
  {
    id: "sec-aws-access-key",
    category: "secret_leak",
    severity: "critical",
    pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/,
    message: "Hardcoded AWS Access Key detected",
    suggestion: "Store secrets in environment variables or a secret vault.",
  },
  {
    id: "sec-stripe-api-key",
    category: "secret_leak",
    severity: "critical",
    pattern: /sk_live_[0-9a-zA-Z]{24,32}/,
    message: "Hardcoded Stripe Live API Key detected",
    suggestion: "Use environment variables.",
  },
  {
    id: "sec-db-connection-string",
    category: "secret_leak",
    severity: "high",
    pattern: /(postgres|mysql|mongodb|redis):\/\/[a-zA-Z0-9_\-]+:[^@\s"']+@[a-zA-Z0-9_\-\.]+/,
    message: "Hardcoded database connection string with password detected",
    suggestion: "Store database credentials in environment variables.",
  },
  {
    id: "sec-generic-api-key",
    category: "secret_leak",
    severity: "high",
    pattern: /(?:api_key|apikey|secret_key|private_key|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i,
    message: "Potential hardcoded secret or API key assignment",
    suggestion: "Extract sensitive value to environment variable.",
  },

  // Python Security
  {
    id: "sec-python-pickle",
    category: "unsafe_deserialization",
    severity: "critical",
    pattern: /pickle\.(loads?|Unpickler)/,
    message: "Unsafe Python pickle deserialization can lead to arbitrary code execution",
    suggestion: "Use safer serialization formats like JSON or Protocol Buffers.",
  },
  {
    id: "sec-python-eval-exec",
    category: "unsafe_deserialization",
    severity: "critical",
    pattern: /\b(eval|exec)\s*\([^)]*input/,
    message: "Unsafe eval/exec call on dynamic input in Python",
    suggestion: "Avoid dynamic execution of un-sanitized code strings.",
  },
  {
    id: "sec-python-shell-true",
    category: "command_injection",
    severity: "high",
    pattern: /subprocess\.(Popen|call|run)\([^)]*shell\s*=\s*True/i,
    message: "Python subprocess call with shell=True creates command injection risk",
    suggestion: "Pass command arguments as a list and set shell=False.",
  },

  // Go / C / C++ / Java Command Injection
  {
    id: "sec-go-exec-command",
    category: "command_injection",
    severity: "high",
    pattern: /exec\.Command\s*\(\s*["'](sh|bash|cmd)["']\s*,\s*["']-c["']/,
    message: "Dynamic shell invocation in Go command execution",
    suggestion: "Pass command binary and arguments directly without shell wrapper.",
  },
  {
    id: "sec-java-runtime-exec",
    category: "command_injection",
    severity: "high",
    pattern: /Runtime\.getRuntime\(\)\.exec\s*\(/,
    message: "Command execution in Java Runtime.exec()",
    suggestion: "Use ProcessBuilder with argument list.",
  },
  {
    id: "sec-c-system-call",
    category: "command_injection",
    severity: "high",
    pattern: /\bsystem\s*\(\s*[^)]+\)/,
    message: "System command execution call in C/C++",
    suggestion: "Use execve or spawn functions with parameter lists.",
  },

  // PHP Security
  {
    id: "sec-php-eval-exec",
    category: "command_injection",
    severity: "critical",
    pattern: /\b(eval|shell_exec|exec|passthru|system)\s*\(/i,
    message: "Unsafe PHP dynamic code or command execution function call",
    suggestion: "Avoid invoking shell execution functions directly.",
  },

  // Insecure Cryptography (Universal)
  {
    id: "sec-md5-usage",
    category: "insecure_crypto",
    severity: "high",
    pattern: /(crypto\.createHash\(\s*["']md5["']|hashlib\.md5|MessageDigest\.getInstance\("MD5"\))/i,
    message: "Use of weak cryptographic hash algorithm MD5",
    suggestion: "Use SHA-256 or bcrypt/argon2 for password hashing.",
  },
  {
    id: "sec-sha1-usage",
    category: "insecure_crypto",
    severity: "medium",
    pattern: /(crypto\.createHash\(\s*["']sha1["']|hashlib\.sha1|MessageDigest\.getInstance\("SHA-1"\))/i,
    message: "Use of weak hash algorithm SHA-1",
    suggestion: "Upgrade to SHA-256 or SHA-512.",
  },

  // SQL Injection (Universal)
  {
    id: "sec-sql-template-literal",
    category: "sql_injection",
    severity: "high",
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*\$\{.+\}/i,
    message: "Potential SQL Injection in dynamic query template literal",
    suggestion: "Use parameterized queries or prepared statements.",
  },
  {
    id: "sec-sql-concatenation",
    category: "sql_injection",
    severity: "high",
    pattern: /"(?:SELECT|INSERT|UPDATE|DELETE)\s+.*"\s*\+\s*\w+/i,
    message: "Potential SQL Injection in string concatenation query",
    suggestion: "Use parameterized queries or prepared statements.",
  },
];
