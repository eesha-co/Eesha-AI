'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TerminalLine {
  type: 'input' | 'output' | 'error';
  content: string;
}

export function TerminalPanel() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: 'output', content: 'Eesha AI Workspace Terminal' },
    { type: 'output', content: 'Type commands below. Working directory: /workspace' },
    { type: 'output', content: '' },
  ]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const executeCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;

    setLines((prev) => [...prev, { type: 'input', content: `$ ${command}` }]);
    setIsRunning(true);
    setInput('');

    try {
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.stdout) {
          setLines((prev) => [...prev, { type: 'output', content: data.stdout }]);
        }
        if (data.stderr) {
          setLines((prev) => [...prev, { type: 'error', content: data.stderr }]);
        }
        if (!data.stdout && !data.stderr) {
          setLines((prev) => [...prev, { type: 'output', content: '(no output)' }]);
        }
      } else {
        setLines((prev) => [...prev, { type: 'error', content: 'Failed to execute command' }]);
      }
    } catch (err) {
      setLines((prev) => [...prev, { type: 'error', content: String(err) }]);
    }

    setIsRunning(false);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isRunning) {
        executeCommand(input);
      }
    },
    [input, isRunning, executeCommand]
  );

  const clearTerminal = useCallback(() => {
    setLines([]);
  }, []);

  return (
    <div className="flex h-full flex-col bg-[#0a0a12]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <TerminalIcon className="size-3 text-emerald-400" />
          <span className="text-[11px] font-medium text-zinc-400">Terminal</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 text-zinc-600 hover:text-zinc-300"
          onClick={clearTerminal}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {/* Output */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-[12px] leading-[1.6]">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap break-all ${
              line.type === 'input'
                ? 'text-emerald-400'
                : line.type === 'error'
                ? 'text-red-400'
                : 'text-zinc-400'
            }`}
          >
            {line.content}
          </div>
        ))}
        {isRunning && (
          <span className="animate-blink-cursor inline-block size-2 bg-emerald-400" />
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2">
        <span className="text-xs text-emerald-400">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          placeholder="Enter command..."
          className="flex-1 bg-transparent font-mono text-xs text-zinc-200 outline-none placeholder-zinc-700 disabled:opacity-50"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-zinc-500 hover:text-zinc-300"
          onClick={() => executeCommand(input)}
          disabled={isRunning || !input.trim()}
        >
          <Send className="size-3" />
        </Button>
      </div>
    </div>
  );
}
