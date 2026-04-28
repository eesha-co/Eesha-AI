import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Eesha AI",
  description: "Advanced AI coding platform. Write, debug, and deploy code with Eesha AI.",
  keywords: ["Eesha AI", "AI", "coding assistant", "code generation", "coding agent"],
  authors: [{ name: "Eesha AI" }],
  icons: {
    icon: ["/favicon-64.png", "/logo-256.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Splash screen — shows logo before React hydrates */}
        <style dangerouslySetInnerHTML={{ __html: `
          #eesha-splash {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #09090f;
            transition: opacity 0.6s ease, visibility 0.6s ease;
          }
          #eesha-splash.fade-out {
            opacity: 0;
            visibility: hidden;
          }
          #eesha-splash img {
            width: 120px;
            height: 120px;
            object-fit: contain;
            animation: splash-breathe 2s ease-in-out infinite;
            filter: brightness(1.3) saturate(1.2);
          }
          #eesha-splash .splash-text {
            margin-top: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 24px;
            font-weight: 700;
            background: linear-gradient(135deg, #a78bfa, #22d3ee);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: splash-text-fade 1.5s ease-in-out infinite alternate;
          }
          #eesha-splash .splash-sub {
            margin-top: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            color: #71717a;
            letter-spacing: 0.1em;
          }
          #eesha-splash .splash-ring {
            position: absolute;
            width: 200px;
            height: 200px;
            border-radius: 50%;
            border: 1px solid rgba(139, 92, 246, 0.15);
            animation: splash-ring-rotate 6s linear infinite;
          }
          #eesha-splash .splash-ring::after {
            content: '';
            position: absolute;
            top: -3px;
            left: 50%;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: rgba(139, 92, 246, 0.6);
            box-shadow: 0 0 12px rgba(139, 92, 246, 0.4);
          }
          @keyframes splash-breathe {
            0%, 100% { opacity: 0.7; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.06); }
          }
          @keyframes splash-text-fade {
            0% { opacity: 0.6; }
            100% { opacity: 1; }
          }
          @keyframes splash-ring-rotate {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          html:not(.dark) #eesha-splash {
            background: #f5f5fa;
          }
          html:not(.dark) #eesha-splash .splash-sub {
            color: #9ca3af;
          }
          html:not(.dark) #eesha-splash .splash-ring {
            border-color: rgba(124, 58, 237, 0.12);
          }
          html:not(.dark) #eesha-splash .splash-ring::after {
            background: rgba(124, 58, 237, 0.5);
            box-shadow: 0 0 10px rgba(124, 58, 237, 0.3);
          }
        `}} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // Check localStorage for saved theme preference
                  var saved = localStorage.getItem('eesha-theme');
                  var dark = window.matchMedia('(prefers-color-scheme: dark)');

                  function applyTheme(theme) {
                    if (theme === 'dark' || (theme === 'system' && dark.matches) || (!theme && dark.matches)) {
                      document.documentElement.classList.add('dark');
                    } else {
                      document.documentElement.classList.remove('dark');
                    }
                  }

                  // Apply theme immediately to prevent flash
                  if (saved) {
                    var parsed = JSON.parse(saved);
                    applyTheme(parsed.mode || 'system');
                  } else {
                    applyTheme('system');
                  }

                  // Listen for system theme changes
                  dark.addEventListener('change', function(e) {
                    var current = localStorage.getItem('eesha-theme');
                    var mode = current ? JSON.parse(current).mode : 'system';
                    if (mode === 'system') {
                      applyTheme('system');
                    }
                  });
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* Splash screen — pure HTML/CSS, removed by JS after mount */}
        <div id="eesha-splash">
          <div className="splash-ring" />
          <img src="/logo-transparent.png" alt="Eesha AI" />
          <div className="splash-text">Eesha AI</div>
          <div className="splash-sub">LOADING</div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var splash = document.getElementById('eesha-splash');
            if (splash) {
              // Fade out after a short delay
              setTimeout(function() {
                splash.classList.add('fade-out');
                setTimeout(function() {
                  splash.remove();
                }, 700);
              }, 1200);
            }
          })();
        `}} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
