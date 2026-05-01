'use client';

import { useEffect, useRef } from 'react';

interface LogoWatermarkProps {
  /** Opacity of the logo (0-1). Default: 0.08 */
  opacity?: number;
  /** Size as fraction of container. Default: 0.4 (40%) */
  sizeFraction?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * A reusable semi-transparent logo watermark for empty states.
 * Used in Terminal, Workspace, CodeEditor, and other panels
 * when they have no content — like x.ai/z.ai's background branding.
 */
export function LogoWatermark({ opacity = 0.15, sizeFraction = 0.4, className = '' }: LogoWatermarkProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden ${className}`}
    >
      <img
        src="/splash-screen.png"
        alt=""
        className="object-contain animate-breathe-slow"
        style={{
          opacity,
          maxWidth: `${sizeFraction * 100}%`,
          maxHeight: `${sizeFraction * 100}%`,
          filter: 'brightness(1.8) saturate(1.4) drop-shadow(0 0 40px rgba(139, 92, 246, 0.15))',
        }}
      />
    </div>
  );
}
