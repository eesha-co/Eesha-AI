'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Square, Paperclip, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InputAreaProps {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function InputArea({ onSend, onStop, isStreaming }: InputAreaProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-[#0a0a12] px-4 pb-4 pt-3">
      <div className="mx-auto max-w-[768px]">
        {/* Input container */}
        <div className="input-glow rounded-2xl border border-white/[0.06] bg-white/[0.02] transition-colors focus-within:border-violet-500/30">
          <div className="flex items-end gap-2 p-3">
            {/* Paperclip button (disabled placeholder) */}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-zinc-600 opacity-50"
              disabled
              title="Attach file (coming soon)"
            >
              <Paperclip className="size-4" />
            </Button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Kimi K2.5 anything about code..."
              rows={1}
              className="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
            />

            {/* Send / Stop button */}
            {isStreaming ? (
              <Button
                onClick={onStop}
                className="size-8 shrink-0 rounded-lg bg-red-600 text-white hover:bg-red-700"
                size="icon"
                title="Stop generating"
              >
                <Square className="size-3.5" fill="currentColor" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="size-8 shrink-0 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 text-white opacity-90 transition-opacity hover:opacity-100 disabled:opacity-30"
                size="icon"
                title="Send message"
              >
                <Send className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Bottom info */}
        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Code2 className="size-3 text-zinc-600" />
            <span className="text-[11px] text-zinc-600">Kimi K2.5</span>
          </div>
          <span className="text-[11px] text-zinc-600">
            Kimi K2.5 can make mistakes. Review code carefully.
          </span>
        </div>
      </div>
    </div>
  );
}
