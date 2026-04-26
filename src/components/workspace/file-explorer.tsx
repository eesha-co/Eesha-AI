'use client';

import { useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Folder, File, ChevronRight, ChevronDown, RefreshCw,
  Plus, FolderPlus, Trash2
} from 'lucide-react';
import { useWorkspaceStore, FileEntry } from '@/stores/workspace-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

function FileTreeItem({ entry, depth }: { entry: FileEntry; depth: number }) {
  const { setCurrentPath, openFile, refreshFiles } = useWorkspaceStore();
  const [expanded, setExpanded] = useState(false);

  const handleClick = useCallback(async () => {
    if (entry.type === 'directory') {
      setExpanded(!expanded);
    } else {
      // Open file for editing
      try {
        const res = await fetch(`/api/workspace?path=${encodeURIComponent(entry.path)}&action=read`);
        if (res.ok) {
          const data = await res.json();
          openFile(entry.path, data.content);
        }
      } catch { /* */ }
    }
  }, [entry, expanded, openFile]);

  return (
    <div>
      <button
        onClick={handleClick}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {entry.type === 'directory' ? (
          <>
            {expanded ? <ChevronDown className="size-3 shrink-0 text-zinc-500" /> : <ChevronRight className="size-3 shrink-0 text-zinc-500" />}
            <Folder className="size-3.5 shrink-0 text-violet-400" />
          </>
        ) : (
          <>
            <span className="w-3" />
            <File className="size-3.5 shrink-0 text-cyan-400" />
          </>
        )}
        <span className="truncate">{entry.name}</span>
      </button>
    </div>
  );
}

import { useState } from 'react';

export function FileExplorer() {
  const { files, currentPath, setCurrentPath, refreshFiles, isLoading } = useWorkspaceStore();

  useEffect(() => {
    refreshFiles();
  }, [currentPath, refreshFiles]);

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
    <div className="flex h-full flex-col border-r border-white/[0.06] bg-[#0c0c14]/95">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-zinc-600 hover:text-zinc-300"
            onClick={handleNewFile}
            title="New file"
          >
            <Plus className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-zinc-600 hover:text-zinc-300"
            onClick={handleNewFolder}
            title="New folder"
          >
            <FolderPlus className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-zinc-600 hover:text-zinc-300"
            onClick={refreshFiles}
            title="Refresh"
          >
            <RefreshCw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-3 py-1.5">
        <button
          onClick={() => setCurrentPath('')}
          className="text-[11px] text-violet-400 hover:text-violet-300"
        >
          workspace
        </button>
        {currentPath.split('/').filter(Boolean).map((segment, i, arr) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-[11px] text-zinc-600">/</span>
            <button
              onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))}
              className="text-[11px] text-zinc-400 hover:text-zinc-200"
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
              className="flex w-full items-center gap-1.5 px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <ChevronRight className="size-3 rotate-180" />
              ..
            </button>
          )}
          {files.map((entry) => (
            <FileTreeItem key={entry.path} entry={entry} depth={0} />
          ))}
          {files.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-zinc-600">
              Empty directory
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
