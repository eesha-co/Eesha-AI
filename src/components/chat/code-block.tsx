'use client';

import { useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CodeBlockProps {
  language: string;
  code: string;
}

const MAX_COLLAPSED_LINES = 15;

export function CodeBlock({ language, code: rawCode }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const code = rawCode.replace(/\n$/, '');
  const lines = code.split('\n');
  const lineCount = lines.length;
  const showLineNumbers = lineCount > 3;
  const isLong = lineCount > MAX_COLLAPSED_LINES;

  const displayCode = isLong && !expanded
    ? lines.slice(0, MAX_COLLAPSED_LINES).join('\n')
    : code;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [code]);

  const handleDownload = useCallback(() => {
    const extensions: Record<string, string> = {
      javascript: '.js', typescript: '.ts', python: '.py', rust: '.rs',
      go: '.go', java: '.java', cpp: '.cpp', c: '.c',
      html: '.html', css: '.css', json: '.json', bash: '.sh',
      shell: '.sh', sql: '.sql', yaml: '.yml', xml: '.xml', markdown: '.md',
    };
    const ext = extensions[language.toLowerCase()] || '.txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, language]);

  return (
    <div className="code-block-container">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="rounded-md bg-[var(--surface-secondary)] px-2 py-0.5 text-[11px] font-medium uppercase text-muted-foreground">
          {language || 'code'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="size-7 text-muted-foreground hover:text-foreground"
            title="Download"
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="size-7 text-muted-foreground hover:text-foreground"
            title="Copy code"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Code */}
      <div className="relative">
        <SyntaxHighlighter
          language={language || 'text'}
          style={oneDark}
          showLineNumbers={showLineNumbers}
          wrapLines
          customStyle={{
            background: 'transparent',
            padding: '1rem',
            margin: 0,
            fontSize: '0.8125rem',
            lineHeight: '1.6',
          }}
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '1em',
            color: 'var(--text-tertiary)',
          }}
        >
          {displayCode}
        </SyntaxHighlighter>

        {/* Gradient fade overlay for collapsed long code */}
        {isLong && !expanded && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[var(--surface-primary)] to-transparent" />
        )}
      </div>

      {/* Expand/Collapse button */}
      {isLong && (
        <div className="border-t border-border px-4 py-1.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="size-3" />
                Show more ({lineCount - MAX_COLLAPSED_LINES} more lines)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
