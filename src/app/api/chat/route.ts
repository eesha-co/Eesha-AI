import { NextRequest } from 'next/server';
import { db, isDatabaseAvailable } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/api-auth';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';

export const runtime = 'nodejs';
export const maxDuration = 300;

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/app/workspace';

function safePath(relativePath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

function runCommand(command: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const workingDir = cwd ? path.resolve(WORKSPACE_ROOT, cwd) : WORKSPACE_ROOT;
  const safeDir = workingDir.startsWith(WORKSPACE_ROOT) ? workingDir : WORKSPACE_ROOT;
  return new Promise((resolve) => {
    exec(command, {
      cwd: safeDir,
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, TERM: 'dumb' },
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error ? error.code || 1 : 0,
      });
    });
  });
}

const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

// ─── Multi-Agent Configuration ────────────────────────────────────────────────
const AGENT1_API_KEY = process.env.AGENT1_API_KEY || '';
const AGENT2_API_KEY = process.env.AGENT2_API_KEY || '';
const AGENT3_API_KEY = process.env.AGENT3_API_KEY || '';

const AGENT1_MODEL = 'qwen/qwen3-coder-480b-a35b-instruct';
const AGENT2_MODEL = 'moonshotai/kimi-k2-thinking';
const AGENT3_MODEL = 'mistralai/mistral-large-3-675b-instruct-2512';

// ─── Agent System Prompts — Teamwork with Security Focus ──────────────────────

const ARCHITECT_SYSTEM_PROMPT = `You are The Architect, an elite software engineer and the lead developer of the Eesha AI Committee. You design and write production-ready code.

When you receive a user request:
1. Analyze the requirements thoroughly
2. Design the architecture and plan the implementation
3. Write complete, runnable, production-grade code
4. Include ALL necessary files, imports, configuration, and setup
5. Add comprehensive error handling and input validation
6. Follow security best practices (OWASP Top 10, input sanitization, least privilege)
7. Use the MOST SECURE approach — prefer parameterized queries, validated inputs, environment variables for secrets, no hardcoded credentials

You are a CODING AGENT — when asked to build something, you MUST provide actual code that creates files and runs. Always structure your response so that code can be extracted and saved to files.

When writing code, always consider:
- Input validation and sanitization
- Authentication and authorization
- SQL injection / XSS / CSRF prevention
- Secure secret management (env vars, never hardcoded)
- Rate limiting and DoS protection where applicable
- Proper error messages (no leaking internal details)
- Dependency security`;

const SECURITY_SYSTEM_PROMPT = `You are The Security Expert, an elite cybersecurity specialist and code auditor on the Eesha AI Committee. You have deep expertise in OWASP, CVE databases, penetration testing, and secure coding.

When you receive a user request along with the Architect's draft:
1. Perform a thorough security audit of the proposed code
2. Identify ALL vulnerabilities: SQL injection, XSS, CSRF, SSRF, path traversal, command injection, auth bypass, insecure deserialization, etc.
3. Check for: hardcoded secrets, insecure defaults, missing rate limits, improper error handling that leaks info, weak crypto, insecure dependencies
4. Grade the security posture (A-F) and list specific CVE-style findings
5. Provide the EXACT code fixes for every vulnerability found
6. If the code is already secure, confirm and suggest hardening improvements
7. Always prefer defense-in-depth: multiple layers of security controls

Your output must be:
- A SECURITY REPORT with findings ranked by severity (Critical > High > Medium > Low > Info)
- For each finding: the vulnerable code snippet, why it's dangerous, and the exact fix
- A final VERDICT: whether the code is safe to ship, needs changes, or must be rewritten`;

const OPTIMIZER_SYSTEM_PROMPT = `You are The Optimizer, an elite performance engineer and code quality specialist on the Eesha AI Committee. You ensure code is not just functional, but optimal.

When you receive a user request along with the Architect's draft:
1. Analyze algorithmic complexity (Big-O) — suggest better algorithms where possible
2. Identify performance bottlenecks: N+1 queries, unnecessary re-renders, memory leaks, blocking I/O
3. Check code quality: DRY violations, SOLID principles, proper typing, clean architecture
4. Review edge cases: null/undefined handling, empty arrays, concurrent access, large inputs
5. Suggest optimizations with measurable impact estimates
6. Verify the code actually solves the user's problem completely
7. Ensure cross-platform compatibility and accessibility where relevant

Your output must be:
- An OPTIMIZATION REPORT with improvements ranked by impact (High > Medium > Low)
- For each improvement: the current code, why it's suboptimal, and the exact optimized version
- A final ASSESSMENT: whether the code is production-ready, needs minor tweaks, or needs significant refactoring`;

const SYNTHESIS_SYSTEM_PROMPT = `You are the Synthesizer, the final voice of the Eesha AI Committee. Your job is to combine the work of three expert agents into ONE cohesive, final response.

You receive:
1. The ARCHITECT's implementation (code + design)
2. The SECURITY EXPERT's audit (vulnerabilities + fixes)
3. The OPTIMIZER's review (performance + quality improvements)

You MUST produce a single, unified, final answer that:
- Incorporates ALL security fixes — no vulnerabilities may remain
- Includes ALL high-impact optimizations
- Provides the COMPLETE, FINAL, READY-TO-SHIP code
- Is organized clearly with proper headings and explanations
- Includes instructions for running/using the code

CRITICAL RULES:
- The final code MUST be the Architect's code with ALL security fixes and optimizations applied
- NEVER ship code with known vulnerabilities
- If security and optimization conflict, security ALWAYS wins
- Include ALL files needed to run the project
- If the user asked to create/edit/delete files, output them in clear file blocks using this format:

---FILE: path/to/file.ext---
(file content here)
---END FILE---

- Be concise in explanations — focus on the final deliverable
- The user should be able to copy your code and run it immediately`;

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_file',
      description: 'Create or overwrite a file in the workspace. Creates parent directories automatically.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from workspace root' },
          content: { type: 'string', description: 'Full file content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Edit an existing file by replacing a specific string with a new string.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from workspace root' },
          old: { type: 'string', description: 'Exact text to find and replace' },
          new: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'old', 'new'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of a file from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from workspace root' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_file',
      description: 'Delete a file or directory from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file or directory path from workspace root' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_dir',
      description: 'List contents of a directory in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative directory path from workspace root' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Run a shell command in the workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory relative to workspace root (optional)' },
        },
        required: ['command'],
      },
    },
  },
];

// ─── Tool execution ──────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'create_file': {
        const filePath = args.path as string;
        const content = args.content as string;
        const fullPath = safePath(filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content || '', 'utf-8');
        return `File created successfully: ${filePath}`;
      }
      case 'edit_file': {
        const filePath = args.path as string;
        const oldText = args.old as string;
        const newText = args.new as string;
        const fullPath = safePath(filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        if (!content.includes(oldText)) {
          return `Warning: Could not find the specified text in ${filePath}. The file was not modified.`;
        }
        const newContent = content.replace(oldText, newText);
        await fs.writeFile(fullPath, newContent, 'utf-8');
        return `File edited successfully: ${filePath}`;
      }
      case 'read_file': {
        const filePath = args.path as string;
        const fullPath = safePath(filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        return `${filePath}:\n${content}`;
      }
      case 'delete_file': {
        const filePath = args.path as string;
        const fullPath = safePath(filePath);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          await fs.rm(fullPath, { recursive: true });
          return `Directory deleted: ${filePath}`;
        } else {
          await fs.unlink(fullPath);
          return `File deleted: ${filePath}`;
        }
      }
      case 'list_dir': {
        const dirPath = (args.path as string) || '';
        const fullPath = safePath(dirPath);
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const listing = entries.map(e => `${e.isDirectory() ? 'DIR ' : 'FILE'} ${e.name}`).join('\n');
        return `${dirPath || '/'}:\n${listing || '(empty directory)'}`;
      }
      case 'run_command': {
        const command = args.command as string;
        const cwd = args.cwd as string | undefined;
        const result = await runCommand(command, cwd);
        const parts: string[] = [];
        if (result.stdout) parts.push(result.stdout);
        if (result.stderr) parts.push(`STDERR:\n${result.stderr}`);
        parts.push(`Exit code: ${result.exitCode}`);
        return `Command: ${command}\n${parts.join('\n')}`;
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error) {
    return `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// ─── SSE Helper ───────────────────────────────────────────────────────────────

function sse(type: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

// ─── NVIDIA API Streaming Helper ──────────────────────────────────────────────

async function callNvidiaAPI(
  model: string,
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
  } = {},
): Promise<string> {
  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.6,
      top_p: options.top_p ?? 0.8,
      max_tokens: options.max_tokens ?? 8192,
      ...(options.frequency_penalty != null && { frequency_penalty: options.frequency_penalty }),
      ...(options.presence_penalty != null && { presence_penalty: options.presence_penalty }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA API error ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;

        if (delta?.content) {
          fullContent += delta.content;
        }
      } catch { /* skip */ }
    }
  }

  return fullContent;
}

// ─── File Block Parser ────────────────────────────────────────────────────────

interface FileBlock {
  path: string;
  content: string;
}

function parseFileBlocks(text: string): { files: FileBlock[]; cleanText: string } {
  const files: FileBlock[] = [];
  const regex = /---FILE:\s*(.+?)---\n([\s\S]*?)---END FILE---/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    files.push({
      path: match[1].trim(),
      content: match[2].replace(/\n$/, ''),
    });
  }

  const cleanText = text.replace(regex, '').replace(/\n{3,}/g, '\n\n').trim();
  return { files, cleanText };
}

// ─── Tool Call Parser (legacy ```tool blocks) ────────────────────────────────

function parseToolCallsFromText(text: string): { toolCalls: { name: string; args: Record<string, unknown> }[]; cleanText: string } {
  const toolCalls: { name: string; args: Record<string, unknown> }[] = [];
  let cleanText = text;

  const regex1 = /```tool\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex1.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const toolName = parsed.tool as string;
      const { tool: _, ...args } = parsed;
      toolCalls.push({ name: toolName, args });
      cleanText = cleanText.replace(match[0], '');
    } catch { /* skip */ }
  }

  // Kimi native format
  const regex2 = /<\|tool_call_begin\|>\s*functions\.(\w+):\d+\s*<\|tool_call_argument_begin\|>\s*([\s\S]*?)<\|tool_call_end\|>/g;
  while ((match = regex2.exec(text)) !== null) {
    try {
      const toolName = match[1];
      const args = JSON.parse(match[2].trim());
      toolCalls.push({ name: toolName, args });
      cleanText = cleanText.replace(match[0], '');
    } catch { /* skip */ }
  }

  cleanText = cleanText
    .replace(/<\|tool_calls_section_begin\|>/g, '')
    .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, '')
    .replace(/<\|tool_call_argument_begin\|>/g, '')
    .replace(/<\|tool_call_end\|>/g, '')
    .trim();

  return { toolCalls, cleanText };
}

// ─── Main POST Handler — Parallel Round Table Architecture ────────────────────

// ─── Free Tier Configuration ────────────────────────────────────────────────
const FREE_TIER_MAX = 5;
const FREE_TIER_COOKIE = 'eesha-free-credits';

export async function POST(req: NextRequest) {
  // ━━━ Support both authenticated and anonymous users ━━━━━━━━━━━━━━━━━━━━
  // Middleware already enforces free tier limits — we just need to identify
  const isAuthenticated = req.headers.get('x-authenticated') === 'true';
  const userId = req.headers.get('x-user-id') || 'anonymous';

  try {
    const { messages, conversationId } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!AGENT1_API_KEY || !AGENT2_API_KEY || !AGENT3_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Agent API keys not configured.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ━━━ SECURITY: Verify conversation belongs to user (authenticated only) ━━
    if (isAuthenticated && conversationId && isDatabaseAvailable()) {
      try {
        const conversation = await db.conversation.findUnique({
          where: { id: conversationId },
          select: { userId: true },
        });
        if (conversation && conversation.userId !== userId) {
          return new Response(
            JSON.stringify({ error: 'Access denied.' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch (dbError) { console.error('Conversation ownership check failed:', dbError); }
    }

    // Save user message to database (authenticated users only — anonymous = no DB)
    const lastMessage = messages[messages.length - 1];
    if (isAuthenticated && lastMessage.role === 'user' && conversationId && isDatabaseAvailable()) {
      try {
        await db.message.create({ data: { role: 'user', content: lastMessage.content, conversationId } });
      } catch (dbError) { console.error('Failed to save user message:', dbError); }
    }

    // Auto-generate title (authenticated only)
    if (isAuthenticated && conversationId && messages.length === 1 && isDatabaseAvailable()) {
      try {
        const title = lastMessage.content.slice(0, 60) + (lastMessage.content.length > 60 ? '...' : '');
        await db.conversation.update({ where: { id: conversationId }, data: { title } });
      } catch (dbError) { console.error('Failed to update title:', dbError); }
    }

    const userMessages: Array<{ role: string; content: string }> = messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const userQuestion = userMessages.filter(m => m.role === 'user').map(m => m.content).join('\n');

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // ━━━ PHASE 1: PARALLEL DELIBERATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          controller.enqueue(encoder.encode(sse('deliberation', { status: 'started' })));

          const [architectResult, securityResult, optimizerResult] = await Promise.allSettled([
            // Agent 1: The Architect
            (async () => {
              controller.enqueue(encoder.encode(sse('agent_update', { agent: 'architect', status: 'working' })));
              const content = await callNvidiaAPI(AGENT1_MODEL, AGENT1_API_KEY, [
                { role: 'system', content: ARCHITECT_SYSTEM_PROMPT },
                ...userMessages,
              ], { temperature: 0.7, top_p: 0.8, max_tokens: 8192 });
              controller.enqueue(encoder.encode(sse('agent_update', { agent: 'architect', status: 'done' })));
              return content;
            })(),

            // Agent 2: The Security Expert
            (async () => {
              controller.enqueue(encoder.encode(sse('agent_update', { agent: 'security', status: 'working' })));
              const content = await callNvidiaAPI(AGENT2_MODEL, AGENT2_API_KEY, [
                { role: 'system', content: SECURITY_SYSTEM_PROMPT },
                {
                  role: 'user',
                  content: `Analyze this coding request for security considerations:\n\n${userQuestion}\n\nProvide a proactive security analysis: what vulnerabilities commonly appear in code for this type of request? What security patterns MUST be applied? What should the code AVOID doing? Give specific, actionable security requirements that must be met in the final implementation.`,
                },
              ], { temperature: 1, top_p: 0.9, max_tokens: 8192 });
              controller.enqueue(encoder.encode(sse('agent_update', { agent: 'security', status: 'done' })));
              return content;
            })(),

            // Agent 3: The Optimizer
            (async () => {
              controller.enqueue(encoder.encode(sse('agent_update', { agent: 'optimizer', status: 'working' })));
              const content = await callNvidiaAPI(AGENT3_MODEL, AGENT3_API_KEY, [
                { role: 'system', content: OPTIMIZER_SYSTEM_PROMPT },
                {
                  role: 'user',
                  content: `Analyze this coding request for optimization considerations:\n\n${userQuestion}\n\nProvide a proactive optimization analysis: what performance pitfalls commonly occur? What algorithms and data structures are best? What edge cases must be handled? What code quality standards should the final implementation meet? Give specific, actionable requirements.`,
                },
              ], { temperature: 0.15, top_p: 1.0, max_tokens: 4096, frequency_penalty: 0, presence_penalty: 0 });
              controller.enqueue(encoder.encode(sse('agent_update', { agent: 'optimizer', status: 'done' })));
              return content;
            })(),
          ]);

          const architectDraft = architectResult.status === 'fulfilled' ? architectResult.value : '';
          const securityAnalysis = securityResult.status === 'fulfilled' ? securityResult.value : '';
          const optimizerAnalysis = optimizerResult.status === 'fulfilled' ? optimizerResult.value : '';

          if (!architectDraft && !securityAnalysis && !optimizerAnalysis) {
            controller.enqueue(encoder.encode(sse('error', { content: 'All agents failed. Please try again.' })));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }

          // ━━━ PHASE 2: SYNTHESIS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          controller.enqueue(encoder.encode(sse('deliberation', { status: 'synthesizing' })));

          const synthesisContent = await callNvidiaAPI(AGENT1_MODEL, AGENT1_API_KEY, [
            { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `**User's Request:**\n${userQuestion}\n\n**The Architect's Implementation:**\n${architectDraft || '(Architect failed — design from scratch)'}\n\n**Security Expert's Analysis:**\n${securityAnalysis || '(Security expert failed — apply standard security practices)'}\n\n**Optimizer's Analysis:**\n${optimizerAnalysis || '(Optimizer failed — apply standard best practices)'}\n\nSynthesize all three perspectives into ONE final, complete, production-ready answer. Apply ALL security fixes and high-impact optimizations. Output any files using the ---FILE: path--- format for automatic creation.`,
            },
          ], { temperature: 0.3, top_p: 0.9, max_tokens: 8192 });

          controller.enqueue(encoder.encode(sse('deliberation', { status: 'complete' })));

          // ━━━ PHASE 3: STREAM FINAL ANSWER + EXECUTE FILES ━━━━━━━━━━━━━━
          const { files, cleanText } = parseFileBlocks(synthesisContent);

          for (const file of files) {
            controller.enqueue(encoder.encode(sse('tool_start', {
              tool: 'create_file',
              path: file.path,
              command: '',
            })));

            const result = await executeTool('create_file', { path: file.path, content: file.content });

            controller.enqueue(encoder.encode(sse('tool_result', {
              tool: 'create_file',
              result,
            })));
          }

          const { toolCalls, cleanText: finalCleanText } = parseToolCallsFromText(cleanText);

          for (const tc of toolCalls) {
            controller.enqueue(encoder.encode(sse('tool_start', {
              tool: tc.name,
              path: (tc.args.path as string) || '',
              command: (tc.args.command as string) || '',
            })));

            const result = await executeTool(tc.name, tc.args);

            controller.enqueue(encoder.encode(sse('tool_result', {
              tool: tc.name,
              result,
            })));
          }

          const finalResponse = finalCleanText || synthesisContent;

          // Stream in chunks
          const CHUNK_SIZE = 8;
          for (let i = 0; i < finalResponse.length; i += CHUNK_SIZE) {
            const chunk = finalResponse.slice(i, i + CHUNK_SIZE);
            controller.enqueue(encoder.encode(sse('content', { content: chunk })));
          }

          // Save to database — scoped to authenticated user only
          if (isAuthenticated && conversationId && finalResponse && isDatabaseAvailable()) {
            try {
              await db.message.create({ data: { role: 'assistant', content: finalResponse, conversationId } });
              await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
            } catch (dbError) { console.error('Failed to save assistant message:', dbError); }
          }

          // ━━━ Track API usage for security monitoring (authenticated only) ━━
          if (isAuthenticated && isDatabaseAvailable()) {
            try {
              await db.apiUsage.create({
                data: {
                  userId,
                  endpoint: 'chat',
                  model: 'committee',
                  tokensIn: userQuestion.length,
                  tokensOut: finalResponse.length,
                },
              });
            } catch { /* non-critical */ }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          try {
            controller.enqueue(encoder.encode(sse('error', { content: 'Stream interrupted. Please try again.' })));
          } catch { /* controller already closed */ }
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
