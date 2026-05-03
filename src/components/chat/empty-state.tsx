'use client';

import { motion } from 'framer-motion';
import { useChatStore, ChatMode } from '@/stores/chat-store';
import { Code2, Image, Heart, MessageCircle, Sparkles, Palette, Stethoscope, Lightbulb } from 'lucide-react';

interface EmptyStateProps {
  onSuggestionClick?: (text: string) => void;
}

type SuggestionSet = {
  title: string;
  prompt: string;
  icon: typeof Code2;
};

const SUGGESTIONS: Record<ChatMode, { heading: string; tagline: string; items: SuggestionSet[] }> = {
  code: {
    heading: 'What do you want to build?',
    tagline: 'Three AI agents. One answer.',
    items: [
      { title: 'Build a web app', prompt: 'Build a modern web application with Next.js, including a landing page and API routes', icon: Code2 },
      { title: 'Debug my code', prompt: 'Help me debug a TypeError: Cannot read properties of undefined in my React component', icon: Sparkles },
      { title: 'Build an API', prompt: 'Design and build a REST API with authentication and CRUD operations', icon: Code2 },
      { title: 'Explain code', prompt: 'Explain how React Server Components work under the hood', icon: Lightbulb },
    ],
  },
  iluma: {
    heading: 'What do you want to create?',
    tagline: 'Powered by Flux. No restrictions.',
    items: [
      { title: 'Create a logo', prompt: 'A modern, minimalist tech startup logo with gradient colors and clean typography', icon: Palette },
      { title: 'Design a character', prompt: 'A futuristic cyberpunk character with neon armor, standing in a rain-soaked city street', icon: Image },
      { title: 'Generate landscape', prompt: 'A breathtaking mountain landscape at golden hour with misty valleys and ancient trees', icon: Image },
      { title: 'Abstract art', prompt: 'Vibrant abstract digital art with flowing shapes, deep purples and electric blues', icon: Palette },
    ],
  },
  health: {
    heading: 'How can I help your wellness?',
    tagline: 'Evidence-based health guidance.',
    items: [
      { title: 'Nutrition advice', prompt: 'What are the best foods to eat for sustained energy throughout the day?', icon: Stethoscope },
      { title: 'Mental health tips', prompt: 'What are some effective techniques for managing daily stress and anxiety?', icon: Heart },
      { title: 'Exercise plan', prompt: 'Create a beginner-friendly weekly exercise plan for someone who works at a desk all day', icon: Heart },
      { title: 'Sleep better', prompt: 'What are the most effective strategies for improving sleep quality?', icon: Stethoscope },
    ],
  },
  chat: {
    heading: 'What would you like to discuss?',
    tagline: 'Your everyday AI companion.',
    items: [
      { title: 'Tell me a story', prompt: 'Tell me a short, creative story about an AI discovering emotions for the first time', icon: MessageCircle },
      { title: 'Help me brainstorm', prompt: 'Help me brainstorm innovative business ideas for a tech startup in 2025', icon: Lightbulb },
      { title: 'Explain a concept', prompt: 'Explain quantum computing in simple terms that anyone can understand', icon: Lightbulb },
      { title: 'Write an email', prompt: 'Help me write a professional email declining a job offer politely while keeping the door open', icon: MessageCircle },
    ],
  },
};

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  const { activeMode } = useChatStore();
  const config = SUGGESTIONS[activeMode];

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 relative" style={{ zIndex: 2 }}>
      <div className="flex flex-col items-center w-full max-w-md">

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-2"
        >
          <h2 className="text-3xl sm:text-4xl font-extralight text-foreground/90 tracking-tight">
            {config.heading}
          </h2>
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="text-[13px] text-foreground/25 mb-10 tracking-wide"
        >
          {config.tagline}
        </motion.p>

        {/* Suggestion chips — 2x2 grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="grid grid-cols-2 gap-2.5 w-full"
        >
          {config.items.map((suggestion, index) => {
            const Icon = suggestion.icon;
            return (
              <motion.button
                key={suggestion.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + index * 0.06 }}
                onClick={() => onSuggestionClick?.(suggestion.prompt)}
                className="group flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 backdrop-blur-sm px-4 py-3.5 text-[13px] text-foreground/50 transition-all duration-200 hover:bg-[var(--surface-secondary)]/50 hover:text-foreground/80 hover:border-foreground/10"
              >
                <Icon className="size-3.5 shrink-0 opacity-50 group-hover:opacity-80 transition-opacity" />
                <span>{suggestion.title}</span>
              </motion.button>
            );
          })}
        </motion.div>

      </div>
    </div>
  );
}
