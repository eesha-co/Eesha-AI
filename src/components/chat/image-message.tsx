'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Maximize2, X, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GeneratedImage } from '@/stores/chat-store';

interface ImageMessageProps {
  images: GeneratedImage[];
  isStreaming?: boolean;
}

export function ImageMessage({ images, isStreaming }: ImageMessageProps) {
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  const handleDownload = useCallback(async (image: GeneratedImage) => {
    try {
      if (image.url.startsWith('data:')) {
        // Base64 image - create download link
        const link = document.createElement('a');
        link.href = image.url;
        link.download = `iluma-${image.id}.png`;
        link.click();
      } else {
        // URL image - fetch then download
        const response = await fetch(image.url);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `iluma-${image.id}.png`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Fallback: open in new tab
      window.open(image.url, '_blank');
    }
  }, []);

  const handleCopyPrompt = useCallback(async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(prompt);
      setTimeout(() => setCopiedPrompt(null), 2000);
    } catch { /* fallback */ }
  }, []);

  if (!images || images.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-3 my-2">
        {images.map((image, index) => (
          <motion.div
            key={image.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            className="group relative"
          >
            {/* Image card */}
            <div className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30">
              <img
                src={image.url}
                alt={image.prompt}
                className="w-full max-w-[384px] object-cover cursor-pointer transition-all duration-300 group-hover:scale-[1.02]"
                onClick={() => setSelectedImage(image)}
                loading="lazy"
              />

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => setSelectedImage(image)}
                  className="flex size-7 items-center justify-center rounded-lg bg-black/40 text-white/80 backdrop-blur-sm hover:bg-black/60 transition-colors"
                  title="View full size"
                >
                  <Maximize2 className="size-3.5" />
                </button>
                <button
                  onClick={() => handleDownload(image)}
                  className="flex size-7 items-center justify-center rounded-lg bg-black/40 text-white/80 backdrop-blur-sm hover:bg-black/60 transition-colors"
                  title="Download"
                >
                  <Download className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Prompt label */}
            <div className="mt-1.5 flex items-center gap-1.5">
              <p className="text-[11px] text-foreground/30 truncate max-w-[280px]">
                {image.prompt.slice(0, 80)}{image.prompt.length > 80 ? '...' : ''}
              </p>
              <button
                onClick={() => handleCopyPrompt(image.prompt)}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Copy prompt"
              >
                {copiedPrompt === image.prompt ? (
                  <Check className="size-3 text-emerald-400" />
                ) : (
                  <Copy className="size-3 text-foreground/20 hover:text-foreground/50" />
                )}
              </button>
            </div>
          </motion.div>
        ))}

        {/* Loading indicator for streaming */}
        {isStreaming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center w-[256px] h-[256px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/20"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="size-10 rounded-full border-2 border-emerald-500/30" />
                <div className="absolute inset-0 size-10 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" />
              </div>
              <span className="text-[12px] text-foreground/30">Creating image...</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Full-screen lightbox */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-[90vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={selectedImage.url}
                alt={selectedImage.prompt}
                className="max-w-full max-h-[85vh] object-contain rounded-xl"
              />
              <div className="absolute top-3 right-3 flex gap-2">
                <button
                  onClick={() => handleDownload(selectedImage)}
                  className="flex size-8 items-center justify-center rounded-lg bg-black/40 text-white/80 backdrop-blur-sm hover:bg-black/60 transition-colors"
                >
                  <Download className="size-4" />
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="flex size-8 items-center justify-center rounded-lg bg-black/40 text-white/80 backdrop-blur-sm hover:bg-black/60 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-3 px-1">
                <p className="text-[13px] text-white/60">{selectedImage.prompt}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
