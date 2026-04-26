'use client';

export function SmokyBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* x.ai-style smoky light sweep from top-right */}
      <div
        className="absolute top-[-20%] right-[-10%] w-[70%] h-[70%] animate-breathe"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(120, 160, 255, 0.06) 0%, rgba(90, 130, 255, 0.03) 30%, rgba(60, 100, 255, 0.01) 60%, transparent 80%)',
        }}
      />

      {/* Secondary light from mid-right — slower breathing */}
      <div
        className="absolute bottom-[5%] right-[-8%] w-[50%] h-[50%] animate-breathe-slow"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(100, 140, 255, 0.04) 0%, rgba(70, 110, 255, 0.02) 40%, transparent 70%)',
        }}
      />

      {/* Subtle ambient glow bottom-left */}
      <div
        className="absolute bottom-[-20%] left-[-15%] w-[55%] h-[55%]"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(124, 58, 237, 0.03) 0%, transparent 60%)',
        }}
      />

      {/* Light sweep animation - like x.ai's moving light */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute top-0 right-0 w-[200%] h-[40%] opacity-[0.03]"
          style={{
            background: 'linear-gradient(-15deg, transparent 40%, rgba(150, 180, 255, 0.8) 50%, transparent 60%)',
            animation: 'light-sweep 12s ease-in-out infinite',
          }}
        />
      </div>

      {/* ===== HUGE centered logo watermark ===== */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          {/* Rotating glow ring — animated blue glow circling the logo */}
          <div className="absolute inset-0 animate-logo-glow-spin">
            {/* Top glow spot */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[30%] w-[40vmin] h-[40vmin] rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(100, 160, 255, 0.15) 0%, rgba(70, 130, 255, 0.06) 40%, transparent 70%)',
                filter: 'blur(60px)',
              }}
            />
            {/* Bottom glow spot */}
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[30%] w-[35vmin] h-[35vmin] rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(130, 170, 255, 0.12) 0%, rgba(100, 145, 255, 0.05) 40%, transparent 70%)',
                filter: 'blur(60px)',
              }}
            />
            {/* Left glow spot */}
            <div
              className="absolute left-0 top-1/2 -translate-x-[30%] -translate-y-1/2 w-[33vmin] h-[33vmin] rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(140, 180, 255, 0.11) 0%, rgba(110, 155, 255, 0.04) 40%, transparent 70%)',
                filter: 'blur(60px)',
              }}
            />
            {/* Right glow spot */}
            <div
              className="absolute right-0 top-1/2 translate-x-[30%] -translate-y-1/2 w-[37vmin] h-[37vmin] rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(110, 165, 255, 0.14) 0%, rgba(80, 135, 255, 0.055) 40%, transparent 70%)',
                filter: 'blur(60px)',
              }}
            />
          </div>

          {/* The actual logo — HUGE and semi-transparent */}
          <img
            src="/logo-transparent.png"
            alt=""
            className="w-[65vmin] h-[65vmin] object-contain opacity-[0.06] dark:opacity-[0.06] animate-pulse-soft"
            style={{ filter: 'brightness(1.1)' }}
          />
        </div>
      </div>
    </div>
  );
}
