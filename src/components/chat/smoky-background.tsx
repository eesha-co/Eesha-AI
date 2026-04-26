'use client';

export function SmokyBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes smokyDrift1 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          25% {
            transform: translate(60px, 40px) scale(1.1);
          }
          50% {
            transform: translate(30px, 80px) scale(0.95);
          }
          75% {
            transform: translate(-40px, 50px) scale(1.05);
          }
        }

        @keyframes smokyDrift2 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          25% {
            transform: translate(-70px, -30px) scale(1.08);
          }
          50% {
            transform: translate(-30px, -60px) scale(0.92);
          }
          75% {
            transform: translate(50px, -40px) scale(1.12);
          }
        }

        @keyframes smokyDrift3 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          25% {
            transform: translate(-50px, 30px) scale(1.15);
          }
          50% {
            transform: translate(40px, -20px) scale(0.9);
          }
          75% {
            transform: translate(-20px, -50px) scale(1.08);
          }
        }

        @keyframes smokyDrift4 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          25% {
            transform: translate(30px, -60px) scale(1.06);
          }
          50% {
            transform: translate(-60px, 20px) scale(1.1);
          }
          75% {
            transform: translate(20px, 40px) scale(0.94);
          }
        }

        @keyframes smokyDrift5 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(-40px, -40px) scale(1.1);
          }
          66% {
            transform: translate(50px, 30px) scale(0.95);
          }
        }
      `}</style>

      {/* Blob 1 - violet, top-left area, slow drift */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-5%',
          width: '420px',
          height: '420px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.35) 0%, rgba(139,92,246,0.1) 50%, transparent 70%)',
          filter: 'blur(100px)',
          opacity: 0.15,
          animation: 'smokyDrift1 20s infinite ease-in-out',
        }}
      />

      {/* Blob 2 - cyan, bottom-right area, slow drift */}
      <div
        style={{
          position: 'absolute',
          bottom: '-8%',
          right: '-5%',
          width: '380px',
          height: '380px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.3) 0%, rgba(34,211,238,0.08) 50%, transparent 70%)',
          filter: 'blur(110px)',
          opacity: 0.14,
          animation: 'smokyDrift2 25s infinite ease-in-out',
        }}
      />

      {/* Blob 3 - indigo, center, slow morph */}
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: '35%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, rgba(99,102,241,0.08) 50%, transparent 70%)',
          filter: 'blur(120px)',
          opacity: 0.12,
          animation: 'smokyDrift3 22s infinite ease-in-out',
        }}
      />

      {/* Blob 4 - purple, top-right, slow drift */}
      <div
        style={{
          position: 'absolute',
          top: '-5%',
          right: '10%',
          width: '350px',
          height: '350px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,85,247,0.3) 0%, rgba(168,85,247,0.08) 50%, transparent 70%)',
          filter: 'blur(90px)',
          opacity: 0.16,
          animation: 'smokyDrift4 18s infinite ease-in-out',
        }}
      />

      {/* Blob 5 - violet-purple blend, bottom-left, slow drift */}
      <div
        style={{
          position: 'absolute',
          bottom: '5%',
          left: '15%',
          width: '320px',
          height: '320px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, rgba(168,85,247,0.08) 50%, transparent 70%)',
          filter: 'blur(100px)',
          opacity: 0.13,
          animation: 'smokyDrift5 24s infinite ease-in-out',
        }}
      />

      {/* Logo watermark - very faint, centered */}
      <div className="absolute inset-0 flex items-center justify-center">
        <img src="/logo.svg" alt="" className="w-64 h-64 opacity-[0.04]" />
      </div>
    </div>
  );
}
