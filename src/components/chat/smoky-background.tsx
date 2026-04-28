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
    let logoImg: HTMLImageElement | null = null;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Preload logo
    const img = new Image();
    img.src = '/logo-transparent.png';
    img.onload = () => { logoImg = img; };
    if (img.complete) logoImg = img;

    // Smoke particles — drift from right to left (x.ai style)
    const particles: {
      x: number; y: number; vx: number; vy: number;
      radius: number; opacity: number; maxOpacity: number;
      hue: number; life: number; maxLife: number;
    }[] = [];

    const createParticle = () => {
      const w = canvas.width;
      const h = canvas.height;
      const fromRight = Math.random() > 0.3;
      return {
        x: fromRight ? w + Math.random() * 200 : w * (0.5 + Math.random() * 0.5),
        y: h * (0.1 + Math.random() * 0.8),
        vx: -(0.2 + Math.random() * 0.4),
        vy: (Math.random() - 0.5) * 0.2,
        radius: 80 + Math.random() * 200,
        opacity: 0,
        maxOpacity: 0.04 + Math.random() * 0.04,
        hue: 210 + Math.random() * 40,
        life: 0,
        maxLife: 400 + Math.random() * 500,
      };
    };

    for (let i = 0; i < 16; i++) {
      const p = createParticle();
      p.life = Math.random() * p.maxLife;
      // Set initial opacity based on life position
      const ratio = p.life / p.maxLife;
      if (ratio < 0.15) p.opacity = (ratio / 0.15) * p.maxOpacity;
      else if (ratio > 0.7) p.opacity = ((1 - ratio) / 0.3) * p.maxOpacity;
      else p.opacity = p.maxOpacity;
      particles.push(p);
    }

    const draw = () => {
      const isDark = document.documentElement.classList.contains('dark');
      const w = canvas.width;
      const h = canvas.height;
      time += 0.005;

      ctx.clearRect(0, 0, w, h);

      // ─── 1. x.ai-style light from top-right — the DRAMATIC effect ───
      if (isDark) {
        const pulse = 0.6 + Math.sin(time * 0.8) * 0.4;
        // Main light cone from top-right
        const lightX = w * 0.85;
        const lightY = h * 0.15;
        const lightR = Math.min(w, h) * 0.65;
        const lGrad = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, lightR);
        lGrad.addColorStop(0, `rgba(160, 200, 255, ${0.08 * pulse})`);
        lGrad.addColorStop(0.2, `rgba(130, 180, 255, ${0.05 * pulse})`);
        lGrad.addColorStop(0.5, `rgba(100, 150, 255, ${0.02 * pulse})`);
        lGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = lGrad;
        ctx.fillRect(0, 0, w, h);

        // Secondary light from mid-right
        const l2X = w * 0.9;
        const l2Y = h * 0.55;
        const l2R = Math.min(w, h) * 0.4;
        const l2Grad = ctx.createRadialGradient(l2X, l2Y, 0, l2X, l2Y, l2R);
        l2Grad.addColorStop(0, `rgba(120, 170, 255, ${0.04 * pulse})`);
        l2Grad.addColorStop(0.4, `rgba(80, 130, 255, ${0.02 * pulse})`);
        l2Grad.addColorStop(1, 'transparent');
        ctx.fillStyle = l2Grad;
        ctx.fillRect(0, 0, w, h);
      }

      // ─── 2. Smoke particles drifting right to left ───
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        if (p.life >= p.maxLife || p.x < -p.radius * 2) {
          Object.assign(p, createParticle());
        }

        const lifeRatio = p.life / p.maxLife;
        if (lifeRatio < 0.15) p.opacity = (lifeRatio / 0.15) * p.maxOpacity;
        else if (lifeRatio > 0.7) p.opacity = ((1 - lifeRatio) / 0.3) * p.maxOpacity;
        else p.opacity = p.maxOpacity;

        const alpha = p.opacity * (isDark ? 1.5 : 0.5);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        grad.addColorStop(0, `hsla(${p.hue}, 70%, ${isDark ? 65 : 50}%, ${alpha})`);
        grad.addColorStop(0.4, `hsla(${p.hue}, 60%, ${isDark ? 45 : 40}%, ${alpha * 0.5})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
      }

      // ─── 3. Diagonal light sweep — bottom-right to top-left ───
      const sweepProgress = (time * 0.12) % 2.6;
      const sweepX = w * (1.3 - sweepProgress);
      const sweepY = h * (1.3 - sweepProgress);
      const sweepGrad = ctx.createLinearGradient(sweepX + w * 0.2, sweepY + h * 0.2, sweepX - w * 0.2, sweepY - h * 0.2);
      if (isDark) {
        sweepGrad.addColorStop(0, 'transparent');
        sweepGrad.addColorStop(0.3, `rgba(160, 200, 255, ${0.025 + Math.sin(time * 2) * 0.01})`);
        sweepGrad.addColorStop(0.5, `rgba(130, 180, 255, ${0.045 + Math.sin(time * 2) * 0.015})`);
        sweepGrad.addColorStop(0.7, `rgba(160, 200, 255, ${0.025 + Math.sin(time * 2) * 0.01})`);
        sweepGrad.addColorStop(1, 'transparent');
      } else {
        sweepGrad.addColorStop(0, 'transparent');
        sweepGrad.addColorStop(0.3, `rgba(139, 92, 246, ${0.012 + Math.sin(time * 2) * 0.005})`);
        sweepGrad.addColorStop(0.5, `rgba(124, 58, 237, ${0.022 + Math.sin(time * 2) * 0.008})`);
        sweepGrad.addColorStop(0.7, `rgba(6, 182, 212, ${0.012 + Math.sin(time * 2) * 0.005})`);
        sweepGrad.addColorStop(1, 'transparent');
      }
      ctx.fillStyle = sweepGrad;
      ctx.fillRect(0, 0, w, h);

      // ─── 4. Bottom-left ambient glow ───
      const breathe1 = 0.6 + Math.sin(time * 0.8 + 1) * 0.4;
      const blGrad = ctx.createRadialGradient(w * 0.12, h * 0.88, 0, w * 0.12, h * 0.88, w * 0.35);
      if (isDark) {
        blGrad.addColorStop(0, `rgba(139, 92, 246, ${0.06 * breathe1})`);
        blGrad.addColorStop(0.5, `rgba(100, 80, 200, ${0.025 * breathe1})`);
        blGrad.addColorStop(1, 'transparent');
      } else {
        blGrad.addColorStop(0, `rgba(139, 92, 246, ${0.03 * breathe1})`);
        blGrad.addColorStop(0.5, `rgba(6, 182, 212, ${0.015 * breathe1})`);
        blGrad.addColorStop(1, 'transparent');
      }
      ctx.fillStyle = blGrad;
      ctx.fillRect(0, 0, w, h);

      // ─── 5. HUGE logo watermark with rotating glow ring (dark mode) ───
      if (isDark) {
        const cx = w / 2;
        const cy = h / 2;
        const ringRadius = Math.min(w, h) * 0.22;
        const rotationSpeed = time * 0.2;

        // 4 rotating glow spots orbiting the logo
        const spots = [
          { angle: rotationSpeed, size: 0.55, alpha: 0.12, hue: 220 },
          { angle: rotationSpeed + Math.PI * 0.5, size: 0.42, alpha: 0.09, hue: 240 },
          { angle: rotationSpeed + Math.PI, size: 0.48, alpha: 0.1, hue: 260 },
          { angle: rotationSpeed + Math.PI * 1.5, size: 0.44, alpha: 0.095, hue: 230 },
        ];

        for (const spot of spots) {
          const sx = cx + Math.cos(spot.angle) * ringRadius;
          const sy = cy + Math.sin(spot.angle) * ringRadius;
          const spotR = ringRadius * spot.size;
          const spotGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, spotR);
          spotGrad.addColorStop(0, `hsla(${spot.hue}, 70%, 70%, ${spot.alpha})`);
          spotGrad.addColorStop(0.4, `hsla(${spot.hue}, 60%, 50%, ${spot.alpha * 0.35})`);
          spotGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = spotGrad;
          ctx.fillRect(sx - spotR, sy - spotR, spotR * 2, spotR * 2);
        }

        // THE LOGO — HUGE, semi-transparent, like x.ai's "Grok" or z.ai's "Z"
        if (logoImg) {
          const logoSize = Math.min(w, h) * 0.5;
          const logoX = cx - logoSize / 2;
          const logoY = cy - logoSize / 2;

          ctx.save();
          ctx.globalAlpha = 0.06 + Math.sin(time * 0.4) * 0.015;
          ctx.filter = 'brightness(1.3) saturate(1.2)';
          ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
          ctx.restore();
        }
      }

      // ─── 6. Light mode: subtle center glow + lighter logo ───
      if (!isDark) {
        const cx = w / 2;
        const cy = h / 2;
        const breathe2 = 0.6 + Math.sin(time * 0.5) * 0.4;
        const cR = Math.min(w, h) * 0.3;
        const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cR);
        cGrad.addColorStop(0, `rgba(139, 92, 246, ${0.025 * breathe2})`);
        cGrad.addColorStop(0.5, `rgba(6, 182, 212, ${0.01 * breathe2})`);
        cGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = cGrad;
        ctx.fillRect(0, 0, w, h);

        // Lighter logo in light mode
        if (logoImg) {
          const logoSize = Math.min(w, h) * 0.4;
          ctx.save();
          ctx.globalAlpha = 0.04 + Math.sin(time * 0.4) * 0.01;
          ctx.drawImage(logoImg, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
          ctx.restore();
        }
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

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
