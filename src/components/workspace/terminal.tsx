'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, Send, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/stores/workspace-store';

interface TerminalLine {
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp?: number;
}

interface CommandHistoryEntry {
  command: string;
  timestamp: number;
}

export function TerminalPanel() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: 'system', content: 'Eesha AI Workspace Terminal' },
    { type: 'system', content: 'Working directory: /workspace' },
    { type: 'system', content: 'Type commands below. The terminal syncs with the workspace.' },
    { type: 'system', content: '' },
  ]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [commandHistory, setCommandHistory] = useState<CommandHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const refreshFiles = useWorkspaceStore((s) => s.refreshFiles);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const executeCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;

    setLines((prev) => [...prev, { type: 'input', content: `$ ${command}`, timestamp: Date.now() }]);
    setIsRunning(true);
    setInput('');

    // Add to command history
    setCommandHistory((prev) => [...prev, { command, timestamp: Date.now() }]);
    setHistoryIndex(-1);

    try {
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });

      if (res.ok) {
        const data = await res.json();

        if (data.stdout) {
          setLines((prev) => [...prev, { type: 'output', content: data.stdout, timestamp: Date.now() }]);
        }
        if (data.stderr) {
          setLines((prev) => [...prev, { type: 'error', content: data.stderr, timestamp: Date.now() }]);
        }
        if (data.exitCode !== undefined && data.exitCode !== 0) {
          setLines((prev) => [...prev, { type: 'error', content: `Process exited with code ${data.exitCode}`, timestamp: Date.now() }]);
        }
        if (!data.stdout && !data.stderr && data.exitCode === 0) {
          setLines((prev) => [...prev, { type: 'output', content: '(command completed)', timestamp: Date.now() }]);
        }

        // Auto-refresh workspace files after commands that might modify the filesystem
        const fileModifyingCommands = ['touch', 'mkdir', 'rm', 'cp', 'mv', 'nano', 'vim', 'cat >', 'echo >', 'curl', 'wget', 'git', 'npm', 'pip', 'bun', 'python', 'node', 'npx', 'yarn', 'pnpm'];
        const shouldRefresh = fileModifyingCommands.some(cmd => command.trimStart().startsWith(cmd));
        if (shouldRefresh) {
          setTimeout(() => refreshFiles(), 500);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setLines((prev) => [...prev, { type: 'error', content: `Error: ${errData.error || `HTTP ${res.status}`}`, timestamp: Date.now() }]);
      }
    } catch (err) {
      setLines((prev) => [...prev, { type: 'error', content: `Network error: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() }]);
    }

    setIsRunning(false);
    focusInput();
  }, [refreshFiles, focusInput]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isRunning) {
        executeCommand(input);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (commandHistory.length > 0) {
          const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex].command);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex >= 0) {
          const newIndex = historyIndex + 1;
          if (newIndex >= commandHistory.length) {
            setHistoryIndex(-1);
            setInput('');
          } else {
            setHistoryIndex(newIndex);
            setInput(commandHistory[newIndex].command);
          }
        }
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        setLines([]);
      }
    },
    [input, isRunning, executeCommand, commandHistory, historyIndex]
  );

  const clearTerminal = useCallback(() => {
    setLines([]);
    focusInput();
  }, [focusInput]);

  return (
    <div className="flex h-full flex-col bg-[#0a0a12]" onClick={focusInput}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <TerminalIcon className="size-3 text-emerald-400" />
          <span className="text-[11px] font-medium text-zinc-400">Terminal</span>
          {isRunning && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-amber-400">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-amber-400" />
              Running...
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 text-zinc-600 hover:text-zinc-300"
          onClick={clearTerminal}
          title="Clear terminal (Ctrl+L)"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {/* Output area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-3 font-mono text-[12px] leading-[1.7]"
        style={{ minHeight: 0 }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap break-all ${
              line.type === 'input'
                ? 'text-emerald-400'
                : line.type === 'error'
                ? 'text-red-400'
                : line.type === 'system'
                ? 'text-zinc-600 italic'
                : 'text-zinc-400'
            }`}
          >
            {line.content}
          </div>
        ))}
        {isRunning && (
          <div className="flex items-center gap-1 text-emerald-400">
            <span className="inline-block size-2 animate-pulse bg-emerald-400" />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2">
        <span className="text-xs text-emerald-400 shrink-0">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          placeholder={isRunning ? 'Waiting for command to finish...' : 'Enter command... (↑↓ for history)'}
          className="flex-1 bg-transparent font-mono text-xs text-zinc-200 outline-none placeholder-zinc-700 disabled:opacity-50"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-zinc-500 hover:text-zinc-300"
          onClick={() => executeCommand(input)}
          disabled={isRunning || !input.trim()}
        >
          <Send className="size-3" />
        </Button>
      </div>
    </div>
  );
}
