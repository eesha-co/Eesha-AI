'use client';

import { useEffect, useRef } from 'react';

export function SmokyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    img.src = '/transparent-logo.png';
    img.onload = () => { logoImg = img; };
    if (img.complete) logoImg = img;

    const draw = () => {
      const isDark = document.documentElement.classList.contains('dark');
      const w = canvas.width;
      const h = canvas.height;
      time += 0.008;

      // ─── Background gradient ───
      if (isDark) {
        const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
        bgGrad.addColorStop(0, '#0d0d1a');
        bgGrad.addColorStop(0.5, '#0a0a14');
        bgGrad.addColorStop(1, '#050510');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
      } else {
        const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
        bgGrad.addColorStop(0, '#f5f5fa');
        bgGrad.addColorStop(1, '#ededf4');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // ─── Top-right accent light (subtle, no smoke) ───
      if (isDark) {
        const pulse = 0.6 + Math.sin(time * 0.6) * 0.4;
        const lightX = w * 0.82;
        const lightY = h * 0.08;
        const lightR = Math.max(w, h) * 0.9;
        const lGrad = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, lightR);
        lGrad.addColorStop(0, `rgba(180, 210, 255, ${0.15 * pulse})`);
        lGrad.addColorStop(0.1, `rgba(120, 170, 255, ${0.06 * pulse})`);
        lGrad.addColorStop(0.3, `rgba(60, 110, 230, ${0.02 * pulse})`);
        lGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = lGrad;
        ctx.fillRect(0, 0, w, h);
      } else {
        const pulse = 0.6 + Math.sin(time * 0.6) * 0.4;
        const lightX = w * 0.82;
        const lightY = h * 0.08;
        const lightR = Math.max(w, h) * 0.6;
        const lGrad = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, lightR);
        lGrad.addColorStop(0, `rgba(124, 58, 237, ${0.06 * pulse})`);
        lGrad.addColorStop(0.3, `rgba(6, 182, 212, ${0.02 * pulse})`);
        lGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = lGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // ─── Bottom-left ambient glow (subtle) ───
      const breathe1 = 0.5 + Math.sin(time * 0.7 + 1) * 0.5;
      const blGrad = ctx.createRadialGradient(w * 0.08, h * 0.92, 0, w * 0.08, h * 0.92, w * 0.45);
      if (isDark) {
        blGrad.addColorStop(0, `rgba(139, 92, 246, ${0.10 * breathe1})`);
        blGrad.addColorStop(0.3, `rgba(100, 70, 200, ${0.03 * breathe1})`);
        blGrad.addColorStop(1, 'transparent');
      } else {
        blGrad.addColorStop(0, `rgba(139, 92, 246, ${0.04 * breathe1})`);
        blGrad.addColorStop(0.4, `rgba(6, 182, 212, ${0.01 * breathe1})`);
        blGrad.addColorStop(1, 'transparent');
      }
      ctx.fillStyle = blGrad;
      ctx.fillRect(0, 0, w, h);

      // ─── THE LOGO — visible, positioned higher ───
      if (logoImg) {
        const logoSize = Math.max(w, h) * 0.5;
        const logoX = (w - logoSize) / 2;
        // Position higher — 35% from top instead of 50%
        const logoY = (h - logoSize) * 0.35;

        ctx.save();
        // Stage light effect: brighter, more vivid
        const baseAlpha = isDark ? 0.50 : 0.25;
        const breatheAmount = isDark ? 0.06 : 0.03;
        ctx.globalAlpha = baseAlpha + Math.sin(time * 0.4) * breatheAmount;
        ctx.filter = 'brightness(2.0) saturate(1.5) drop-shadow(0 0 60px rgba(139, 92, 246, 0.2))';
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      }

      // ─── Vignette (dark mode only) ───
      if (isDark) {
        const vigGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        vigGrad.addColorStop(0, 'transparent');
        vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, w, h);
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
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
