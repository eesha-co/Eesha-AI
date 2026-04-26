'use client';

export function SmokyBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* x.ai-style smoky light from top-right — breathing animation */}
      <div
        className="absolute top-[-10%] right-[-5%] w-[60%] h-[60%] animate-breathe"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(160, 195, 255, 0.07) 0%, rgba(120, 165, 255, 0.04) 30%, rgba(80, 130, 255, 0.015) 60%, transparent 80%)',
        }}
      />

      {/* Secondary light from mid-right — slower breathing */}
      <div
        className="absolute bottom-[10%] right-[-5%] w-[40%] h-[40%] animate-breathe-slow"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(100, 160, 255, 0.05) 0%, rgba(70, 120, 255, 0.025) 40%, transparent 70%)',
        }}
      />

      {/* Subtle ambient glow bottom-left */}
      <div
        className="absolute bottom-[-15%] left-[-10%] w-[50%] h-[50%]"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(100, 80, 200, 0.03) 0%, transparent 60%)',
        }}
      />

      {/* Centered logo watermark — HUGE */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          {/* Rotating glow ring — spins around the logo */}
          <div className="absolute inset-0 animate-[spin_25s_linear_infinite]">
            {/* Top glow spot */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35vmin] h-[35vmin] rounded-full blur-[80px]"
              style={{
                background: 'radial-gradient(circle, rgba(100, 170, 255, 0.12) 0%, rgba(80, 140, 255, 0.05) 40%, transparent 70%)',
              }}
            />
            {/* Bottom glow spot */}
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-[30vmin] h-[30vmin] rounded-full blur-[80px]"
              style={{
                background: 'radial-gradient(circle, rgba(130, 180, 255, 0.1) 0%, rgba(100, 150, 255, 0.04) 40%, transparent 70%)',
              }}
            />
            {/* Left glow spot */}
            <div
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[28vmin] h-[28vmin] rounded-full blur-[80px]"
              style={{
                background: 'radial-gradient(circle, rgba(140, 190, 255, 0.09) 0%, rgba(110, 160, 255, 0.035) 40%, transparent 70%)',
              }}
            />
            {/* Right glow spot */}
            <div
              className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-[32vmin] h-[32vmin] rounded-full blur-[80px]"
              style={{
                background: 'radial-gradient(circle, rgba(120, 175, 255, 0.11) 0%, rgba(90, 145, 255, 0.045) 40%, transparent 70%)',
              }}
            />
          </div>

          {/* The actual logo — HUGE and semi-transparent */}
          <img
            src="/logo-full.webp"
            alt=""
            className="w-[50vmin] h-[50vmin] object-contain opacity-[0.07]"
            style={{ filter: 'brightness(1.2) contrast(1.1)' }}
          />
        </div>
      </div>
    </div>
  );
}
