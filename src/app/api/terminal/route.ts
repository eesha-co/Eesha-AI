import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 30;

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/home/z/my-project/workspace';

// POST — execute a command in the workspace
export async function POST(req: NextRequest) {
  try {
    const { command, cwd } = await req.json();

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 });
    }

    // Block dangerous commands
    const dangerous = ['rm -rf /', 'mkfs', 'dd if=', ':(){:|:&};:', 'shutdown', 'reboot', 'init 0'];
    if (dangerous.some(d => command.includes(d))) {
      return NextResponse.json({
        stdout: '',
        stderr: 'Command blocked for safety. This is a shared workspace.',
        exitCode: 1,
      });
    }

    const workingDir = cwd ? path.resolve(WORKSPACE_ROOT, cwd) : WORKSPACE_ROOT;

    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: workingDir.startsWith(WORKSPACE_ROOT) ? workingDir : WORKSPACE_ROOT,
          timeout: 15000,
          maxBuffer: 1024 * 1024, // 1MB
          env: { ...process.env, TERM: 'dumb' },
        },
        (error, stdout, stderr) => {
          resolve(NextResponse.json({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: error ? error.code || 1 : 0,
          }));
        }
      );
    });
  } catch (error) {
    console.error('Terminal error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
