import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/app/workspace';

// Security: ensure path stays within workspace
function safePath(relativePath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
}

// GET — list directory or read file
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get('path') || '';
    const action = searchParams.get('action') || 'list'; // 'list' or 'read'

    const fullPath = safePath(filePath);

    if (action === 'read') {
      const content = await fs.readFile(fullPath, 'utf-8');
      return NextResponse.json({ content, path: filePath });
    }

    // List directory
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const files: FileEntry[] = [];

    for (const entry of entries) {
      const entryPath = path.join(filePath, entry.name);
      const type = entry.isDirectory() ? 'directory' : 'file';
      let size: number | undefined;
      let modified: string | undefined;

      if (type === 'file') {
        try {
          const stat = await fs.stat(safePath(entryPath));
          size = stat.size;
          modified = stat.mtime.toISOString();
        } catch { /* skip */ }
      }

      files.push({ name: entry.name, path: entryPath, type, size, modified });
    }

    // Sort: directories first, then alphabetical
    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ files, path: filePath });
  } catch (error) {
    console.error('Workspace GET error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST — create file or directory
export async function POST(req: NextRequest) {
  try {
    const { path: filePath, content, type } = await req.json();

    if (!filePath) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    const fullPath = safePath(filePath);

    if (type === 'directory') {
      await fs.mkdir(fullPath, { recursive: true });
      return NextResponse.json({ success: true, path: filePath, type: 'directory' });
    }

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content || '', 'utf-8');
    return NextResponse.json({ success: true, path: filePath, type: 'file' });
  } catch (error) {
    console.error('Workspace POST error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT — update file content
export async function PUT(req: NextRequest) {
  try {
    const { path: filePath, content } = await req.json();

    if (!filePath || content === undefined) {
      return NextResponse.json({ error: 'Path and content are required' }, { status: 400 });
    }

    const fullPath = safePath(filePath);
    await fs.writeFile(fullPath, content, 'utf-8');
    return NextResponse.json({ success: true, path: filePath });
  } catch (error) {
    console.error('Workspace PUT error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — delete file or directory
export async function DELETE(req: NextRequest) {
  try {
    const { path: filePath } = await req.json();

    if (!filePath) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    const fullPath = safePath(filePath);
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      await fs.rm(fullPath, { recursive: true });
    } else {
      await fs.unlink(fullPath);
    }

    return NextResponse.json({ success: true, path: filePath });
  } catch (error) {
    console.error('Workspace DELETE error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
