import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/components/providers/auth-provider";

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
    icon: ["/splash-screen.png"],
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
            width: 200px;
            height: auto;
            object-fit: contain;
            animation: splash-breathe 2s ease-in-out infinite;
            filter: brightness(1.3) saturate(1.2);
          }
          #eesha-splash .splash-sub {
            margin-top: 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            color: #71717a;
            letter-spacing: 0.1em;
          }

          @keyframes splash-breathe {
            0%, 100% { opacity: 0.7; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.06); }
          }

          html:not(.dark) #eesha-splash {
            background: #f5f5fa;
          }
          html:not(.dark) #eesha-splash .splash-sub {
            color: #9ca3af;
          }

        `}} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // Use system preference only — no localStorage
                  var dark = window.matchMedia('(prefers-color-scheme: dark)');

                  function applySystemTheme() {
                    if (dark.matches) {
                      document.documentElement.classList.add('dark');
                    } else {
                      document.documentElement.classList.remove('dark');
                    }
                  }

                  // Apply theme immediately to prevent flash
                  applySystemTheme();

                  // React to system theme changes in real-time
                  dark.addEventListener('change', function() {
                    applySystemTheme();
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
          <img src="/splash-screen.png" alt="Eesha AI" />
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
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
