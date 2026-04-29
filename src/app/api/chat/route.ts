import { NextRequest } from 'next/server';
import { db, isDatabaseAvailable } from '@/lib/db';
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
// API keys are read from environment variables (set as HF Spaces Secrets)
const AGENT1_API_KEY = process.env.AGENT1_API_KEY || '';
const AGENT2_API_KEY = process.env.AGENT2_API_KEY || '';
const AGENT3_API_KEY = process.env.AGENT3_API_KEY || '';

const AGENT1_MODEL = 'qwen/qwen3-coder-480b-a35b-instruct';
const AGENT2_MODEL = 'moonshotai/kimi-k2-thinking';
const AGENT3_MODEL = 'mistralai/mistral-large-3-675b-instruct-2512';

const AGENT1_SYSTEM_PROMPT = `You are The Specialist, an expert coding AI agent. You are part of a "Committee of AI" multi-agent system for Eesha AI.

Your role is to generate a thorough, accurate initial response to the user's coding question. Be comprehensive and provide well-structured code solutions with clear explanations. Include edge cases and best practices where relevant. If writing code, make it production-ready with proper error handling.

You are a CODING AGENT — not just a chatbot. When users ask you to build something, you MUST:
1. Plan your approach briefly
2. Provide complete, runnable code solutions
3. Include all necessary imports, setup, and configuration
4. Consider error handling and edge cases
5. Follow best practices for the relevant language/framework`;

const AGENT2_SYSTEM_PROMPT = `You are The Critic, a rigorous code reviewer AI agent. You are part of a "Committee of AI" multi-agent system for Eesha AI.

Your role is to review the Specialist's draft answer for:
- Bugs, logic errors, or incorrect code
- Security vulnerabilities or performance issues
- Missing edge cases or error handling
- Deviations from best practices or coding standards
- Incomplete solutions or missing imports
- Any misleading or incorrect explanations

Provide a refined version of the answer that fixes all issues you find. Be specific about what you're changing and why. If the original answer is already excellent, say so and provide minor improvements.`;

const AGENT3_SYSTEM_PROMPT = `You are The Judge, the final decision-maker AI agent. You are part of a "Committee of AI" multi-agent system for Eesha AI.

Your role is to synthesize the original question, the Specialist's draft, and the Critic's review into a final, polished, definitive answer.

Rules:
- Incorporate valid critiques from the Critic
- Resolve any disagreements between the Specialist and Critic
- If the Critic found no issues, polish the Specialist's answer for clarity
- If the Critic found issues, produce the corrected version
- Always provide the complete, final answer — never just describe what changed
- Make the final answer as clear, accurate, and helpful as possible
- Include complete code blocks where code is needed`;

// ─── Tool definitions for the coding agent functionality ───────────────────────
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

function sseEvent(type: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

// ─── Agent 1: The Specialist (Qwen Coder via OpenAI SDK compatible API) ──────

async function runAgent1Specialist(
  userMessages: Array<{ role: string; content: string }>,
  controller: WritableStreamDefaultController,
  encoder: TextEncoder,
): Promise<string> {
  // Send agent status
  controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'specialist', status: 'thinking' })));

  const messages = [
    { role: 'system', content: AGENT1_SYSTEM_PROMPT },
    ...userMessages,
  ];

  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AGENT1_API_KEY}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      model: AGENT1_MODEL,
      messages,
      temperature: 0.7,
      top_p: 0.8,
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Agent 1 (Specialist) API error ${response.status}: ${errorText.slice(0, 500)}`);
    controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'specialist', status: 'error' })));
    return `[Specialist Error: API returned ${response.status}]`;
  }

  // Send agent status — now generating
  controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'specialist', status: 'generating' })));

  const reader = response.body?.getReader();
  if (!reader) return '';

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
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullContent += content;
          // Stream to frontend with agent label
          controller.enqueue(encoder.encode(sseEvent('agent_content', {
            agent: 'specialist',
            content,
          })));
        }
      } catch { /* skip */ }
    }
  }

  controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'specialist', status: 'done' })));
  return fullContent;
}

// ─── Agent 2: The Critic (Kimi K2 Thinking) ──────────────────────────────────

async function runAgent2Critic(
  userMessages: Array<{ role: string; content: string }>,
  specialistDraft: string,
  controller: WritableStreamDefaultController,
  encoder: TextEncoder,
): Promise<{ content: string; reasoning: string }> {
  // Send agent status
  controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'critic', status: 'thinking' })));

  const userQuestion = userMessages.filter(m => m.role === 'user').map(m => m.content).join('\n');

  const messages = [
    { role: 'system', content: AGENT2_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `**Original User Question:**\n${userQuestion}\n\n**Specialist's Draft Answer:**\n${specialistDraft}\n\nPlease review the Specialist's draft above. Identify any errors, inefficiencies, missing edge cases, or improvements. Provide your refined version.`,
    },
  ];

  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AGENT2_API_KEY}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      model: AGENT2_MODEL,
      messages,
      temperature: 1,
      top_p: 0.9,
      max_tokens: 16384,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Agent 2 (Critic) API error ${response.status}: ${errorText.slice(0, 500)}`);
    controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'critic', status: 'error' })));
    return { content: `[Critic Error: API returned ${response.status}]`, reasoning: '' };
  }

  // Send agent status — now generating
  controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'critic', status: 'generating' })));

  const reader = response.body?.getReader();
  if (!reader) return { content: '', reasoning: '' };

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let fullReasoning = '';

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

        // Capture reasoning_content (chain of thought) — send as thinking to frontend
        const reasoning = delta?.reasoning_content;
        if (reasoning) {
          fullReasoning += reasoning;
          // Send reasoning as thinking to frontend (collapsible)
          controller.enqueue(encoder.encode(sseEvent('agent_thinking', {
            agent: 'critic',
            content: reasoning,
          })));
        }

        // Capture actual content
        if (delta?.content) {
          fullContent += delta.content;
          // Stream to frontend with agent label
          controller.enqueue(encoder.encode(sseEvent('agent_content', {
            agent: 'critic',
            content: delta.content,
          })));
        }
      } catch { /* skip */ }
    }
  }

  controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'critic', status: 'done' })));
  return { content: fullContent, reasoning: fullReasoning };
}

// ─── Agent 3: The Judge (Mistral Large via HTTP requests) ─────────────────────

async function runAgent3Judge(
  userMessages: Array<{ role: string; content: string }>,
  specialistDraft: string,
  criticContent: string,
  controller: WritableStreamDefaultController,
  encoder: TextEncoder,
): Promise<string> {
  // Send agent status
  controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'judge', status: 'thinking' })));

  const userQuestion = userMessages.filter(m => m.role === 'user').map(m => m.content).join('\n');

  const messages = [
    { role: 'system', content: AGENT3_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `**Original User Question:**\n${userQuestion}\n\n**Specialist's Draft Answer:**\n${specialistDraft}\n\n**Critic's Review:**\n${criticContent}\n\nBased on the original question, the Specialist's draft, and the Critic's review, produce the final, polished, definitive answer. Incorporate valid critiques and resolve any disagreements.`,
    },
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AGENT3_API_KEY}`,
    'Accept': 'text/event-stream',
  };

  const payload = {
    model: AGENT3_MODEL,
    messages,
    max_tokens: 2048,
    temperature: 0.15,
    top_p: 1.00,
    frequency_penalty: 0.00,
    presence_penalty: 0.00,
    stream: true,
  };

  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Agent 3 (Judge) API error ${response.status}: ${errorText.slice(0, 500)}`);
    controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'judge', status: 'error' })));
    return `[Judge Error: API returned ${response.status}]`;
  }

  // Send agent status — now generating
  controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'judge', status: 'generating' })));

  const reader = response.body?.getReader();
  if (!reader) return '';

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
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullContent += content;
          // Stream to frontend with agent label
          controller.enqueue(encoder.encode(sseEvent('agent_content', {
            agent: 'judge',
            content,
          })));
        }
      } catch { /* skip */ }
    }
  }

  controller.enqueue(encoder.encode(sseEvent('agent_status', { agent: 'judge', status: 'done' })));
  return fullContent;
}

// ─── Tool execution from Agent 1 content ──────────────────────────────────────

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

// ─── Execute tools from specialist draft and send results to frontend ─────────

async function executeToolsFromDraft(
  draftContent: string,
  controller: WritableStreamDefaultController,
  encoder: TextEncoder,
): Promise<string> {
  const { toolCalls, cleanText } = parseToolCallsFromText(draftContent);

  if (toolCalls.length === 0) return cleanText;

  for (const tc of toolCalls) {
    controller.enqueue(encoder.encode(sseEvent('tool_start', {
      tool: tc.name,
      path: (tc.args.path as string) || '',
      command: (tc.args.command as string) || '',
    })));

    const result = await executeTool(tc.name, tc.args);

    controller.enqueue(encoder.encode(sseEvent('tool_result', {
      tool: tc.name,
      result,
    })));
  }

  return cleanText;
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

    if (!AGENT1_API_KEY || !AGENT2_API_KEY || !AGENT3_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Agent API keys not configured.' }),
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

    // Build user messages array
    const userMessages: Array<{ role: string; content: string }> = messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const encoder = new TextEncoder();
    let fullResponse = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // ── Step 1: Agent 1 — The Specialist ──────────────────────────────
          controller.enqueue(encoder.encode(sseEvent('pipeline_status', { status: 'specialist', message: 'Committee deliberating — Specialist is drafting...' })));

          let specialistDraft = '';
          try {
            specialistDraft = await runAgent1Specialist(userMessages, controller, encoder);
          } catch (err) {
            console.error('Agent 1 error:', err);
            specialistDraft = '';
            controller.enqueue(encoder.encode(sseEvent('agent_content', {
              agent: 'specialist',
              content: '\n*Specialist encountered an error. Proceeding with available input.*\n\n',
            })));
          }

          // Execute any tools found in the specialist draft
          if (specialistDraft) {
            const cleanedDraft = await executeToolsFromDraft(specialistDraft, controller, encoder);
            fullResponse += cleanedDraft;
          }

          // ── Step 2: Agent 2 — The Critic ─────────────────────────────────
          controller.enqueue(encoder.encode(sseEvent('pipeline_status', { status: 'critic', message: 'Committee deliberating — Critic is reviewing...' })));

          let criticResult = { content: '', reasoning: '' };
          try {
            criticResult = await runAgent2Critic(userMessages, specialistDraft, controller, encoder);
          } catch (err) {
            console.error('Agent 2 error:', err);
            criticResult = { content: '', reasoning: '' };
            controller.enqueue(encoder.encode(sseEvent('agent_content', {
              agent: 'critic',
              content: '\n*Critic encountered an error. Proceeding with Specialist draft.*\n\n',
            })));
          }

          // ── Step 3: Agent 3 — The Judge ───────────────────────────────────
          controller.enqueue(encoder.encode(sseEvent('pipeline_status', { status: 'judge', message: 'Committee deliberating — Judge is delivering final answer...' })));

          let judgeFinal = '';
          try {
            // If critic failed but specialist succeeded, use specialist draft as critic input
            const criticInput = criticResult.content || specialistDraft;
            judgeFinal = await runAgent3Judge(userMessages, specialistDraft, criticInput, controller, encoder);
          } catch (err) {
            console.error('Agent 3 error:', err);
            judgeFinal = '';
            controller.enqueue(encoder.encode(sseEvent('agent_content', {
              agent: 'judge',
              content: '\n*Judge encountered an error. Providing best available response.*\n\n',
            })));
          }

          // If judge succeeded, the final response is the judge's output.
          // If judge failed but critic succeeded, use critic's output.
          // If both failed, use specialist's output.
          if (judgeFinal) {
            fullResponse = judgeFinal;
          } else if (criticResult.content) {
            fullResponse = criticResult.content;
          } else {
            fullResponse = specialistDraft || 'I encountered an issue processing your request. Please try again.';
          }

          // Save assistant response to database
          if (conversationId && fullResponse && isDatabaseAvailable()) {
            try {
              await db.message.create({ data: { role: 'assistant', content: fullResponse, conversationId } });
              await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
            } catch (dbError) { console.error('Failed to save assistant message:', dbError); }
          }

          // Signal pipeline completion
          controller.enqueue(encoder.encode(sseEvent('pipeline_status', { status: 'complete', message: 'Committee has reached consensus.' })));

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          try {
            controller.enqueue(encoder.encode(sseEvent('error', { content: 'Stream interrupted. Please try again.' })));
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
