'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, RefreshCw, Brain, ChevronDown, ChevronRight, Sparkles, Shield, ShieldCheck, Zap, ShieldAlert, Heart, MessageCircle, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/chat/code-block';
import { ImageMessage } from '@/components/chat/image-message';
import type { Message as MessageType } from '@/stores/chat-store';

interface MessageProps {
  message: MessageType;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

// ─── Agent metadata for the committee ─────────────────────────────────────────

const COMMITTEE_AGENTS = [
  {
    id: 'architect',
    label: 'Architect',
    icon: Sparkles,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    dot: 'bg-blue-400',
    desc: 'Designing & coding',
  },
  {
    id: 'security',
    label: 'Security',
    icon: ShieldAlert,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    dot: 'bg-red-400',
    desc: 'Auditing vulnerabilities',
  },
  {
    id: 'optimizer',
    label: 'Optimizer',
    icon: Zap,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    dot: 'bg-amber-400',
    desc: 'Optimizing performance',
  },
];

// ─── Committee Deliberation Component — refined ────────────────────────────────

function CommitteeDeliberation({ agentStatuses }: { agentStatuses: Record<string, string> }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="my-4"
    >
      {/* Header — minimal */}
      <div className="flex items-center gap-2 mb-3">
        <Shield className="size-4 text-primary/60" />
        <span className="text-[13px] font-medium text-foreground/60">Committee deliberating</span>
        <span className="flex gap-0.5 ml-1">
          <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary/50" style={{ animationDelay: '0ms' }} />
          <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary/50" style={{ animationDelay: '200ms' }} />
          <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary/50" style={{ animationDelay: '400ms' }} />
        </span>
      </div>

      {/* Agent Cards — refined, less visual noise */}
      <div className="grid grid-cols-3 gap-1.5">
        {COMMITTEE_AGENTS.map((agent, idx) => {
          const status = agentStatuses[agent.id] || 'idle';
          const isActive = status === 'working';
          const isDone = status === 'done';
          const Icon = agent.icon;

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.08 }}
              className={`rounded-lg border p-2.5 text-center transition-all duration-500 ${
                isDone
                  ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                  : isActive
                    ? `border-foreground/10 ${agent.bg}`
                    : 'border-[var(--border-subtle)] bg-transparent'
              }`}
            >
              {/* Agent icon — smaller */}
              <div className={`inline-flex items-center justify-center size-6 rounded-md ${agent.bg} mb-1.5`}>
                <Icon className={`size-3 ${agent.color} ${isActive ? 'animate-pulse' : ''}`} />
              </div>

              {/* Agent name */}
              <div className={`text-[11px] font-medium ${isDone ? 'text-emerald-400' : isActive ? agent.color : 'text-foreground/30'}`}>
                {agent.label}
              </div>

              {/* Status */}
              <div className="text-[10px] text-foreground/20 mt-0.5">
                {isDone ? 'Complete' : isActive ? agent.desc : 'Waiting...'}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Thinking Bubble ──────────────────────────────────────────────────────────

function ThinkingBubble({ thinking, isThinking }: { thinking: string; isThinking?: boolean }) {
  const [expanded, setExpanded] = useState(isThinking ?? false);

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] transition-colors hover:bg-foreground/[0.03]"
      >
        {expanded ? (
          <ChevronDown className="size-3 text-primary/50" />
        ) : (
          <ChevronRight className="size-3 text-primary/50" />
        )}
        <Brain className="size-3 text-primary/50" />
        <span className="text-primary/50">
          {isThinking ? 'Thinking...' : 'Reasoning'}
        </span>
        {isThinking && (
          <span className="flex gap-0.5 ml-1">
            <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary/50" style={{ animationDelay: '0ms' }} />
            <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary/50" style={{ animationDelay: '200ms' }} />
            <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary/50" style={{ animationDelay: '400ms' }} />
          </span>
        )}
      </button>
      <AnimatePresence>
        {expanded && thinking && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-2 mt-1 rounded-lg border border-[var(--border-subtle)] bg-foreground/[0.02] p-3">
              <div className="prose-thinking text-xs leading-relaxed text-[var(--text-tertiary)]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {thinking}
                </ReactMarkdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Thinking Indicator ───────────────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 px-1">
      <Brain className="size-3.5 text-primary/40 animate-pulse" />
      <span className="text-[13px] text-foreground/30">Thinking</span>
      <span className="flex gap-0.5">
        <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary/40" style={{ animationDelay: '0ms' }} />
        <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary/40" style={{ animationDelay: '200ms' }} />
        <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary/40" style={{ animationDelay: '400ms' }} />
      </span>
    </div>
  );
}

// ─── Main Message Component ───────────────────────────────────────────────────

export function Message({ message, isStreaming, onRegenerate }: MessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isAssistantStreaming = isStreaming && message.role === 'assistant' && !message.content && !message.isDeliberating;

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
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex justify-end"
      >
        <div className="group relative max-w-[85%] sm:max-w-[70%]">
          {/* User message — subtle, not heavy gradient */}
          <div className="rounded-2xl rounded-tr-sm bg-[var(--surface-secondary)] px-4 py-2.5 text-[14px] leading-relaxed text-foreground/80">
            {message.content}
          </div>
          <div className="absolute -bottom-6 right-0 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="size-5 text-foreground/20 hover:text-foreground/50"
              title="Copy"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Assistant message — clean, no border-l noise
  const hasImages = message.images && message.images.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="group flex gap-3"
    >
      {/* Avatar — smaller, subtle */}
      <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <ShieldCheck className="size-3 text-primary/50" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {isAssistantStreaming ? (
          <ThinkingIndicator />
        ) : (
          <>
            {/* Committee deliberation animation (code mode only) */}
            <AnimatePresence>
              {message.isDeliberating && message.agentStatuses && (
                <CommitteeDeliberation agentStatuses={message.agentStatuses} />
              )}
            </AnimatePresence>

            {/* Thinking/reasoning (legacy) */}
            {message.thinking && !message.isDeliberating && (
              <ThinkingBubble thinking={message.thinking} isThinking={message.isThinking} />
            )}

            {/* Image gallery (iluma mode) */}
            {hasImages && (
              <ImageMessage images={message.images!} isStreaming={isStreaming && !message.content} />
            )}

            {/* Final answer content — clean, no left border */}
            {message.content && !message.isDeliberating && (
              <div className="pl-0">
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
                  <span className="animate-blink-cursor ml-0.5 inline-block size-1.5 rounded-full bg-primary/50" />
                )}
              </div>
            )}

            {/* Still thinking but no content yet */}
            {isStreaming && message.isThinking && !message.content && !message.isDeliberating && (
              <ThinkingIndicator />
            )}
          </>
        )}

        {/* Hover actions — minimal */}
        {!isAssistantStreaming && message.content && !message.isDeliberating && (
          <div className="mt-1.5 flex items-center gap-0.5 pl-0 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="size-5 text-foreground/15 hover:text-foreground/40"
              title="Copy"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </Button>
            {onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRegenerate}
                className="size-5 text-foreground/15 hover:text-foreground/40"
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
