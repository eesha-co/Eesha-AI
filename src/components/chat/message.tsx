'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, RefreshCw, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/chat/code-block';
import type { Message as MessageType } from '@/stores/chat-store';

interface MessageProps {
  message: MessageType;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1">
      <span className="text-xs text-zinc-500">Thinking</span>
      <span className="flex gap-0.5">
        <span className="animate-thinking-dot inline-block size-1 rounded-full bg-cyan-400" style={{ animationDelay: '0ms' }} />
        <span className="animate-thinking-dot inline-block size-1 rounded-full bg-cyan-400" style={{ animationDelay: '200ms' }} />
        <span className="animate-thinking-dot inline-block size-1 rounded-full bg-cyan-400" style={{ animationDelay: '400ms' }} />
      </span>
    </div>
  );
}

export function Message({ message, isStreaming, onRegenerate }: MessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isAssistantStreaming = isStreaming && message.role === 'assistant' && !message.content;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [message.content]);

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="flex justify-end"
      >
        <div className="group relative max-w-[85%] sm:max-w-[70%]">
          <div className="rounded-2xl rounded-tr-sm bg-gradient-to-br from-violet-600/90 to-purple-600/90 px-4 py-2.5 text-sm leading-relaxed text-white shadow-lg shadow-violet-500/10">
            {message.content}
          </div>
          {/* Hover actions */}
          <div className="absolute -bottom-7 right-0 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="size-6 text-zinc-600 hover:text-zinc-300"
              title="Copy"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Assistant message
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="group flex gap-3"
    >
      {/* Avatar */}
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-gradient-to-br from-violet-600/20 to-cyan-600/20">
        <Code2 className="size-3.5 text-violet-400" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {isAssistantStreaming ? (
          <ThinkingIndicator />
        ) : (
          <div className="border-l-2 border-cyan-500/30 pl-3">
            <div className="prose-chat">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match && !className;

                    if (isInline) {
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }

                    const language = match ? match[1] : '';
                    const codeStr = String(children).replace(/\n$/, '');

                    return <CodeBlock language={language} code={codeStr} />;
                  },
                  a({ href, children }) {
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
            {/* Streaming cursor */}
            {isStreaming && message.content && (
              <span className="animate-blink-cursor ml-0.5 inline-block size-2 rounded-full bg-cyan-400" />
            )}
          </div>
        )}

        {/* Hover actions */}
        {!isAssistantStreaming && message.content && (
          <div className="mt-1.5 flex items-center gap-1 pl-5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="size-6 text-zinc-600 hover:text-zinc-300"
              title="Copy"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </Button>
            {onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRegenerate}
                className="size-6 text-zinc-600 hover:text-zinc-300"
                title="Regenerate"
              >
                <RefreshCw className="size-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
