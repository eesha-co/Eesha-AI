import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/app/workspace';

// Binary file extensions that shouldn't be read as text
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'avif',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'flv', 'webm',
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'bin', 'dat',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'pyc', 'pyo', 'o', 'obj', 'class', 'jar',
]);

function safePath(relativePath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

function isBinaryFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return BINARY_EXTENSIONS.has(ext);
}

function getFileLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', rb: 'ruby',
    css: 'css', html: 'html', json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    swift: 'swift', kt: 'kotlin', scala: 'scala', php: 'php',
    xml: 'xml', toml: 'toml', ini: 'ini', cfg: 'ini',
    dockerfile: 'dockerfile', makefile: 'makefile',
    r: 'r', rmd: 'r', lua: 'lua', dart: 'dart',
    vue: 'vue', svelte: 'svelte',
  };
  return map[ext] || 'text';
}

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  language?: string;
  isBinary?: boolean;
}

// GET — list directory or read file
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get('path') || '';
    const action = searchParams.get('action') || 'list';

    const fullPath = safePath(filePath);

    if (action === 'read') {
      // Check if file exists
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) {
        return NextResponse.json({ error: 'Not a file', path: filePath }, { status: 400 });
      }

      // Check if binary
      if (isBinaryFile(filePath)) {
        return NextResponse.json({
          content: null,
          path: filePath,
          isBinary: true,
          size: stat.size,
          language: getFileLanguage(filePath),
          message: `Binary file (${formatSize(stat.size)})`,
        });
      }

      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        return NextResponse.json({
          content,
          path: filePath,
          isBinary: false,
          language: getFileLanguage(filePath),
          size: stat.size,
        });
      } catch (readError) {
        // If UTF-8 reading fails, treat as binary
        return NextResponse.json({
          content: null,
          path: filePath,
          isBinary: true,
          size: stat.size,
          language: getFileLanguage(filePath),
          message: `Binary file (${formatSize(stat.size)})`,
        });
      }
    }

    // List directory
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const files: FileEntry[] = [];

      for (const entry of entries) {
        // Skip hidden files and node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;

        const entryPath = path.join(filePath, entry.name);
        const type = entry.isDirectory() ? 'directory' : 'file';
        let size: number | undefined;
        let modified: string | undefined;
        let language: string | undefined;
        let isBinary: boolean | undefined;

        if (type === 'file') {
          try {
            const stat = await fs.stat(safePath(entryPath));
            size = stat.size;
            modified = stat.mtime.toISOString();
            language = getFileLanguage(entryPath);
            isBinary = isBinaryFile(entryPath);
          } catch { /* skip */ }
        }

        files.push({ name: entry.name, path: entryPath, type, size, modified, language, isBinary });
      }

      // Sort: directories first, then alphabetical
      files.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return NextResponse.json({ files, path: filePath });
    } catch {
      return NextResponse.json({ files: [], path: filePath });
    }
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
    return NextResponse.json({
      success: true,
      path: filePath,
      type: 'file',
      language: getFileLanguage(filePath),
    });
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

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
