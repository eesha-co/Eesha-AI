'use client';

export function SmokyBackground() {
  return (
    <div className="pointer-events-none fixed inset-0" style={{ zIndex: 0 }} aria-hidden="true">
      {/* Base gradient — dark mode */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a12] via-[#0d0d18] to-[#08080e] dark:from-[#0a0a12] dark:via-[#0d0d18] dark:to-[#08080e]" />
      
      {/* Base gradient — light mode overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f0f5] via-[#ececf2] to-[#e5e5ed] dark:hidden" />
      
      {/* Subtle radial glow — top right (dark mode) */}
      <div className="hidden dark:block absolute -top-1/4 right-0 w-[800px] h-[800px] rounded-full bg-violet-600/[0.07] blur-[120px]" />
      {/* Subtle radial glow — top right (light mode) */}
      <div className="dark:hidden absolute -top-1/4 right-0 w-[800px] h-[800px] rounded-full bg-violet-600/[0.04] blur-[120px]" />
      
      {/* Subtle radial glow — bottom left (dark mode) */}
      <div className="hidden dark:block absolute -bottom-1/4 left-0 w-[600px] h-[600px] rounded-full bg-emerald-600/[0.05] blur-[100px]" />
      {/* Subtle radial glow — bottom left (light mode) */}
      <div className="dark:hidden absolute -bottom-1/4 left-0 w-[600px] h-[600px] rounded-full bg-emerald-600/[0.03] blur-[100px]" />
      
      {/* Center subtle glow (dark mode) */}
      <div className="hidden dark:block absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/[0.03] blur-[80px]" />
      
      {/* Logo watermark */}
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src="/splash-screen.png"
          alt=""
          className="object-contain animate-breathe-slow select-none pointer-events-none"
          style={{
            maxWidth: '45%',
            maxHeight: '45%',
            opacity: 0.04,
            filter: 'brightness(1.5) saturate(1.2)',
          }}
        />
      </div>
      
      {/* Noise texture overlay — premium grain effect */}
      <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }} />
    </div>
  );
}
