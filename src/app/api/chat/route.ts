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
      timeout: 15000,
      maxBuffer: 1024 * 1024,
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

const TOOLS_PROMPT = `You have access to the following tools. Use them by outputting a JSON block inside \`\`\`tool\`\`\` code fences.

## Available Tools

### create_file
Create or overwrite a file in the workspace.
\`\`\`tool
{"tool": "create_file", "path": "relative/path/to/file.py", "content": "file contents here"}
\`\`\`

### edit_file
Edit a specific part of a file by replacing old text with new text.
\`\`\`tool
{"tool": "edit_file", "path": "relative/path/to/file.py", "old": "text to find", "new": "replacement text"}
\`\`\`

### run_command
Run a terminal command in the workspace directory.
\`\`\`tool
{"tool": "run_command", "command": "npm install express", "cwd": ""}
\`\`\`

### read_file
Read a file's contents from the workspace.
\`\`\`tool
{"tool": "read_file", "path": "relative/path/to/file.py"}
\`\`\`

### list_dir
List contents of a directory in the workspace.
\`\`\`tool
{"tool": "list_dir", "path": "src/components"}
\`\`\`

## Rules
- ALWAYS use tools when you need to create, edit, or read files, or run commands.
- When asked to build something, create the actual files using create_file.
- After creating files, use run_command to install dependencies and test if needed.
- You can use multiple tool calls in one response.
- After using tools, briefly explain what you did.
- Paths are relative to the workspace root.`;

const SYSTEM_PROMPT = `You are Eesha AI, an advanced AI coding agent powered by Kimi K2.5. You are an expert in software engineering across all programming languages and frameworks.

${TOOLS_PROMPT}

You are a CODING AGENT, not just a chatbot. When users ask you to build something, you should:
1. Plan your approach
2. Create the actual files using create_file
3. Install dependencies using run_command
4. Run and test the code using run_command
5. Iterate if there are errors

Be proactive — if someone asks you to build an API, create the files and run them. Don't just describe what to do — DO it.`;

// Parse tool calls from AI response text
function parseToolCalls(text: string): { toolCalls: any[]; cleanText: string } {
  const toolCalls: any[] = [];
  let cleanText = text;

  // Format 1: ```tool JSON blocks
  const regex1 = /```tool\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex1.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      toolCalls.push(parsed);
      cleanText = cleanText.replace(match[0], '');
    } catch { /* skip */ }
  }

  // Format 2: Kimi native format
  const regex2 = /<\|tool_call_begin\|>\s*functions\.(\w+):\d+\s*<\|tool_call_argument_begin\|>\s*([\s\S]*?)<\|tool_call_end\|>/g;
  while ((match = regex2.exec(text)) !== null) {
    try {
      const toolName = match[1];
      const args = JSON.parse(match[2].trim());
      toolCalls.push({ tool: toolName, ...args });
      cleanText = cleanText.replace(match[0], '');
    } catch { /* skip */ }
  }

  // Clean up any remaining tool markers
  cleanText = cleanText
    .replace(/<\|tool_calls_section_begin\|>/g, '')
    .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, '')
    .replace(/<\|tool_call_argument_begin\|>/g, '')
    .replace(/<\|tool_call_end\|>/g, '')
    .trim();

  return { toolCalls, cleanText };
}

// Execute a single tool call
async function executeTool(toolCall: any): Promise<string> {
  try {
    switch (toolCall.tool) {
      case 'create_file': {
        const fullPath = safePath(toolCall.path);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, toolCall.content || '', 'utf-8');
        return `File created: ${toolCall.path}`;
      }
      case 'edit_file': {
        const fullPath = safePath(toolCall.path);
        let content = await fs.readFile(fullPath, 'utf-8');
        content = content.replace(toolCall.old, toolCall.new);
        await fs.writeFile(fullPath, content, 'utf-8');
        return `File edited: ${toolCall.path}`;
      }
      case 'run_command': {
        const result = await runCommand(toolCall.command, toolCall.cwd);
        const output = [];
        if (result.stdout) output.push(result.stdout);
        if (result.stderr) output.push(`STDERR: ${result.stderr}`);
        output.push(`Exit code: ${result.exitCode}`);
        return `Command: ${toolCall.command}\n${output.join('\n')}`;
      }
      case 'read_file': {
        const fullPath = safePath(toolCall.path);
        const content = await fs.readFile(fullPath, 'utf-8');
        return `${toolCall.path}:\n\`\`\`\n${content}\n\`\`\``;
      }
      case 'list_dir': {
        const dirPath = safePath(toolCall.path || '');
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const listing = entries.map(e => `${e.isDirectory() ? 'DIR' : 'FILE'} ${e.name}`).join('\n');
        return `${toolCall.path || '/'}:\n${listing || '(empty)'}`;
      }
      default:
        return `Unknown tool: ${toolCall.tool}`;
    }
  } catch (error) {
    return `Error executing ${toolCall.tool}: ${String(error)}`;
  }
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

    // Save user message to database (graceful fallback)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user' && conversationId && isDatabaseAvailable()) {
      try {
        await db.message.create({
          data: { role: 'user', content: lastMessage.content, conversationId },
        });
      } catch (dbError) {
        console.error('Failed to save user message:', dbError);
      }
    }

    // Auto-generate title
    if (conversationId && messages.length === 1 && isDatabaseAvailable()) {
      try {
        const title = lastMessage.content.slice(0, 60) + (lastMessage.content.length > 60 ? '...' : '');
        await db.conversation.update({
          where: { id: conversationId },
          data: { title },
        });
      } catch (dbError) {
        console.error('Failed to update title:', dbError);
      }
    }

    // Build message list for NVIDIA API
    const aiMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
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
          const MAX_ITERATIONS = 5;

          for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
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
                stream: true,
                temperature: 0.6,
                top_p: 0.7,
                max_tokens: 16384,
              }),
            });

            if (!nvidiaResponse.ok) {
              const errorText = await nvidiaResponse.text();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: `NVIDIA API error: ${nvidiaResponse.status} - ${errorText.slice(0, 200)}` })}\n\n`));
              break;
            }

            const reader = nvidiaResponse.body?.getReader();
            if (!reader) break;

            const decoder = new TextDecoder();
            let iterationResponse = '';
            let buffer = '';

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
                    fullResponse += content;

                    const filteredContent = content
                      .replace(/<\|tool_calls_section_begin\|>/g, '')
                      .replace(/<\|tool_call_begin\|>/g, '')
                      .replace(/<\|tool_call_argument_begin\|>/g, '')
                      .replace(/<\|tool_call_end\|>/g, '');

                    if (filteredContent.trim()) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: 'content', content: filteredContent })}\n\n`)
                      );
                    }
                  }
                } catch { /* skip */ }
              }
            }

            const { toolCalls } = parseToolCalls(iterationResponse);

            if (toolCalls.length === 0) {
              break;
            }

            const toolResults: string[] = [];
            for (const toolCall of toolCalls) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'tool_start', tool: toolCall.tool, path: toolCall.path || '', command: toolCall.command || '' })}\n\n`)
              );

              const result = await executeTool(toolCall);
              toolResults.push(result);

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'tool_result', result })}\n\n`)
              );
            }

            aiMessages.push({ role: 'assistant', content: iterationResponse });
            aiMessages.push({
              role: 'user',
              content: `Tool execution results:\n\n${toolResults.join('\n\n---\n\n')}\n\nContinue based on these results. If everything is working, summarize what you did. If there are errors, fix them.`,
            });

            fullResponse += `\n\n${toolResults.join('\n\n')}`;
          }

          // Save assistant response to database (graceful fallback)
          if (conversationId && fullResponse && isDatabaseAvailable()) {
            try {
              await db.message.create({
                data: { role: 'assistant', content: fullResponse, conversationId },
              });
              await db.conversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
              });
            } catch (dbError) {
              console.error('Failed to save assistant message:', dbError);
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', content: 'Stream interrupted' })}\n\n`)
          );
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
