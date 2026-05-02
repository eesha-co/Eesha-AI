'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Square, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/stores/chat-store';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface InputAreaProps {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function InputArea({ onSend, onStop, isStreaming }: InputAreaProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { freeCreditsUsed } = useChatStore();
  const { data: session } = useSession();
  const router = useRouter();
  const FREE_TIER_MAX = 5;
  const isAuthenticated = !!session?.user;
  const creditsRemaining = Math.max(0, FREE_TIER_MAX - freeCreditsUsed);

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
        {/* Input container — hero element with gradient border on focus */}
        <div className={`input-hero relative transition-all duration-300 ${
          hasContent || isFocused ? 'rounded-2xl' : 'rounded-full'
        }`}>
          {/* Animated gradient border */}
          <div className={`absolute inset-0 rounded-[inherit] transition-opacity duration-500 ${
            hasContent || isFocused ? 'opacity-100' : 'opacity-0'
          }`}>
            <div className="absolute inset-0 rounded-[inherit] animate-gradient-border bg-gradient-to-r from-violet-500/40 via-emerald-500/30 to-violet-500/40 bg-[length:200%_200%]" />
          </div>

          <div className={`relative rounded-[inherit] border transition-all duration-300 ${
            hasContent || isFocused
              ? 'border-white/10 dark:border-white/8 bg-white/15 dark:bg-white/[0.04] backdrop-blur-2xl'
              : 'border-white/6 dark:border-white/[0.04] bg-white/10 dark:bg-white/[0.03] backdrop-blur-xl'
          }`}>
            <div className="flex items-end gap-3 px-4 py-3">
              {/* Model indicator — tiny dot */}
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
                  className="size-2 rounded-full bg-gradient-to-br from-violet-500 to-emerald-500"
                />
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="What do you want to build?"
                rows={1}
                className="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-foreground placeholder-foreground/25 outline-none"
              />

              {/* Send / Stop button — elegant minimal style */}
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
                      className="flex size-8 items-center justify-center rounded-lg bg-foreground/10 text-foreground/70 transition-all hover:bg-foreground/15 hover:text-foreground"
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
                      className={`flex size-8 items-center justify-center rounded-lg transition-all duration-200 ${
                        hasContent
                          ? 'bg-foreground text-background hover:opacity-90'
                          : 'bg-foreground/8 text-foreground/20 cursor-default'
                      }`}
                      title="Send message"
                    >
                      <Send className="size-3.5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Bottom info — barely visible */}
        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            {!isAuthenticated && creditsRemaining <= 2 && creditsRemaining > 0 && (
              <button
                onClick={() => router.push('/signup')}
                className="flex items-center gap-1 text-[11px] text-foreground/20 hover:text-foreground/40 transition-colors"
              >
                <Sparkles className="size-3" />
                {creditsRemaining} free message{creditsRemaining !== 1 ? 's' : ''} left
              </button>
            )}
            {!isAuthenticated && creditsRemaining === 0 && (
              <button
                onClick={() => router.push('/signup')}
                className="flex items-center gap-1 text-[11px] text-foreground/20 hover:text-foreground/40 transition-colors"
              >
                <Sparkles className="size-3" />
                Sign up for unlimited
              </button>
            )}
          </div>
          <span className="text-[11px] text-foreground/15">
            AI can make mistakes. Review code carefully.
          </span>
        </div>
      </div>
    </div>
  );
}
