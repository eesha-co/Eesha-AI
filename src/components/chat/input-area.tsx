'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Square, Image } from 'lucide-react';
import { useChatStore, ChatMode } from '@/stores/chat-store';

interface InputAreaProps {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

const MODE_PLACEHOLDERS: Record<ChatMode, string> = {
  code: 'What do you want to build?',
  iluma: 'Describe the image you want to create...',
  health: 'Ask me about health, wellness, or nutrition...',
  chat: 'Ask me anything or start a conversation...',
};

const MODE_COLORS: Record<ChatMode, { from: string; to: string; shadow: string }> = {
  code: { from: 'from-violet-600', to: 'to-emerald-600', shadow: 'shadow-violet-500/20' },
  iluma: { from: 'from-emerald-600', to: 'to-cyan-500', shadow: 'shadow-emerald-500/20' },
  health: { from: 'from-rose-600', to: 'to-pink-500', shadow: 'shadow-rose-500/20' },
  chat: { from: 'from-blue-600', to: 'to-violet-500', shadow: 'shadow-blue-500/20' },
};

const MODE_DOT_COLORS: Record<ChatMode, string> = {
  code: 'from-violet-500 to-emerald-500',
  iluma: 'from-emerald-500 to-cyan-400',
  health: 'from-rose-500 to-pink-400',
  chat: 'from-blue-500 to-violet-400',
};

const MODE_GRADIENT_BORDERS: Record<ChatMode, string> = {
  code: 'from-violet-500/50 via-emerald-500/40 to-violet-500/50',
  iluma: 'from-emerald-500/50 via-cyan-500/40 to-emerald-500/50',
  health: 'from-rose-500/50 via-pink-500/40 to-rose-500/50',
  chat: 'from-blue-500/50 via-violet-500/40 to-blue-500/50',
};

export function InputArea({ onSend, onStop, isStreaming }: InputAreaProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { activeMode } = useChatStore();

  const colors = MODE_COLORS[activeMode];
  const dotColor = MODE_DOT_COLORS[activeMode];
  const gradientBorder = MODE_GRADIENT_BORDERS[activeMode];

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

  const hasContent = input.trim().length > 0;

  return (
    <div className="shrink-0 px-4 pb-4 pt-2 relative" style={{ zIndex: 2 }}>
      <div className="mx-auto max-w-[720px]">
        {/* Input container */}
        <div className="input-hero relative transition-all duration-300 rounded-2xl">
          {/* Animated gradient border — visible on focus/content */}
          <div className={`absolute inset-0 rounded-[inherit] transition-opacity duration-500 ${
            hasContent || isFocused ? 'opacity-100' : 'opacity-0'
          }`}>
            <div className={`absolute inset-0 rounded-[inherit] animate-gradient-border bg-gradient-to-r ${gradientBorder} bg-[length:200%_200%]`} />
          </div>

          {/* Main input border — VISIBLE in both light and dark mode */}
          <div className={`relative rounded-[inherit] border transition-all duration-300 ${
            hasContent || isFocused
              ? 'border-[var(--border-medium)] bg-[var(--surface-primary)]/80 backdrop-blur-xl shadow-lg shadow-black/5 dark:shadow-black/20'
              : 'border-[var(--border)] bg-[var(--surface-primary)]/60 backdrop-blur-sm hover:border-[var(--border-medium)]'
          }`}>
            <div className="flex items-end gap-3 px-5 py-3.5">
              {/* Mode indicator dot */}
              <div className="mb-1 shrink-0 flex items-center gap-2">
                <motion.div
                  animate={{
                    scale: isStreaming ? [1, 1.3, 1] : 1,
                    opacity: isStreaming ? [0.5, 1, 0.5] : 1,
                  }}
                  transition={{
                    duration: 2,
                    repeat: isStreaming ? Infinity : 0,
                    ease: 'easeInOut',
                  }}
                  className={`size-2 rounded-full bg-gradient-to-br ${dotColor}`}
                />
              </div>

              {/* Textarea — high contrast text */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={MODE_PLACEHOLDERS[activeMode]}
                rows={1}
                className="max-h-[200px] min-h-[28px] flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none"
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
                    className="shrink-0 mb-0.5"
                  >
                    <button
                      onClick={onStop}
                      className="flex size-9 items-center justify-center rounded-xl bg-[var(--surface-secondary)] text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)]"
                      title="Stop generating"
                    >
                      <Square className="size-3" fill="currentColor" />
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="send"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="shrink-0 mb-0.5"
                  >
                    <button
                      onClick={handleSubmit}
                      disabled={!hasContent}
                      className={`flex size-9 items-center justify-center rounded-xl transition-all duration-200 ${
                        hasContent
                          ? `bg-gradient-to-br ${colors.from} ${colors.to} text-white hover:opacity-90 shadow-md ${colors.shadow}`
                          : 'bg-[var(--surface-secondary)] text-[var(--text-tertiary)] cursor-default'
                      }`}
                      title={activeMode === 'iluma' ? 'Generate image' : 'Send message'}
                    >
                      {activeMode === 'iluma' ? (
                        <Image className="size-3.5" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Bottom info */}
        <div className="mt-2.5 flex items-center justify-between px-1">
          <div />
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {activeMode === 'health'
              ? 'AI is not a doctor. Always consult professionals.'
              : activeMode === 'iluma'
                ? 'Powered by Flux. No usage restrictions.'
                : 'AI can make mistakes. Review code carefully.'
            }
          </span>
        </div>
      </div>
    </div>
  );
}
