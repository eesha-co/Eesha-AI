'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, RefreshCw, Brain, ChevronDown, ChevronRight, Sparkles, Shield, Eye, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/chat/code-block';
import type { Message as MessageType, AgentSection, AgentName } from '@/stores/chat-store';

interface MessageProps {
  message: MessageType;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

// ─── Agent metadata ───────────────────────────────────────────────────────────

const AGENT_META: Record<AgentName, { label: string; icon: typeof Sparkles; color: string; borderColor: string; bgColor: string; badgeBg: string; badgeText: string }> = {
  specialist: {
    label: 'Specialist',
    icon: Sparkles,
    color: 'text-blue-400',
    borderColor: 'border-blue-500/40',
    bgColor: 'bg-blue-500/[0.04]',
    badgeBg: 'bg-blue-500/15',
    badgeText: 'text-blue-400',
  },
  critic: {
    label: 'Critic',
    icon: Eye,
    color: 'text-amber-400',
    borderColor: 'border-amber-500/40',
    bgColor: 'bg-amber-500/[0.04]',
    badgeText: 'text-amber-400',
    badgeBg: 'bg-amber-500/15',
  },
  judge: {
    label: 'Judge — Final Answer',
    icon: Scale,
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/40',
    bgColor: 'bg-emerald-500/[0.04]',
    badgeText: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/15',
  },
};

// ─── Thinking Bubble ──────────────────────────────────────────────────────────

function ThinkingBubble({ thinking, isThinking, agentColor }: { thinking: string; isThinking?: boolean; agentColor: string }) {
  const [expanded, setExpanded] = useState(isThinking ?? false);

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-accent"
      >
        {expanded ? (
          <ChevronDown className={`size-3 ${agentColor}`} />
        ) : (
          <ChevronRight className={`size-3 ${agentColor}`} />
        )}
        <Brain className={`size-3 ${agentColor}`} />
        <span className={`${agentColor} opacity-80`}>
          {isThinking ? 'Thinking...' : 'Reasoning'}
        </span>
        {isThinking && (
          <span className="flex gap-0.5 ml-1">
            <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary" style={{ animationDelay: '0ms' }} />
            <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary" style={{ animationDelay: '200ms' }} />
            <span className="animate-thinking-dot inline-block size-1 rounded-full bg-primary" style={{ animationDelay: '400ms' }} />
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
            <div className="ml-2 mt-1 rounded-lg border border-primary/10 bg-primary/[0.03] p-3">
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

// ─── Agent Status Indicator ───────────────────────────────────────────────────

function AgentStatusIndicator({ agent, status }: { agent: AgentName; status: AgentSection['status'] }) {
  const meta = AGENT_META[agent];
  const Icon = meta.icon;

  if (status === 'done') return null;

  const isThinking = status === 'thinking';
  const isGenerating = status === 'generating';

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${meta.badgeBg} mb-3`}>
      <Icon className={`size-3.5 ${meta.color} ${isThinking ? 'animate-pulse' : ''}`} />
      <span className={`text-xs font-medium ${meta.badgeText}`}>
        {meta.label}
        {isThinking ? ' thinking...' : isGenerating ? ' responding...' : ''}
      </span>
      {(isThinking || isGenerating) && (
        <span className="flex gap-0.5 ml-1">
          <span className={`animate-thinking-dot inline-block size-1 rounded-full ${meta.color.replace('text-', 'bg-')}`} style={{ animationDelay: '0ms' }} />
          <span className={`animate-thinking-dot inline-block size-1 rounded-full ${meta.color.replace('text-', 'bg-')}`} style={{ animationDelay: '200ms' }} />
          <span className={`animate-thinking-dot inline-block size-1 rounded-full ${meta.color.replace('text-', 'bg-')}`} style={{ animationDelay: '400ms' }} />
        </span>
      )}
    </div>
  );
}

// ─── Single Agent Section ─────────────────────────────────────────────────────

function AgentSectionBlock({ section, isStreaming }: { section: AgentSection; isStreaming?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = AGENT_META[section.agent];
  const Icon = meta.icon;

  // Don't render empty sections that are still waiting
  if (section.status === 'waiting' && !section.content && !section.thinking) return null;

  // For the judge (final answer), don't collapse by default
  const isJudge = section.agent === 'judge';

  return (
    <div className={`rounded-lg border-l-2 ${meta.borderColor} ${meta.bgColor} pl-3 pr-1 py-2 mb-3`}>
      {/* Agent header */}
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => !isJudge && setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 group"
        >
          {!isJudge && (
            collapsed ? (
              <ChevronRight className="size-3 text-foreground/40" />
            ) : (
              <ChevronDown className="size-3 text-foreground/40" />
            )
          )}
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${meta.badgeBg}`}>
            <Icon className={`size-3 ${meta.color}`} />
            <span className={`text-[11px] font-semibold ${meta.badgeText}`}>{meta.label}</span>
          </div>
          {section.status !== 'done' && section.status !== 'waiting' && (
            <AgentStatusIndicator agent={section.agent} status={section.status} />
          )}
        </button>
      </div>

      {/* Agent thinking (collapsible) */}
      {section.thinking && !collapsed && (
        <ThinkingBubble
          thinking={section.thinking}
          isThinking={section.isThinking}
          agentColor={meta.color}
        />
      )}

      {/* Agent content */}
      {!collapsed && section.content && (
        <div className={isJudge ? 'prose-chat' : 'prose-chat text-sm opacity-90'}>
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
            {section.content}
          </ReactMarkdown>
          {/* Streaming cursor for active agent */}
          {isStreaming && (section.status === 'generating' || section.status === 'thinking') && section.content && (
            <span className={`animate-blink-cursor ml-0.5 inline-block size-2 rounded-full ${meta.color.replace('text-', 'bg-')}`} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pipeline Status Banner ───────────────────────────────────────────────────

function PipelineStatusBanner({ status, activeAgent }: { status: string | null; activeAgent: AgentName | null }) {
  if (!status || status === 'complete') return null;

  const getAgentMeta = () => {
    if (activeAgent) return AGENT_META[activeAgent];
    if (status === 'specialist') return AGENT_META.specialist;
    if (status === 'critic') return AGENT_META.critic;
    if (status === 'judge') return AGENT_META.judge;
    return null;
  };

  const meta = getAgentMeta();
  if (!meta) return null;

  const Icon = meta.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-white/5 dark:bg-white/[0.03] border border-white/5"
    >
      <Icon className={`size-4 ${meta.color} animate-pulse`} />
      <span className="text-xs text-foreground/60">Committee deliberating —</span>
      <span className={`text-xs font-medium ${meta.badgeText}`}>{meta.label}</span>
      <span className="text-xs text-foreground/40">is working...</span>
      <span className="flex gap-0.5 ml-1">
        <span className={`animate-thinking-dot inline-block size-1 rounded-full ${meta.color.replace('text-', 'bg-')}`} style={{ animationDelay: '0ms' }} />
        <span className={`animate-thinking-dot inline-block size-1 rounded-full ${meta.color.replace('text-', 'bg-')}`} style={{ animationDelay: '200ms' }} />
        <span className={`animate-thinking-dot inline-block size-1 rounded-full ${meta.color.replace('text-', 'bg-')}`} style={{ animationDelay: '400ms' }} />
      </span>
    </motion.div>
  );
}

// ─── Thinking Indicator (fallback for no agent sections) ──────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 px-1">
      <Brain className="size-4 text-primary animate-pulse" />
      <span className="text-sm text-muted-foreground">Thinking</span>
      <span className="flex gap-0.5">
        <span className="animate-thinking-dot inline-block size-1.5 rounded-full bg-primary" style={{ animationDelay: '0ms' }} />
        <span className="animate-thinking-dot inline-block size-1.5 rounded-full bg-primary" style={{ animationDelay: '200ms' }} />
        <span className="animate-thinking-dot inline-block size-1.5 rounded-full bg-primary" style={{ animationDelay: '400ms' }} />
      </span>
    </div>
  );
}

// ─── Main Message Component ───────────────────────────────────────────────────

export function Message({ message, isStreaming, onRegenerate }: MessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const hasAgentSections = message.agentSections && message.agentSections.length > 0;
  const isAssistantStreaming = isStreaming && message.role === 'assistant' && !message.content && !message.thinking && !hasAgentSections;

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
              className="size-6 text-muted-foreground hover:text-foreground"
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
      {/* Avatar — committee icon */}
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-border bg-gradient-to-br from-violet-600/20 to-cyan-600/20">
        <Shield className="size-4 text-primary" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {isAssistantStreaming ? (
          <ThinkingIndicator />
        ) : (
          <>
            {/* Pipeline status banner */}
            {isStreaming && message.pipelineStatus && (
              <PipelineStatusBanner status={message.pipelineStatus} activeAgent={message.activeAgent ?? null} />
            )}

            {/* Multi-agent sections */}
            {hasAgentSections && message.agentSections!.some(s => s.content || s.thinking) ? (
              <div className="space-y-0">
                {message.agentSections!.map((section) => (
                  <AgentSectionBlock
                    key={section.agent}
                    section={section}
                    isStreaming={isStreaming}
                  />
                ))}
              </div>
            ) : (
              <>
                {/* Legacy single-agent rendering (fallback) */}
                {message.thinking && (
                  <ThinkingBubble thinking={message.thinking} isThinking={message.isThinking} agentColor="text-primary" />
                )}

                {message.content && (
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
                    {isStreaming && message.content && (
                      <span className="animate-blink-cursor ml-0.5 inline-block size-2 rounded-full bg-cyan-500" />
                    )}
                  </div>
                )}

                {isStreaming && message.isThinking && !message.content && (
                  <ThinkingIndicator />
                )}
              </>
            )}
          </>
        )}

        {/* Hover actions */}
        {!isAssistantStreaming && message.content && (
          <div className="mt-1.5 flex items-center gap-1 pl-5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="size-6 text-muted-foreground hover:text-foreground"
              title="Copy"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </Button>
            {onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRegenerate}
                className="size-6 text-muted-foreground hover:text-foreground"
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
