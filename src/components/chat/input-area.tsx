'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Square, Sparkles } from 'lucide-react';
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
    <div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-xl px-2 sm:px-4 pb-2 sm:pb-4 pt-2 sm:pt-3">
      <div className="mx-auto max-w-[768px]">
        {/* Input container */}
        <div className="input-glow relative rounded-2xl border border-border bg-card transition-all duration-300 focus-within:border-primary/30 focus-within:bg-card focus-within:shadow-lg focus-within:shadow-primary/5">
          <div className="flex items-end gap-2 p-2 sm:p-3">
            {/* Model indicator - hidden on very small screens */}
            <div className="mb-0.5 hidden sm:flex items-center gap-1.5 shrink-0">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/15 to-cyan-500/15 border border-primary/10">
                <img src="/logo-transparent.png" alt="" className="size-7 object-contain" />
              </div>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Eesha AI to write, debug, or explain code..."
              rows={1}
              className="max-h-[200px] min-h-[28px] flex-1 resize-none bg-transparent text-xs sm:text-sm leading-relaxed text-foreground placeholder-muted-foreground outline-none"
            />

            {/* Send / Stop button */}
            <AnimatePresence mode="wait">
              {isStreaming ? (
                <motion.div
                  key="stop"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    onClick={onStop}
                    className="size-8 shrink-0 rounded-xl bg-red-600/90 text-white shadow-lg shadow-red-500/20 hover:bg-red-600"
                    size="icon"
                    title="Stop generating"
                  >
                    <Square className="size-3" fill="currentColor" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="send"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    onClick={handleSubmit}
                    disabled={!input.trim()}
                    className="size-8 shrink-0 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40 disabled:opacity-20 disabled:shadow-none"
                    size="icon"
                    title="Send message"
                  >
                    <Send className="size-3.5" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom info */}
        <div className="mt-1 sm:mt-2 hidden sm:flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-primary/40" />
            <span className="text-[11px] text-muted-foreground">Eesha AI with Thinking Mode</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            AI can make mistakes. Review code carefully.
          </span>
        </div>
      </div>
    </div>
  );
}
