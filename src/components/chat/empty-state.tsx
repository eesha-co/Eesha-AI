'use client';

interface EmptyStateProps {
  onSuggestionClick?: (text: string) => void;
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <h2 className="text-2xl font-light text-foreground/80 mb-2">What do you want to know?</h2>
      <p className="text-sm text-[var(--text-tertiary)]">Eesha AI can help you write, debug, and understand code.</p>
    </div>
  );
}
