'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Square, Code2, Sparkles, Globe, Paperclip, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InputAreaProps {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function InputArea({ onSend, onStop, isStreaming }: InputAreaProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
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
    <div className="shrink-0 px-4 pb-4 pt-2 relative" style={{ zIndex: 2 }}>
      <div className="mx-auto max-w-[768px]">
        {/* Input container — glass morphism */}
        <motion.div
          animate={{
            boxShadow: isFocused
              ? '0 0 30px rgba(139, 92, 246, 0.15), 0 0 60px rgba(34, 211, 238, 0.08)'
              : '0 0 0px rgba(139, 92, 246, 0), 0 0 0px rgba(34, 211, 238, 0)',
          }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="input-glow relative rounded-2xl border border-white/12 dark:border-white/10 bg-white/20 dark:bg-white/5 backdrop-blur-xl transition-all duration-300 focus-within:border-primary/30 focus-within:bg-white/30 dark:focus-within:bg-white/8"
        >
          <div className="flex items-end gap-2 p-3">
            {/* Model indicator with glow */}
            <div className="mb-0.5 flex items-center gap-1.5 shrink-0">
              <motion.div
                animate={{ rotate: isStreaming ? 360 : 0 }}
                transition={{ duration: 2, repeat: isStreaming ? Infinity : 0, ease: 'linear' }}
                className="relative flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600/30 to-cyan-600/30 border border-white/10 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/15 to-cyan-500/15" />
                <Code2 className="relative size-3.5 text-primary" />
              </motion.div>
            </div>

            {/* Left action buttons */}
            <div className="flex items-center gap-0.5 mb-0.5 shrink-0">
              <button className="flex size-6 items-center justify-center rounded-md text-foreground/30 transition-all hover:bg-white/10 hover:text-foreground/70" title="Attach file">
                <Paperclip className="size-3.5" />
              </button>
              <button className="flex size-6 items-center justify-center rounded-md text-foreground/30 transition-all hover:bg-white/10 hover:text-foreground/70" title="Web search">
                <Globe className="size-3.5" />
              </button>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Ask Eesha AI to write, debug, or explain code..."
              rows={1}
              className="max-h-[200px] min-h-[28px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder-foreground/30 outline-none"
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
                    className="size-8 shrink-0 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg shadow-violet-500/30 transition-all hover:shadow-violet-500/50 disabled:opacity-20 disabled:shadow-none"
                    size="icon"
                    title="Send message"
                  >
                    <Send className="size-3.5" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Bottom info */}
        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Shield className="size-3 text-primary/40" />
            <span className="text-[11px] text-foreground/25">Eesha AI — Committee of AI</span>
          </div>
          <span className="text-[11px] text-foreground/25">
            AI can make mistakes. Review code carefully.
          </span>
        </div>
      </div>
    </div>
  );
}
