'use client';

import { motion } from 'framer-motion';
import { Code2, Bug, FileCode, Lightbulb } from 'lucide-react';

const suggestions = [
  {
    icon: Code2,
    title: 'Build a REST API',
    description: 'Create a full REST API with authentication and validation',
  },
  {
    icon: Bug,
    title: 'Debug my code',
    description: 'Find and fix bugs with detailed explanations',
  },
  {
    icon: FileCode,
    title: 'Refactor code',
    description: 'Improve performance and readability of your code',
  },
  {
    icon: Lightbulb,
    title: 'Explain a concept',
    description: 'Break down complex programming concepts clearly',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

interface EmptyStateProps {
  onSuggestionClick?: (text: string) => void;
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-1 flex-col items-center justify-center px-4 py-12"
    >
      {/* Animated Logo */}
      <motion.div
        variants={itemVariants}
        className="animate-subtle-float mb-8"
      >
        <div className="relative">
          {/* Glow background */}
          <div className="absolute inset-0 -m-4 rounded-full bg-gradient-to-r from-violet-500/20 to-cyan-500/20 blur-2xl" />
          {/* Logo circle */}
          <div className="animate-glow-pulse relative flex size-20 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet-600/20 to-cyan-600/20 backdrop-blur-sm">
            <Code2 className="size-10 text-violet-300" />
          </div>
        </div>
      </motion.div>

      {/* Heading */}
      <motion.h2
        variants={itemVariants}
        className="mb-2 text-2xl font-semibold text-white"
      >
        How can I help you code today?
      </motion.h2>

      <motion.p
        variants={itemVariants}
        className="mb-8 text-sm text-zinc-500"
      >
        Ask me to write, debug, explain, or review any code
      </motion.p>

      {/* Suggestion cards */}
      <motion.div
        variants={containerVariants}
        className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {suggestions.map((suggestion) => (
          <motion.button
            key={suggestion.title}
            variants={itemVariants}
            onClick={() => onSuggestionClick?.(suggestion.title)}
            className="suggestion-card group rounded-xl p-4 text-left transition-colors duration-200 hover:bg-white/[0.04]"
          >
            <div className="mb-2 flex items-center gap-2">
              <suggestion.icon className="size-4 text-violet-400 transition-colors group-hover:text-cyan-400" />
              <span className="text-sm font-medium text-zinc-200 transition-colors group-hover:text-white">
                {suggestion.title}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500 transition-colors group-hover:text-zinc-400">
              {suggestion.description}
            </p>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  );
}
