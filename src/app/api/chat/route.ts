import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are Kimi K2.5, an advanced AI coding assistant built by Moonshot AI. You are an expert in software engineering across all programming languages and frameworks.

Your capabilities include:
- Writing, reviewing, and debugging code in any language
- Explaining complex programming concepts clearly
- Suggesting best practices, design patterns, and architectural decisions
- Analyzing code for performance, security, and maintainability
- Generating complete applications, APIs, and systems
- Helping with DevOps, databases, cloud infrastructure, and more

When writing code:
- Always use proper syntax highlighting and code blocks with language identifiers
- Include comments for complex logic
- Follow language-specific conventions and best practices
- Provide complete, runnable code when possible
- Suggest tests when appropriate

When explaining:
- Be thorough but concise
- Use examples to illustrate concepts
- Break complex topics into digestible parts
- Reference relevant documentation or standards when helpful

Be direct, accurate, and helpful. If you're unsure about something, say so rather than guessing.`;

// NVIDIA API — OpenAI-compatible endpoint for Kimi K2.5
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const MODEL_ID = 'moonshotai/kimi-k2.5';

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
        JSON.stringify({ error: 'NVIDIA_API_KEY not configured. Set it in your .env file.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Save user message to database
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user' && conversationId) {
      await db.message.create({
        data: { role: 'user', content: lastMessage.content, conversationId },
      });
    }

    // Auto-generate title from first user message
    if (conversationId && messages.length === 1) {
      const title = lastMessage.content.slice(0, 60) + (lastMessage.content.length > 60 ? '...' : '');
      await db.conversation.update({
        where: { id: conversationId },
        data: { title },
      });
    }

    // Prepare messages for NVIDIA's OpenAI-compatible API
    const aiMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Call NVIDIA API — OpenAI-compatible streaming endpoint
    const nvidiaResponse = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: aiMessages,
        stream: true,
        temperature: 0.6,
        top_p: 0.7,
        max_tokens: 8192,
      }),
    });

    if (!nvidiaResponse.ok) {
      const errorText = await nvidiaResponse.text();
      console.error(`NVIDIA API error ${nvidiaResponse.status}:`, errorText);
      return new Response(
        JSON.stringify({ error: `NVIDIA API error: ${nvidiaResponse.status}` }),
        { status: nvidiaResponse.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Process the OpenAI-compatible streaming response from NVIDIA
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullResponse = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          const reader = nvidiaResponse.body?.getReader();
          if (!reader) throw new Error('No response body from NVIDIA');

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
                  fullResponse += content;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                  );
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }

          // Save assistant response to database
          if (conversationId && fullResponse) {
            await db.message.create({
              data: { role: 'assistant', content: fullResponse, conversationId },
            });
            await db.conversation.update({
              where: { id: conversationId },
              data: { updatedAt: new Date() },
            });
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`)
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
