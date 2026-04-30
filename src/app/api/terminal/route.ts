import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { getAuthUserId, unauthorizedResponse } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/app/workspace';

// ━━━ SECURITY: Comprehensive command blocklist ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// These patterns are checked against the command BEFORE execution
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // System destruction
  { pattern: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*--no-preserve-root)/i, reason: 'Destructive rm command blocked' },
  { pattern: /\bmkfs\b/i, reason: 'Filesystem format command blocked' },
  { pattern: /\bdd\s+if=/i, reason: 'Disk dump command blocked' },
  { pattern: /:()\{\s*:\s*\|\s*:\s*&\s*\}/, reason: 'Fork bomb blocked' },
  { pattern: /\bshutdown\b/i, reason: 'System shutdown blocked' },
  { pattern: /\breboot\b/i, reason: 'System reboot blocked' },
  { pattern: /\binit\s+[06Ss]\b/i, reason: 'Runlevel change blocked' },
  { pattern: /\bhalt\b/i, reason: 'System halt blocked' },
  { pattern: /\bpoweroff\b/i, reason: 'System poweroff blocked' },

  // Privilege escalation
  { pattern: /\bsudo\b/i, reason: 'Privilege escalation blocked' },
  { pattern: /\bsu\s+/i, reason: 'User switch blocked' },
  { pattern: /\bchmod\s+[0-7]*77[0-7]?\b/i, reason: 'Overly permissive chmod blocked' },
  { pattern: /\bchown\b/i, reason: 'Ownership change blocked' },
  { pattern: /\bpkexec\b/i, reason: 'PolicyKit escalation blocked' },

  // Network attacks
  { pattern: /\bnc\s+.*-[el]/i, reason: 'Netcat listener blocked' },
  { pattern: /\bncat\s+.*--listen/i, reason: 'Ncat listener blocked' },
  { pattern: /\bsocat\b/i, reason: 'Socat blocked' },
  { pattern: /\bpython[23]?\s+-m\s+(http|SimpleHTTPServer|socketserver)/i, reason: 'Network server blocked' },
  { pattern: /\bpython[23]?\s+-c\s+.*socket/i, reason: 'Raw socket usage blocked' },
  { pattern: /\bcurl\s+.*\|\s*(sh|bash|zsh)/i, reason: 'Remote script execution blocked' },
  { pattern: /\bwget\s+.*\|\s*(sh|bash|zsh)/i, reason: 'Remote script execution blocked' },

  // Data exfiltration
  { pattern: /\bcurl\s+.*(-T\s+|--upload-file)/i, reason: 'File upload blocked' },
  { pattern: /\bscp\s+/i, reason: 'SCP blocked' },
  { pattern: /\brsync\s+/i, reason: 'RSync blocked' },

  // System modification
  { pattern: /\bapt\b/i, reason: 'Package management blocked' },
  { pattern: /\byum\b/i, reason: 'Package management blocked' },
  { pattern: /\bpip\s+install/i, reason: 'Package installation blocked' },
  { pattern: /\bnpm\s+install\s+-g/i, reason: 'Global npm install blocked' },
  { pattern: /\bsystemctl\b/i, reason: 'Systemd control blocked' },
  { pattern: /\bservice\b/i, reason: 'Service control blocked' },
  { pattern: /\bcrontab\b/i, reason: 'Cron modification blocked' },
  { pattern: /\bmount\b/i, reason: 'Mount blocked' },
  { pattern: /\bumount\b/i, reason: 'Unmount blocked' },

  // Filesystem escape
  { pattern: /\/etc\//i, reason: 'Access to /etc blocked' },
  { pattern: /\/root\//i, reason: 'Access to /root blocked' },
  { pattern: /\/var\/log/i, reason: 'Access to logs blocked' },
  { pattern: /\/proc\//i, reason: 'Access to /proc blocked' },
  { pattern: /\/sys\//i, reason: 'Access to /sys blocked' },

  // Reverse shells
  { pattern: /\/dev\/tcp\//i, reason: 'Reverse shell pattern blocked' },
  { pattern: /\/dev\/udp\//i, reason: 'Reverse shell pattern blocked' },
  { pattern: /\bbash\s+-i/i, reason: 'Interactive shell blocked' },
  { pattern: /\bpython[23]?\s+-c\s+.*pty/i, reason: 'PTY spawn blocked' },

  // Environment/secret access
  { pattern: /\benv\b/i, reason: 'Environment variable dump blocked' },
  { pattern: /\bprintenv\b/i, reason: 'Environment variable dump blocked' },
  { pattern: /\bexport\s+/i, reason: 'Environment modification blocked' },
  { pattern: /\.env/i, reason: 'Environment file access blocked' },
];

function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason };
    }
  }
  return { safe: true };
}

// POST — execute a command in the workspace
export async function POST(req: NextRequest) {
  // ━━━ SECURITY: Authenticate user ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const userId = await getAuthUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    const { command, cwd } = await req.json();

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 });
    }

    // ━━━ SECURITY: Validate command against blocklist ━━━━━━━━━━━━━━━━━━━
    const { safe, reason } = isCommandSafe(command);
    if (!safe) {
      console.warn(`[SECURITY] Blocked command from user ${userId}: "${command}" — ${reason}`);
      return NextResponse.json({
        stdout: '',
        stderr: `Command blocked for security: ${reason}`,
        exitCode: 1,
      });
    }

    // ━━━ SECURITY: Limit command length ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (command.length > 500) {
      return NextResponse.json({
        stdout: '',
        stderr: 'Command too long. Maximum 500 characters allowed.',
        exitCode: 1,
      });
    }

    const path = require('path');
    const workingDir = cwd ? path.resolve(WORKSPACE_ROOT, cwd) : WORKSPACE_ROOT;

    // ━━━ SECURITY: Ensure working directory is within workspace ━━━━━━━━━━
    if (!workingDir.startsWith(WORKSPACE_ROOT)) {
      return NextResponse.json({
        stdout: '',
        stderr: 'Working directory must be within the workspace.',
        exitCode: 1,
      });
    }

    // ━━━ SECURITY: Execute with restricted environment ━━━━━━━━━━━━━━━━━━
    const safeEnv: Record<string, string> = {
      PATH: process.env.PATH || '/usr/bin:/bin',
      HOME: WORKSPACE_ROOT,
      TERM: 'dumb',
      LANG: 'en_US.UTF-8',
      USER: 'workspace',
    };
    // Do NOT pass API keys, database URLs, or other secrets to child processes

    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: workingDir,
          timeout: 15000,
          maxBuffer: 1024 * 1024, // 1MB
          env: safeEnv,
          // Run as non-root if possible
          ...(process.getuid?.() === 0 ? { uid: 1000 } : {}),
        },
        (error, stdout, stderr) => {
          // ━━━ SECURITY: Sanitize output to prevent info leakage ━━━━━━━━━
          const sanitizeOutput = (output: string): string => {
            // Remove any potential API keys or tokens from output
            return output
              .replace(/nvapi-[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]')
              .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]')
              .replace(/hf_[a-zA-Z0-9]+/g, '[REDACTED_TOKEN]')
              .replace(/postgresql:\/\/[^\s]+/g, '[REDACTED_DB_URL]');
          };

          resolve(NextResponse.json({
            stdout: sanitizeOutput(stdout || ''),
            stderr: sanitizeOutput(stderr || ''),
            exitCode: error ? error.code || 1 : 0,
          }));
        }
      );
    });
  } catch (error) {
    console.error('Terminal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
