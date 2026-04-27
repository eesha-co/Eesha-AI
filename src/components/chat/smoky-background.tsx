'use client';

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chat-store';

export function SmokyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { themeMode } = useChatStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Smoke particles
    const particles: {
      x: number; y: number; vx: number; vy: number;
      radius: number; opacity: number; hue: number;
      life: number; maxLife: number;
    }[] = [];

    const createParticle = () => {
      const w = canvas.width;
      const h = canvas.height;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.2 - 0.1,
        radius: Math.random() * 200 + 100,
        opacity: Math.random() * 0.03 + 0.01,
        hue: Math.random() > 0.5 ? 220 + Math.random() * 30 : 260 + Math.random() * 20,
        life: 0,
        maxLife: Math.random() * 600 + 400,
      };
    };

    for (let i = 0; i < 12; i++) {
      const p = createParticle();
      p.life = Math.random() * p.maxLife;
      particles.push(p);
    }

    const draw = () => {
      const isDark = document.documentElement.classList.contains('dark');
      const w = canvas.width;
      const h = canvas.height;
      time += 0.005;

      ctx.clearRect(0, 0, w, h);

      // ─── Smoke particles ───
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        if (p.life > p.maxLife || p.x < -300 || p.x > w + 300 || p.y < -300 || p.y > h + 300) {
          Object.assign(p, createParticle());
        }

        const lifeRatio = p.life / p.maxLife;
        const fade = lifeRatio < 0.1 ? lifeRatio / 0.1
                   : lifeRatio > 0.8 ? (1 - lifeRatio) / 0.2
                   : 1;

        const alpha = p.opacity * fade * (isDark ? 1.5 : 0.5);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        grad.addColorStop(0, `hsla(${p.hue}, 60%, ${isDark ? 60 : 50}%, ${alpha})`);
        grad.addColorStop(0.5, `hsla(${p.hue}, 50%, ${isDark ? 40 : 40}%, ${alpha * 0.4})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
      }

      // ─── Diagonal light sweep — animated, moves right to left ───
      const sweepX = w * (1.2 - (time * 0.15) % 2.4);
      const sweepGrad = ctx.createLinearGradient(sweepX - w * 0.3, 0, sweepX + w * 0.1, h);
      if (isDark) {
        sweepGrad.addColorStop(0, 'transparent');
        sweepGrad.addColorStop(0.3, `rgba(160, 200, 255, ${0.03 + Math.sin(time * 2) * 0.01})`);
        sweepGrad.addColorStop(0.5, `rgba(130, 180, 255, ${0.05 + Math.sin(time * 2) * 0.02})`);
        sweepGrad.addColorStop(0.7, `rgba(160, 200, 255, ${0.03 + Math.sin(time * 2) * 0.01})`);
        sweepGrad.addColorStop(1, 'transparent');
      } else {
        sweepGrad.addColorStop(0, 'transparent');
        sweepGrad.addColorStop(0.3, `rgba(139, 92, 246, ${0.015 + Math.sin(time * 2) * 0.005})`);
        sweepGrad.addColorStop(0.5, `rgba(124, 58, 237, ${0.025 + Math.sin(time * 2) * 0.008})`);
        sweepGrad.addColorStop(0.7, `rgba(6, 182, 212, ${0.015 + Math.sin(time * 2) * 0.005})`);
        sweepGrad.addColorStop(1, 'transparent');
      }
      ctx.fillStyle = sweepGrad;
      ctx.fillRect(0, 0, w, h);

      // ─── Top-right ambient glow (breathing) ───
      const breathe1 = 0.7 + Math.sin(time * 1.05) * 0.3;
      const trGrad = ctx.createRadialGradient(w * 0.8, h * 0.1, 0, w * 0.8, h * 0.1, w * 0.5);
      if (isDark) {
        trGrad.addColorStop(0, `rgba(160, 195, 255, ${0.1 * breathe1})`);
        trGrad.addColorStop(0.4, `rgba(120, 165, 255, ${0.05 * breathe1})`);
        trGrad.addColorStop(1, 'transparent');
      } else {
        trGrad.addColorStop(0, `rgba(139, 92, 246, ${0.05 * breathe1})`);
        trGrad.addColorStop(0.4, `rgba(124, 58, 237, ${0.02 * breathe1})`);
        trGrad.addColorStop(1, 'transparent');
      }
      ctx.fillStyle = trGrad;
      ctx.fillRect(0, 0, w, h);

      // ─── Bottom-left ambient glow ───
      const breathe2 = 0.6 + Math.sin(time * 0.8 + 1) * 0.4;
      const blGrad = ctx.createRadialGradient(w * 0.15, h * 0.85, 0, w * 0.15, h * 0.85, w * 0.4);
      if (isDark) {
        blGrad.addColorStop(0, `rgba(139, 92, 246, ${0.06 * breathe2})`);
        blGrad.addColorStop(0.5, `rgba(100, 80, 200, ${0.03 * breathe2})`);
        blGrad.addColorStop(1, 'transparent');
      } else {
        blGrad.addColorStop(0, `rgba(139, 92, 246, ${0.03 * breathe2})`);
        blGrad.addColorStop(0.5, `rgba(6, 182, 212, ${0.015 * breathe2})`);
        blGrad.addColorStop(1, 'transparent');
      }
      ctx.fillStyle = blGrad;
      ctx.fillRect(0, 0, w, h);

      // ─── Centered rotating glow ring (dark mode only) ───
      if (isDark) {
        const cx = w / 2;
        const cy = h / 2;
        const ringRadius = Math.min(w, h) * 0.28;
        const rotationSpeed = time * 0.25;

        // 4 glow spots orbiting the center
        const spots = [
          { angle: rotationSpeed, size: 0.55, alpha: 0.14, hue: 220 },
          { angle: rotationSpeed + Math.PI * 0.5, size: 0.45, alpha: 0.11, hue: 240 },
          { angle: rotationSpeed + Math.PI, size: 0.5, alpha: 0.12, hue: 260 },
          { angle: rotationSpeed + Math.PI * 1.5, size: 0.48, alpha: 0.13, hue: 230 },
        ];

        for (const spot of spots) {
          const sx = cx + Math.cos(spot.angle) * ringRadius;
          const sy = cy + Math.sin(spot.angle) * ringRadius;
          const spotR = ringRadius * spot.size;

          const spotGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, spotR);
          spotGrad.addColorStop(0, `hsla(${spot.hue}, 70%, 70%, ${spot.alpha})`);
          spotGrad.addColorStop(0.4, `hsla(${spot.hue}, 60%, 50%, ${spot.alpha * 0.4})`);
          spotGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = spotGrad;
          ctx.fillRect(sx - spotR, sy - spotR, spotR * 2, spotR * 2);
        }

        // Semi-transparent logo watermark in center
        const logoSize = Math.min(w, h) * 0.45;
        const logoX = cx - logoSize / 2;
        const logoY = cy - logoSize / 2;

        ctx.save();
        ctx.globalAlpha = 0.06 + Math.sin(time * 0.5) * 0.01;
        ctx.filter = 'brightness(1.3) saturate(1.2)';

        const logo = new Image();
        logo.src = '/logo-transparent.png';
        if (logo.complete) {
          ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
        }
        ctx.restore();
      }

      // ─── Light mode: subtle center glow only ───
      if (!isDark) {
        const cx = w / 2;
        const cy = h / 2;
        const breathe3 = 0.7 + Math.sin(time * 0.6) * 0.3;
        const centerR = Math.min(w, h) * 0.3;

        const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, centerR);
        cGrad.addColorStop(0, `rgba(139, 92, 246, ${0.025 * breathe3})`);
        cGrad.addColorStop(0.5, `rgba(6, 182, 212, ${0.012 * breathe3})`);
        cGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = cGrad;
        ctx.fillRect(0, 0, w, h);
      }

      animId = requestAnimationFrame(draw);
    };

    // Preload logo
    const logo = new Image();
    logo.src = '/logo-transparent.png';
    logo.onload = () => { draw(); };
    if (logo.complete) draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}
