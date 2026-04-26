import { NextRequest } from 'next/server';
import { db, isDatabaseAvailable } from '@/lib/db';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const MODEL_ID = 'moonshotai/kimi-k2.5';

// ─── Tool definitions for native function calling ────────────────────────────
const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_file',
      description: 'Create or overwrite a file in the workspace. Creates parent directories automatically. Use this to write code, config files, or any text content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from workspace root, e.g. "src/index.ts"' },
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
      description: 'Edit an existing file by replacing a specific string with a new string. The old string must match exactly. Use this for targeted edits rather than rewriting entire files.',
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
      description: 'Read the contents of a file from the workspace. Returns the full text content.',
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
      description: 'Delete a file or directory from the workspace. Use with caution - this action cannot be undone.',
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
      description: 'List contents of a directory in the workspace. Shows files and subdirectories.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative directory path from workspace root. Use empty string for root.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Run a shell command in the workspace directory. Use for installing packages, running scripts, git operations, and any system commands. Commands run with a 30-second timeout.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute, e.g. "npm install express" or "python main.py"' },
          cwd: { type: 'string', description: 'Working directory relative to workspace root (optional)' },
        },
        required: ['command'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are Eesha AI, an advanced AI coding agent powered by Kimi K2.5. You are an expert in software engineering across all programming languages and frameworks.

You are a CODING AGENT — not just a chatbot. When users ask you to build something, you MUST:
1. Plan your approach briefly
2. Create actual files using the create_file tool
3. Install dependencies using run_command
4. Run and test the code using run_command
5. Fix any errors by editing files with edit_file

CRITICAL RULES:
- When asked to write code, ALWAYS use create_file to save it to a file. NEVER just output code in your response.
- When asked to modify code, use edit_file for small changes or create_file to rewrite the whole file.
- When asked to read existing code, use read_file.
- When asked to delete files, use delete_file.
- When asked to run commands, use run_command.
- After creating or editing files, always run them to verify they work.
- If there are errors, read the error output and fix the code.
- Be thorough — create all necessary files for a project to work.
- Support ANY file type: .py, .js, .ts, .html, .css, .json, .yaml, .md, .sh, .sql, .go, .rs, .java, .rb, .php, .c, .cpp, .swift, .kt, etc.

You have full access to a workspace filesystem. Use it to create real, runnable projects.`;

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

// ─── Fallback: parse ```tool blocks from text ────────────────────────────────

function parseToolCallsFromText(text: string): { toolCalls: { name: string; args: Record<string, unknown> }[]; cleanText: string } {
  const toolCalls: { name: string; args: Record<string, unknown> }[] = [];
  let cleanText = text;

  // Format 1: ```tool JSON blocks
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

  // Format 2: Kimi native <|tool_call_begin|> format
  const regex2 = /<\|tool_call_begin\|>\s*functions\.(\w+):\d+\s*<\|tool_call_argument_begin\|>\s*([\s\S]*?)<\|tool_call_end\|>/g;
  while ((match = regex2.exec(text)) !== null) {
    try {
      const toolName = match[1];
      const args = JSON.parse(match[2].trim());
      toolCalls.push({ name: toolName, args });
      cleanText = cleanText.replace(match[0], '');
    } catch { /* skip */ }
  }

  // Clean up remaining tool markers
  cleanText = cleanText
    .replace(/<\|tool_calls_section_begin\|>/g, '')
    .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, '')
    .replace(/<\|tool_call_argument_begin\|>/g, '')
    .replace(/<\|tool_call_end\|>/g, '')
    .trim();

  return { toolCalls, cleanText };
}

// ─── Main POST handler ───────────────────────────────────────────────────────

interface CollectedToolCall {
  id: string;
  name: string;
  arguments: string;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, conversationId } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!NVIDIA_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'NVIDIA_API_KEY not configured.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Save user message to database
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user' && conversationId && isDatabaseAvailable()) {
      try {
        await db.message.create({ data: { role: 'user', content: lastMessage.content, conversationId } });
      } catch (dbError) { console.error('Failed to save user message:', dbError); }
    }

    // Auto-generate title
    if (conversationId && messages.length === 1 && isDatabaseAvailable()) {
      try {
        const title = lastMessage.content.slice(0, 60) + (lastMessage.content.length > 60 ? '...' : '');
        await db.conversation.update({ where: { id: conversationId }, data: { title } });
      } catch (dbError) { console.error('Failed to update title:', dbError); }
    }

    // Build messages for NVIDIA API
    const aiMessages: Array<{ role: string; content?: string; tool_calls?: any[]; tool_call_id?: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const encoder = new TextEncoder();
    let fullResponse = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          const MAX_ITERATIONS = 8;

          for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            // ── Call NVIDIA API with tools ──────────────────────────────────
            const nvidiaResponse = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NVIDIA_API_KEY}`,
                'Accept': 'text/event-stream',
              },
              body: JSON.stringify({
                model: MODEL_ID,
                messages: aiMessages,
                tools: TOOLS,
                stream: true,
                temperature: 0.6,
                top_p: 0.7,
                max_tokens: 32768,
              }),
            });

            if (!nvidiaResponse.ok) {
              const errorText = await nvidiaResponse.text();
              console.error(`NVIDIA API error ${nvidiaResponse.status}: ${errorText.slice(0, 500)}`);

              // If tools not supported, retry without tools (fallback mode)
              if (nvidiaResponse.status === 400 && errorText.includes('tool')) {
                console.log('Tools not supported, falling back to text-based tool calling...');
                const fallbackResponse = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${NVIDIA_API_KEY}`,
                    'Accept': 'text/event-stream',
                  },
                  body: JSON.stringify({
                    model: MODEL_ID,
                    messages: [
                      { role: 'system', content: SYSTEM_PROMPT + '\n\nIMPORTANT: You MUST use tools by outputting ```tool JSON blocks. Example:\n```tool\n{"tool": "create_file", "path": "hello.py", "content": "print(\\"hello\\")"}\n```' },
                      ...messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
                    ],
                    stream: true,
                    temperature: 0.6,
                    top_p: 0.7,
                    max_tokens: 32768,
                  }),
                });

                if (!fallbackResponse.ok) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: `API error: ${fallbackResponse.status}` })}\n\n`));
                  break;
                }

                // Process fallback response with text-based tool parsing
                await processStreamWithTextToolParsing(fallbackResponse, controller, encoder, aiMessages, fullResponse);
                fullResponse = ''; // will be updated by the function
                break;
              }

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: `NVIDIA API error: ${nvidiaResponse.status}` })}\n\n`));
              break;
            }

            // ── Stream and collect tool calls ──────────────────────────────
            const reader = nvidiaResponse.body?.getReader();
            if (!reader) break;

            const decoder = new TextDecoder();
            let buffer = '';
            let iterationContent = '';
            let finishReason: string | null = null;

            // Collect tool calls from streaming deltas
            const toolCallsMap = new Map<number, CollectedToolCall>();

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

                  // Handle text content
                  if (delta?.content) {
                    iterationContent += delta.content;
                    fullResponse += delta.content;

                    // Filter out tool markers from displayed content
                    const filteredContent = delta.content
                      .replace(/<\|tool_calls_section_begin\|>/g, '')
                      .replace(/<\|tool_call_begin\|>/g, '')
                      .replace(/<\|tool_call_argument_begin\|>/g, '')
                      .replace(/<\|tool_call_end\|>/g, '');

                    if (filteredContent) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: filteredContent })}\n\n`));
                    }
                  }

                  // Handle native tool calls
                  if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      const idx = tc.index ?? 0;
                      if (!toolCallsMap.has(idx)) {
                        toolCallsMap.set(idx, {
                          id: tc.id || `call_${idx}`,
                          name: tc.function?.name || '',
                          arguments: '',
                        });
                      }
                      const existing = toolCallsMap.get(idx)!;
                      if (tc.id) existing.id = tc.id;
                      if (tc.function?.name) existing.name = tc.function.name;
                      if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                    }
                  }

                  // Handle finish reason
                  if (choice.finish_reason) {
                    finishReason = choice.finish_reason;
                  }
                } catch { /* skip */ }
              }
            }

            // ── Process tool calls ──────────────────────────────────────────
            const hasNativeToolCalls = toolCallsMap.size > 0;

            // Also check for text-based tool calls as fallback
            const { toolCalls: textToolCalls, cleanText } = parseToolCallsFromText(iterationContent);

            let toolCallsToExecute: { name: string; args: Record<string, unknown>; id: string }[] = [];

            if (hasNativeToolCalls) {
              // Use native function calling tool calls
              for (const [idx, tc] of toolCallsMap) {
                try {
                  const args = JSON.parse(tc.arguments);
                  toolCallsToExecute.push({ name: tc.name, args, id: tc.id });
                } catch {
                  console.error(`Failed to parse tool call arguments: ${tc.arguments}`);
                }
              }
            } else if (textToolCalls.length > 0) {
              // Fallback to text-based tool calls
              toolCallsToExecute = textToolCalls.map((tc, i) => ({
                name: tc.name,
                args: tc.args,
                id: `text_call_${i}`,
              }));

              // If we extracted tool calls from text, update the displayed content to remove them
              if (cleanText !== iterationContent && cleanText) {
                // The tool call blocks were already filtered in streaming, no need to re-send
              }
            }

            // No tool calls — we're done
            if (toolCallsToExecute.length === 0) {
              break;
            }

            // ── Execute tools ───────────────────────────────────────────────
            const toolResults: { id: string; name: string; result: string }[] = [];

            for (const tc of toolCallsToExecute) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'tool_start',
                tool: tc.name,
                path: (tc.args.path as string) || '',
                command: (tc.args.command as string) || '',
              })}\n\n`));

              const result = await executeTool(tc.name, tc.args);
              toolResults.push({ id: tc.id, name: tc.name, result });

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'tool_result',
                tool: tc.name,
                result,
              })}\n\n`));
            }

            // ── Build messages for next iteration ───────────────────────────
            if (hasNativeToolCalls) {
              // Standard OpenAI function calling format
              aiMessages.push({
                role: 'assistant',
                content: iterationContent || null,
                tool_calls: toolCallsToExecute.map((tc, i) => ({
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: JSON.stringify(tc.args) },
                })),
              } as any);

              for (const tr of toolResults) {
                aiMessages.push({
                  role: 'tool',
                  content: tr.result,
                  tool_call_id: tr.id,
                } as any);
              }
            } else {
              // Text-based tool calling format
              aiMessages.push({ role: 'assistant', content: iterationResponse_clean(cleanText, iterationContent) });

              const resultsSummary = toolResults.map(tr =>
                `Tool: ${tr.name}\nResult: ${tr.result}`
              ).join('\n\n---\n\n');

              aiMessages.push({
                role: 'user',
                content: `Tool execution results:\n\n${resultsSummary}\n\nContinue based on these results. If everything is working, summarize what you did. If there are errors, fix them using the appropriate tools.`,
              });
            }

            fullResponse += `\n\n${toolResults.map(tr => `[${tr.name}] ${tr.result}`).join('\n')}`;

            // If finish_reason is not tool_calls, the model is done
            if (finishReason && finishReason !== 'tool_calls') {
              break;
            }
          }

          // Save assistant response to database
          if (conversationId && fullResponse && isDatabaseAvailable()) {
            try {
              await db.message.create({ data: { role: 'assistant', content: fullResponse, conversationId } });
              await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
            } catch (dbError) { console.error('Failed to save assistant message:', dbError); }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: 'Stream interrupted. Please try again.' })}\n\n`));
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

// ─── Helper for fallback text-based tool parsing stream ──────────────────────

async function processStreamWithTextToolParsing(
  response: Response,
  controller: WritableStreamDefaultController,
  encoder: TextEncoder,
  aiMessages: Array<{ role: string; content?: string }>,
  fullResponseRef: string,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';
  let iterationResponse = '';

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
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          iterationResponse += content;

          const filteredContent = content
            .replace(/<\|tool_calls_section_begin\|>/g, '')
            .replace(/<\|tool_call_begin\|>/g, '')
            .replace(/<\|tool_call_argument_begin\|>/g, '')
            .replace(/<\|tool_call_end\|>/g, '');

          if (filteredContent) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: filteredContent })}\n\n`));
          }
        }
      } catch { /* skip */ }
    }
  }

  // Check for text-based tool calls
  const { toolCalls, cleanText } = parseToolCallsFromText(iterationResponse);

  if (toolCalls.length > 0) {
    for (const tc of toolCalls) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'tool_start',
        tool: tc.name,
        path: (tc.args.path as string) || '',
        command: (tc.args.command as string) || '',
      })}\n\n`));

      const result = await executeTool(tc.name, tc.args);

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'tool_result',
        tool: tc.name,
        result,
      })}\n\n`));
    }
  }
}

function iterationResponse_clean(cleanText: string, original: string): string {
  return cleanText || original.replace(/```tool[\s\S]*?```/g, '').trim();
}
