'use client';

import { motion } from 'framer-motion';
import { useChatStore, ChatMode } from '@/stores/chat-store';
import { Code2, Image, Heart, MessageCircle } from 'lucide-react';

const MODES: { key: ChatMode; label: string; icon: typeof Code2; color: string; activeColor: string; description: string }[] = [
  {
    key: 'code',
    label: 'Code',
    icon: Code2,
    color: 'text-foreground/25',
    activeColor: 'text-violet-400',
    description: 'AI coding agents',
  },
  {
    key: 'iluma',
    label: 'iluma',
    icon: Image,
    color: 'text-foreground/25',
    activeColor: 'text-emerald-400',
    description: 'Create images',
  },
  {
    key: 'health',
    label: 'Health',
    icon: Heart,
    color: 'text-foreground/25',
    activeColor: 'text-rose-400',
    description: 'Health & wellness',
  },
  {
    key: 'chat',
    label: 'Chat',
    icon: MessageCircle,
    color: 'text-foreground/25',
    activeColor: 'text-blue-400',
    description: 'General assistant',
  },
];

export function ModeSelector() {
  const { activeMode, setActiveMode } = useChatStore();

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-[var(--surface-secondary)]/50 p-0.5 border border-[var(--border-subtle)]">
      {MODES.map((mode) => {
        const isActive = activeMode === mode.key;
        const Icon = mode.icon;

        return (
          <motion.button
            key={mode.key}
            onClick={() => setActiveMode(mode.key)}
            className={`relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-all ${
              isActive
                ? `${mode.activeColor} bg-[var(--surface-primary)] shadow-sm`
                : `${mode.color} hover:text-foreground/50`
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            title={mode.description}
          >
            <Icon className="size-3.5" />
            <span>{mode.label}</span>
            {isActive && (
              <motion.div
                layoutId="mode-indicator"
                className="absolute inset-0 rounded-md border border-current/10"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
