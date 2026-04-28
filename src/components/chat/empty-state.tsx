'use client';

import { motion } from 'framer-motion';
import { Code2, Zap, Globe, BookOpen, Rocket, Lightbulb, Cpu, GitBranch } from 'lucide-react';

interface EmptyStateProps {
  onSuggestionClick?: (text: string) => void;
}

const suggestions = [
  {
    icon: Code2,
    title: 'Build a web app',
    description: 'Create a full-stack application from scratch',
    prompt: 'Build a modern web application with Next.js, including a landing page and API routes',
    gradient: 'from-violet-500/20 to-purple-500/20',
    iconColor: 'text-violet-500',
    borderHover: 'hover:border-violet-500/30',
  },
  {
    icon: Zap,
    title: 'Debug my code',
    description: 'Find and fix errors in your codebase',
    prompt: 'Help me debug a TypeError: Cannot read properties of undefined in my React component',
    gradient: 'from-cyan-500/20 to-blue-500/20',
    iconColor: 'text-cyan-500',
    borderHover: 'hover:border-cyan-500/30',
  },
  {
    icon: Globe,
    title: 'Build an API',
    description: 'Design and implement REST or GraphQL APIs',
    prompt: 'Design and build a REST API with authentication and CRUD operations',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    iconColor: 'text-emerald-500',
    borderHover: 'hover:border-emerald-500/30',
  },
  {
    icon: BookOpen,
    title: 'Explain code',
    description: 'Understand complex code and algorithms',
    prompt: 'Explain how React Server Components work under the hood',
    gradient: 'from-amber-500/20 to-orange-500/20',
    iconColor: 'text-amber-500',
    borderHover: 'hover:border-amber-500/30',
  },
];

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 relative z-10">
      {/* Greeting — the logo watermark is visible in the background behind this */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="text-center mb-6"
      >
        <h2 className="text-2xl sm:text-3xl font-light text-foreground/90 mb-2">
          What do you want to build?
        </h2>
        <p className="text-sm text-[var(--text-tertiary)] max-w-md mx-auto">
          Eesha AI can write, debug, and deploy code. Ask anything — from quick scripts to full applications.
        </p>
      </motion.div>

      {/* Model badge — like z.ai's feature chips */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mb-8 flex items-center gap-2 rounded-full border border-border/50 bg-[var(--surface-secondary)]/60 backdrop-blur-sm px-4 py-1.5"
      >
        <Cpu className="size-3 text-cyan-500" />
        <span className="text-xs text-[var(--text-tertiary)]">Kimi K2.5</span>
        <span className="text-[var(--text-tertiary)]/30">|</span>
        <GitBranch className="size-3 text-violet-500" />
        <span className="text-xs text-[var(--text-tertiary)]">Thinking Mode</span>
        <span className="text-[var(--text-tertiary)]/30">|</span>
        <Rocket className="size-3 text-primary/60" />
        <span className="text-xs text-[var(--text-tertiary)]">NVIDIA H100s</span>
      </motion.div>

      {/* Suggestion Cards */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg"
      >
        {suggestions.map((suggestion, index) => {
          const Icon = suggestion.icon;
          return (
            <motion.button
              key={suggestion.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.35 + index * 0.08 }}
              onClick={() => onSuggestionClick?.(suggestion.prompt)}
              className={`suggestion-card group relative rounded-xl border border-border p-4 text-left transition-all duration-200 ${suggestion.borderHover} hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5`}
            >
              <div className={`mb-2.5 flex size-8 items-center justify-center rounded-lg bg-gradient-to-br ${suggestion.gradient} border border-border`}>
                <Icon className={`size-4 ${suggestion.iconColor}`} />
              </div>
              <h3 className="text-sm font-medium text-foreground mb-0.5 group-hover:text-primary transition-colors">
                {suggestion.title}
              </h3>
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                {suggestion.description}
              </p>
            </motion.button>
          );
        })}
      </motion.div>

      {/* Bottom hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="mt-8 flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]"
      >
        <Rocket className="size-3 text-primary/50" />
        <span>Powered by Kimi K2.5 via NVIDIA API</span>
        <span className="mx-1">·</span>
        <Lightbulb className="size-3 text-amber-500/50" />
        <span>Thinking Mode enabled</span>
      </motion.div>
    </div>
  );
}
