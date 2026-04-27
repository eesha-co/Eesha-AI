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
        {children}
        <Toaster />
      </body>
    </html>
  );
}
