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
    img.src = '/logo-transparent.png';
    img.onload = () => { logoImg = img; };
    if (img.complete) logoImg = img;

    // ─── Smoke particles — right to left, VISIBLE ───
    const particles: {
      x: number; y: number; vx: number; vy: number;
      radius: number; opacity: number; maxOpacity: number;
      hue: number; life: number; maxLife: number;
    }[] = [];

    const createParticle = () => {
      const w = canvas.width;
      const h = canvas.height;
      return {
        x: w + Math.random() * 400,
        y: h * (0.05 + Math.random() * 0.9),
        vx: -(0.4 + Math.random() * 0.8),
        vy: (Math.random() - 0.5) * 0.3,
        radius: 120 + Math.random() * 300,
        opacity: 0,
        maxOpacity: 0.12 + Math.random() * 0.10,
        hue: 210 + Math.random() * 50,
        life: 0,
        maxLife: 600 + Math.random() * 700,
      };
    };

    for (let i = 0; i < 30; i++) {
      const p = createParticle();
      p.life = Math.random() * p.maxLife;
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
      time += 0.008;

      // ─── DARK MODE: x.ai-style dramatic dark background ───
      if (isDark) {
        // Deep navy-black gradient
        const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
        bgGrad.addColorStop(0, '#0d0d1a');
        bgGrad.addColorStop(0.5, '#0a0a14');
        bgGrad.addColorStop(1, '#050510');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
      } else {
        // Light mode: subtle warm white
        const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
        bgGrad.addColorStop(0, '#f8f8ff');
        bgGrad.addColorStop(1, '#f0f0f8');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // ═══════════════════════════════════════════════════════════
      // 1. x.ai-STYLE DRAMATIC TOP-RIGHT LIGHT SOURCE
      //    This is THE signature effect — intense blue-white spotlight
      // ═══════════════════════════════════════════════════════════
      if (isDark) {
        const pulse = 0.6 + Math.sin(time * 0.6) * 0.4;

        // MAIN spotlight from top-right — INTENSE like x.ai
        const lightX = w * 0.82;
        const lightY = h * 0.08;
        const lightR = Math.max(w, h) * 0.9;
        const lGrad = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, lightR);
        lGrad.addColorStop(0, `rgba(180, 210, 255, ${0.35 * pulse})`);
        lGrad.addColorStop(0.05, `rgba(150, 190, 255, ${0.28 * pulse})`);
        lGrad.addColorStop(0.12, `rgba(120, 170, 255, ${0.18 * pulse})`);
        lGrad.addColorStop(0.25, `rgba(90, 140, 255, ${0.10 * pulse})`);
        lGrad.addColorStop(0.45, `rgba(60, 110, 230, ${0.04 * pulse})`);
        lGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = lGrad;
        ctx.fillRect(0, 0, w, h);

        // LENS FLARE effect — bright core at light source
        const flareR = Math.min(w, h) * 0.08;
        const flareGrad = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, flareR);
        flareGrad.addColorStop(0, `rgba(220, 235, 255, ${0.25 * pulse})`);
        flareGrad.addColorStop(0.3, `rgba(180, 210, 255, ${0.12 * pulse})`);
        flareGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = flareGrad;
        ctx.fillRect(lightX - flareR, lightY - flareR, flareR * 2, flareR * 2);

        // SECONDARY mid-right glow — softer, complementing
        const l2X = w * 0.9;
        const l2Y = h * 0.5;
        const l2R = Math.min(w, h) * 0.6;
        const l2Grad = ctx.createRadialGradient(l2X, l2Y, 0, l2X, l2Y, l2R);
        l2Grad.addColorStop(0, `rgba(100, 150, 255, ${0.15 * pulse})`);
        l2Grad.addColorStop(0.2, `rgba(80, 130, 255, ${0.08 * pulse})`);
        l2Grad.addColorStop(0.5, `rgba(60, 100, 220, ${0.03 * pulse})`);
        l2Grad.addColorStop(1, 'transparent');
        ctx.fillStyle = l2Grad;
        ctx.fillRect(0, 0, w, h);
      } else {
        // Light mode — subtle top-right accent
        const pulse = 0.6 + Math.sin(time * 0.6) * 0.4;
        const lightX = w * 0.82;
        const lightY = h * 0.08;
        const lightR = Math.max(w, h) * 0.6;
        const lGrad = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, lightR);
        lGrad.addColorStop(0, `rgba(124, 58, 237, ${0.10 * pulse})`);
        lGrad.addColorStop(0.2, `rgba(124, 58, 237, ${0.05 * pulse})`);
        lGrad.addColorStop(0.5, `rgba(6, 182, 212, ${0.02 * pulse})`);
        lGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = lGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // ═══════════════════════════════════════════════════════════
      // 2. SMOKE PARTICLES — right → left, CLEARLY VISIBLE
      // ═══════════════════════════════════════════════════════════
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

        const alpha = p.opacity * (isDark ? 2.5 : 1.2);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        grad.addColorStop(0, `hsla(${p.hue}, 80%, ${isDark ? 70 : 60}%, ${alpha})`);
        grad.addColorStop(0.3, `hsla(${p.hue}, 70%, ${isDark ? 55 : 50}%, ${alpha * 0.6})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
      }

      // ═══════════════════════════════════════════════════════════
      // 3. DIAGONAL LIGHT SWEEP — bottom-right → top-left, CLEARLY VISIBLE
      // ═══════════════════════════════════════════════════════════
      const sweepProgress = (time * 0.12) % 3.5;
      const sweepX = w * (1.5 - sweepProgress);
      const sweepY = h * (1.5 - sweepProgress);
      const sweepWidth = Math.max(w, h) * 0.4;
      const sweepGrad = ctx.createLinearGradient(
        sweepX + sweepWidth, sweepY + sweepWidth,
        sweepX - sweepWidth, sweepY - sweepWidth
      );
      const sweepPulse = 0.5 + Math.sin(time * 1.5) * 0.5;
      if (isDark) {
        sweepGrad.addColorStop(0, 'transparent');
        sweepGrad.addColorStop(0.15, `rgba(140, 180, 255, ${0.01 * sweepPulse})`);
        sweepGrad.addColorStop(0.3, `rgba(120, 160, 255, ${0.08 * sweepPulse})`);
        sweepGrad.addColorStop(0.5, `rgba(100, 150, 255, ${0.15 * sweepPulse})`);
        sweepGrad.addColorStop(0.7, `rgba(120, 160, 255, ${0.08 * sweepPulse})`);
        sweepGrad.addColorStop(0.85, `rgba(140, 180, 255, ${0.01 * sweepPulse})`);
        sweepGrad.addColorStop(1, 'transparent');
      } else {
        sweepGrad.addColorStop(0, 'transparent');
        sweepGrad.addColorStop(0.3, `rgba(124, 58, 237, ${0.04 * sweepPulse})`);
        sweepGrad.addColorStop(0.5, `rgba(109, 40, 217, ${0.08 * sweepPulse})`);
        sweepGrad.addColorStop(0.7, `rgba(6, 182, 212, ${0.04 * sweepPulse})`);
        sweepGrad.addColorStop(1, 'transparent');
      }
      ctx.fillStyle = sweepGrad;
      ctx.fillRect(0, 0, w, h);

      // ═══════════════════════════════════════════════════════════
      // 4. BOTTOM-LEFT AMBIENT GLOW — breathing purple
      // ═══════════════════════════════════════════════════════════
      const breathe1 = 0.5 + Math.sin(time * 0.7 + 1) * 0.5;
      const blGrad = ctx.createRadialGradient(w * 0.08, h * 0.92, 0, w * 0.08, h * 0.92, w * 0.45);
      if (isDark) {
        blGrad.addColorStop(0, `rgba(139, 92, 246, ${0.20 * breathe1})`);
        blGrad.addColorStop(0.2, `rgba(120, 80, 220, ${0.12 * breathe1})`);
        blGrad.addColorStop(0.5, `rgba(100, 70, 200, ${0.05 * breathe1})`);
        blGrad.addColorStop(1, 'transparent');
      } else {
        blGrad.addColorStop(0, `rgba(139, 92, 246, ${0.08 * breathe1})`);
        blGrad.addColorStop(0.4, `rgba(6, 182, 212, ${0.03 * breathe1})`);
        blGrad.addColorStop(1, 'transparent');
      }
      ctx.fillStyle = blGrad;
      ctx.fillRect(0, 0, w, h);

      // ═══════════════════════════════════════════════════════════
      // 5. HUGE LOGO WATERMARK + ROTATING GLOW RINGS
      //    Like x.ai's "Grok" — CLEARLY VISIBLE, semi-transparent
      // ═══════════════════════════════════════════════════════════
      const cx = w / 2;
      const cy = h / 2;

      // ─── Rotating glow rings around logo ───
      const ringRadius = Math.min(w, h) * 0.25;
      const rotationSpeed = time * 0.3;

      // 4 bright glow spots orbiting
      const spots = [
        { angle: rotationSpeed, size: 0.55, alpha: 0.35, hue: 220 },
        { angle: rotationSpeed + Math.PI * 0.5, size: 0.45, alpha: 0.28, hue: 245 },
        { angle: rotationSpeed + Math.PI, size: 0.50, alpha: 0.32, hue: 265 },
        { angle: rotationSpeed + Math.PI * 1.5, size: 0.42, alpha: 0.30, hue: 235 },
      ];

      const alphaMultiplier = isDark ? 1.0 : 0.4;
      for (const spot of spots) {
        const sx = cx + Math.cos(spot.angle) * ringRadius;
        const sy = cy + Math.sin(spot.angle) * ringRadius;
        const spotR = ringRadius * spot.size;
        const spotGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, spotR);
        spotGrad.addColorStop(0, `hsla(${spot.hue}, 80%, 75%, ${spot.alpha * alphaMultiplier})`);
        spotGrad.addColorStop(0.3, `hsla(${spot.hue}, 70%, 60%, ${spot.alpha * 0.5 * alphaMultiplier})`);
        spotGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = spotGrad;
        ctx.fillRect(sx - spotR, sy - spotR, spotR * 2, spotR * 2);
      }

      // ─── THE LOGO — HUGE, semi-transparent, DRAMATIC ───
      if (logoImg) {
        const logoSize = Math.min(w, h) * 0.6;
        const logoX = cx - logoSize / 2;
        const logoY = cy - logoSize / 2;

        ctx.save();
        // DARK: 0.28 opacity (CLEARLY visible like x.ai's "Grok")
        // LIGHT: 0.12 opacity (visible but not overpowering)
        const baseAlpha = isDark ? 0.28 : 0.12;
        const breatheAmount = isDark ? 0.06 : 0.03;
        ctx.globalAlpha = baseAlpha + Math.sin(time * 0.4) * breatheAmount;
        ctx.filter = 'brightness(1.5) saturate(1.4)';
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      }

      // Light mode center glow
      if (!isDark) {
        const breathe2 = 0.5 + Math.sin(time * 0.5) * 0.5;
        const cR = Math.min(w, h) * 0.4;
        const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cR);
        cGrad.addColorStop(0, `rgba(139, 92, 246, ${0.06 * breathe2})`);
        cGrad.addColorStop(0.5, `rgba(6, 182, 212, ${0.03 * breathe2})`);
        cGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = cGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // ═══════════════════════════════════════════════════════════
      // 6. VIGNETTE — dark edges for cinematic depth (dark mode)
      // ═══════════════════════════════════════════════════════════
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
