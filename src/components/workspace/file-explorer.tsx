'use client';

import { useEffect, useCallback, useState } from 'react';
import { Folder, File, ChevronRight, ChevronDown, RefreshCw, Plus, FolderPlus, Binary } from 'lucide-react';
import { useWorkspaceStore, FileEntry } from '@/stores/workspace-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

function getFileIcon(entry: FileEntry) {
  if (entry.type === 'directory') return <Folder className="size-3.5 shrink-0 text-violet-500" />;
  if (entry.isBinary) return <Binary className="size-3.5 shrink-0 text-amber-500" />;
  return <File className="size-3.5 shrink-0 text-primary" />;
}

function FileTreeItem({ entry, depth }: { entry: FileEntry; depth: number }) {
  const { setCurrentPath, openFile } = useWorkspaceStore();
  const [expanded, setExpanded] = useState(false);

  const handleClick = useCallback(async () => {
    if (entry.type === 'directory') {
      setExpanded(!expanded);
    } else {
      if (entry.isBinary) return;
      try {
        const res = await fetch(`/api/workspace?path=${encodeURIComponent(entry.path)}&action=read`);
        if (res.ok) {
          const data = await res.json();
          if (data.isBinary) return;
          openFile(entry.path, data.content || '');
        }
      } catch { /* */ }
    }
  }, [entry, expanded, openFile]);

  return (
    <div>
      <button
        onClick={handleClick}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-accent hover:text-foreground"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {entry.type === 'directory' ? (
          <>
            {expanded ? <ChevronDown className="size-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
            <Folder className="size-3.5 shrink-0 text-violet-500" />
          </>
        ) : (
          <>
            <span className="w-3" />
            {getFileIcon(entry)}
          </>
        )}
        <span className="truncate">{entry.name}</span>
        {entry.isBinary && <span className="ml-auto text-[9px] text-muted-foreground shrink-0">binary</span>}
      </button>
    </div>
  );
}

export function FileExplorer() {
  const { files, currentPath, setCurrentPath, refreshFiles, isLoading } = useWorkspaceStore();

  useEffect(() => { refreshFiles(); }, [currentPath, refreshFiles]);

  const handleNewFile = useCallback(async () => {
    const name = prompt('File name (e.g., main.py):');
    if (!name) return;
    try {
      const filePath = currentPath ? `${currentPath}/${name}` : name;
      await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: '', type: 'file' }),
      });
      refreshFiles();
    } catch { /* */ }
  }, [currentPath, refreshFiles]);

  const handleNewFolder = useCallback(async () => {
    const name = prompt('Folder name:');
    if (!name) return;
    try {
      const folderPath = currentPath ? `${currentPath}/${name}` : name;
      await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath, type: 'directory' }),
      });
      refreshFiles();
    } catch { /* */ }
  }, [currentPath, refreshFiles]);

  return (
    <div className="flex h-full flex-col border-r border-white/5 dark:border-white/5 bg-white/50 dark:bg-black/40 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Explorer</span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" onClick={handleNewFile} title="New file">
            <Plus className="size-3" />
          </Button>
          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" onClick={handleNewFolder} title="New folder">
            <FolderPlus className="size-3" />
          </Button>
          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" onClick={refreshFiles} title="Refresh">
            <RefreshCw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
        <button onClick={() => setCurrentPath('')} className="text-[11px] text-primary hover:text-primary/80">workspace</button>
        {currentPath.split('/').filter(Boolean).map((segment, i, arr) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">/</span>
            <button
              onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))}
              className="text-[11px] text-[var(--text-secondary)] hover:text-foreground"
            >
              {segment}
            </button>
          </span>
        ))}
      </div>

      {/* File list */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {currentPath && (
            <button
              onClick={() => setCurrentPath(currentPath.split('/').slice(0, -1).join('/'))}
              className="flex w-full items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="size-3 rotate-180" />..
            </button>
          )}
          {files.map((entry) => (
            <FileTreeItem key={entry.path} entry={entry} depth={0} />
          ))}
          {files.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-[11px] text-muted-foreground">
              Empty directory
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
