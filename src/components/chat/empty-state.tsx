'use client';

import { motion } from 'framer-motion';
import { useChatStore, ChatMode } from '@/stores/chat-store';
import { Code2, Image, Heart, MessageCircle, Sparkles, Palette, Stethoscope, Lightbulb } from 'lucide-react';

interface EmptyStateProps {
  onSuggestionClick?: (text: string, mode?: string) => void;
}

type SuggestionSet = {
  title: string;
  prompt: string;
  icon: typeof Code2;
  mode: ChatMode;
};

// ─── Mode-specific suggestion sets ─────────────────────────────────────────────
const MODE_SUGGESTIONS: Record<ChatMode, { heading: string; tagline: string; items: SuggestionSet[] }> = {
  code: {
    heading: 'What do you want to build?',
    tagline: 'Three AI agents. One answer.',
    items: [
      { title: 'Build a web app', prompt: 'Build a modern web application with Next.js, including a landing page and API routes', icon: Code2, mode: 'code' },
      { title: 'Debug my code', prompt: 'Help me debug a TypeError: Cannot read properties of undefined in my React component', icon: Sparkles, mode: 'code' },
      { title: 'Build an API', prompt: 'Design and build a REST API with authentication and CRUD operations', icon: Code2, mode: 'code' },
      { title: 'Explain code', prompt: 'Explain how React Server Components work under the hood', icon: Lightbulb, mode: 'code' },
    ],
  },
  iluma: {
    heading: 'What do you want to create?',
    tagline: 'Powered by Flux. No restrictions.',
    items: [
      { title: 'Create a logo', prompt: 'A modern, minimalist tech startup logo with gradient colors and clean typography', icon: Palette, mode: 'iluma' },
      { title: 'Design a character', prompt: 'A futuristic cyberpunk character with neon armor, standing in a rain-soaked city street', icon: Image, mode: 'iluma' },
      { title: 'Generate landscape', prompt: 'A breathtaking mountain landscape at golden hour with misty valleys and ancient trees', icon: Image, mode: 'iluma' },
      { title: 'Abstract art', prompt: 'Vibrant abstract digital art with flowing shapes, deep purples and electric blues', icon: Palette, mode: 'iluma' },
    ],
  },
  health: {
    heading: 'How can I help your wellness?',
    tagline: 'Evidence-based health guidance.',
    items: [
      { title: 'Nutrition advice', prompt: 'What are the best foods to eat for sustained energy throughout the day?', icon: Stethoscope, mode: 'health' },
      { title: 'Mental health tips', prompt: 'What are some effective techniques for managing daily stress and anxiety?', icon: Heart, mode: 'health' },
      { title: 'Exercise plan', prompt: 'Create a beginner-friendly weekly exercise plan for someone who works at a desk all day', icon: Heart, mode: 'health' },
      { title: 'Sleep better', prompt: 'What are the most effective strategies for improving sleep quality?', icon: Stethoscope, mode: 'health' },
    ],
  },
  chat: {
    heading: 'What would you like to discuss?',
    tagline: 'Your everyday AI companion.',
    items: [
      { title: 'Tell me a story', prompt: 'Tell me a short, creative story about an AI discovering emotions for the first time', icon: MessageCircle, mode: 'chat' },
      { title: 'Help me brainstorm', prompt: 'Help me brainstorm innovative business ideas for a tech startup in 2025', icon: Lightbulb, mode: 'chat' },
      { title: 'Explain a concept', prompt: 'Explain quantum computing in simple terms that anyone can understand', icon: Lightbulb, mode: 'chat' },
      { title: 'Write an email', prompt: 'Help me write a professional email declining a job offer politely while keeping the door open', icon: MessageCircle, mode: 'chat' },
    ],
  },
};

// ─── Mixed suggestions for home page (no active conversation) ──────────────────
const MIXED_SUGGESTIONS: SuggestionSet[] = [
  { title: 'Build a web app', prompt: 'Build a modern web application with Next.js, including a landing page and API routes', icon: Code2, mode: 'code' },
  { title: 'Debug my code', prompt: 'Help me debug a TypeError: Cannot read properties of undefined in my React component', icon: Sparkles, mode: 'code' },
  { title: 'Create a logo', prompt: 'A modern, minimalist tech startup logo with gradient colors and clean typography', icon: Palette, mode: 'iluma' },
  { title: 'Design a character', prompt: 'A futuristic cyberpunk character with neon armor, standing in a rain-soaked city street', icon: Image, mode: 'iluma' },
  { title: 'Nutrition advice', prompt: 'What are the best foods to eat for sustained energy throughout the day?', icon: Stethoscope, mode: 'health' },
  { title: 'Exercise plan', prompt: 'Create a beginner-friendly weekly exercise plan for someone who works at a desk all day', icon: Heart, mode: 'health' },
  { title: 'Tell me a story', prompt: 'Tell me a short, creative story about an AI discovering emotions for the first time', icon: MessageCircle, mode: 'chat' },
  { title: 'Help me brainstorm', prompt: 'Help me brainstorm innovative business ideas for a tech startup in 2025', icon: Lightbulb, mode: 'chat' },
];

const MODE_BADGE_COLORS: Record<ChatMode, string> = {
  code: 'text-violet-400 bg-violet-400/10',
  iluma: 'text-emerald-400 bg-emerald-400/10',
  health: 'text-rose-400 bg-rose-400/10',
  chat: 'text-amber-400 bg-amber-400/10',
};

const MODE_SHORT_LABELS: Record<ChatMode, string> = {
  code: 'Code',
  iluma: 'iluma',
  health: 'Health',
  chat: 'Chat',
};

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  const { activeMode, activeConversationId } = useChatStore();

  // Show mixed suggestions on home page (no active conversation)
  // Show mode-specific suggestions when a mode is selected
  const isHomePage = !activeConversationId;
  const showMixed = isHomePage;

  const config = MODE_SUGGESTIONS[activeMode];
  const suggestions = showMixed ? MIXED_SUGGESTIONS : config.items;
  const heading = showMixed ? 'What can I help you with?' : config.heading;
  const tagline = showMixed ? 'Choose a mode or start typing' : config.tagline;

  const handleClick = (suggestion: SuggestionSet) => {
    onSuggestionClick?.(suggestion.prompt, suggestion.mode);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 relative" style={{ zIndex: 2 }}>
      <div className="flex flex-col items-center w-full max-w-lg">

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-2"
        >
          <h2 className="text-3xl sm:text-4xl font-light text-[var(--text-primary)] tracking-tight">
            {heading}
          </h2>
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="text-[13px] text-[var(--text-tertiary)] mb-10 tracking-wide"
        >
          {tagline}
        </motion.p>

        {/* Suggestion chips — grid layout */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className={`grid w-full ${showMixed ? 'grid-cols-2 sm:grid-cols-4 gap-2' : 'grid-cols-2 gap-2.5'}`}
        >
          {suggestions.map((suggestion, index) => {
            const Icon = suggestion.icon;
            return (
              <motion.button
                key={`${suggestion.mode}-${suggestion.title}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + index * 0.04 }}
                onClick={() => handleClick(suggestion)}
                className="group flex items-center gap-2 rounded-xl border border-[var(--border-medium)] bg-[var(--surface-secondary)]/40 backdrop-blur-sm px-3 py-3 text-[13px] text-[var(--text-secondary)] transition-all duration-200 hover:bg-[var(--surface-secondary)]/70 hover:text-[var(--text-primary)] hover:border-[var(--border)]"
              >
                <Icon className="size-3.5 shrink-0 opacity-50 group-hover:opacity-80 transition-opacity" />
                <span className="truncate">{suggestion.title}</span>
                {/* Show mode badge in mixed mode */}
                {showMixed && (
                  <span className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium ${MODE_BADGE_COLORS[suggestion.mode]}`}>
                    {MODE_SHORT_LABELS[suggestion.mode]}
                  </span>
                )}
              </motion.button>
            );
          })}
        </motion.div>

      </div>
    </div>
  );
}
