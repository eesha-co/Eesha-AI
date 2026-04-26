'use client';

import { motion } from 'framer-motion';

interface EmptyStateProps {
  onSuggestionClick?: (text: string) => void;
}

const suggestions = [
  { icon: '✦', text: 'Build a responsive landing page', desc: 'with modern design' },
  { icon: '⟐', text: 'Debug my Python script', desc: 'find and fix errors' },
  { icon: '⬡', text: 'Create a REST API', desc: 'with authentication' },
  { icon: '◈', text: 'Explain this code', desc: 'step by step' },
];

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      {/* Animated logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative mb-8"
      >
        {/* Glow behind logo */}
        <div className="absolute inset-0 -m-8 rounded-full bg-gradient-to-br from-violet-500/10 via-cyan-500/5 to-violet-500/10 blur-2xl" />
        <img
          src="/logo-transparent.png"
          alt="Eesha AI"
          className="relative size-28 sm:size-32 object-contain"
        />
      </motion.div>

      {/* Title */}
      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="mb-2 text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-foreground"
      >
        What do you want to build?
      </motion.h2>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="mb-8 sm:mb-10 text-xs sm:text-sm text-muted-foreground text-center max-w-xs sm:max-w-sm"
      >
        Eesha AI helps you write, debug, and deploy code with intelligence.
      </motion.p>

      {/* Suggestion cards */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        className="grid w-full max-w-lg grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {suggestions.map((s, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.07, duration: 0.4 }}
            onClick={() => onSuggestionClick?.(s.text + ' ' + s.desc)}
            className="group suggestion-card flex items-start gap-3 rounded-xl border border-border bg-card p-3 sm:p-4 text-left transition-all duration-200 hover:border-primary/20 hover:shadow-md hover:shadow-primary/5"
          >
            <span className="mt-0.5 text-base text-primary/70">{s.icon}</span>
            <div>
              <span className="block text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                {s.text}
              </span>
              <span className="block text-xs text-muted-foreground">{s.desc}</span>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
