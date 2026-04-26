'use client';

import { motion } from 'framer-motion';
import { Code2, Bug, FileCode, Lightbulb, Cpu, Braces, GitBranch, Terminal } from 'lucide-react';

const suggestions = [
  {
    icon: Code2,
    title: 'Build a REST API',
    description: 'Create a full REST API with auth, validation, and error handling',
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    icon: Bug,
    title: 'Debug my code',
    description: 'Find and fix bugs with detailed explanations and solutions',
    gradient: 'from-rose-500 to-pink-600',
  },
  {
    icon: FileCode,
    title: 'Refactor code',
    description: 'Improve performance, readability, and maintainability',
    gradient: 'from-cyan-500 to-blue-600',
  },
  {
    icon: Lightbulb,
    title: 'Explain a concept',
    description: 'Break down complex programming topics with examples',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    icon: Braces,
    title: 'Design a system',
    description: 'Architect scalable systems with clear component diagrams',
    gradient: 'from-emerald-500 to-green-600',
  },
  {
    icon: Terminal,
    title: 'Write a CLI tool',
    description: 'Build command-line tools with argument parsing and output',
    gradient: 'from-indigo-500 to-violet-600',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] } },
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
      className="flex flex-1 flex-col items-center justify-center px-4 py-8"
    >
      {/* Animated Logo */}
      <motion.div variants={itemVariants} className="animate-subtle-float mb-6">
        <div className="relative">
          {/* Outer glow */}
          <div className="absolute inset-0 -m-8 rounded-full bg-gradient-to-r from-violet-500/15 to-cyan-500/15 blur-3xl" />
          {/* Inner glow */}
          <div className="absolute inset-0 -m-3 rounded-full bg-gradient-to-r from-violet-500/25 to-cyan-500/25 blur-xl" />

          {/* Logo */}
          <div className="animate-glow-pulse relative flex size-20 items-center justify-center rounded-2xl border border-white/[0.1] bg-gradient-to-br from-violet-600/20 to-cyan-600/20 shadow-2xl shadow-violet-500/20 backdrop-blur-sm overflow-hidden">
            <img src="/logo.svg" alt="Eesha AI" className="size-14" />
          </div>
        </div>
      </motion.div>

      {/* Heading */}
      <motion.h2
        variants={itemVariants}
        className="mb-2 text-3xl font-bold text-white"
      >
        How can I help you code?
      </motion.h2>

      <motion.p
        variants={itemVariants}
        className="mb-8 max-w-md text-center text-sm text-zinc-500"
      >
        Eesha AI with thinking mode — powered by Kimi K2.5 on NVIDIA H100s. Write, debug, explain, and deploy code with deep reasoning.
      </motion.p>

      {/* Model badge */}
      <motion.div
        variants={itemVariants}
        className="mb-8 flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-1.5"
      >
        <Cpu className="size-3 text-cyan-400" />
        <span className="text-xs text-zinc-400">1.1T Parameters</span>
        <span className="text-zinc-700">|</span>
        <GitBranch className="size-3 text-violet-400" />
        <span className="text-xs text-zinc-400">384 MoE Experts</span>
        <span className="text-zinc-700">|</span>
        <span className="text-xs text-zinc-400">262K Context</span>
      </motion.div>

      {/* Suggestion cards */}
      <motion.div
        variants={containerVariants}
        className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {suggestions.map((suggestion) => (
          <motion.button
            key={suggestion.title}
            variants={itemVariants}
            onClick={() => onSuggestionClick?.(suggestion.title)}
            className="suggestion-card group rounded-xl p-4 text-left transition-all duration-200 hover:bg-white/[0.04] hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="mb-3 flex items-center gap-2.5">
              <div className={`flex size-8 items-center justify-center rounded-lg bg-gradient-to-br ${suggestion.gradient} shadow-lg opacity-80 transition-opacity group-hover:opacity-100`}>
                <suggestion.icon className="size-4 text-white" />
              </div>
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
