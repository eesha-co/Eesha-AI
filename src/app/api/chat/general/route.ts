import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

// ─── General Chat Route ────────────────────────────────────────────────────────
// Uses z-ai-web-dev-sdk for general conversational AI

const GENERAL_SYSTEM_PROMPT = `You are Eesha AI, a friendly, intelligent, and versatile AI assistant. You excel at natural conversation, creative tasks, brainstorming, explanations, and helping users with a wide variety of everyday topics.

PERSONALITY:
- Warm, engaging, and conversational
- Knowledgeable but approachable
- Helpful with practical suggestions
- Creative and open-minded
- Respectful of different perspectives

CAPABILITIES:
- Answer questions on any topic
- Help with writing (emails, essays, stories, poems)
- Brainstorm ideas and solutions
- Explain complex topics simply
- Provide recommendations and advice
- Assist with planning and organization
- Tell stories and jokes
- Discuss current events, culture, science, technology
- Help with learning and studying

GUIDELINES:
1. Be natural and conversational — avoid being overly formal
2. Use markdown for formatting when it improves readability
3. When you don't know something, say so honestly
4. Be helpful and constructive in your suggestions
5. Respect user privacy — don't ask for personal information
6. Keep responses focused and relevant to the user's question
7. When appropriate, ask follow-up questions to better help the user
8. Adapt your tone to match the user's — be casual when they are, more structured when they need detailed information`;

export async function POST(req: NextRequest) {
  const isAuthenticated = req.headers.get('x-authenticated') === 'true';
  const userId = req.headers.get('x-user-id') || 'anonymous';

  try {
    const { messages, conversationId } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages are required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userMessages: Array<{ role: 'user' | 'assistant'; content: string }> = messages.map(
      (m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant', content: m.content })
    );

    // Use z-ai-web-dev-sdk for general chat
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: GENERAL_SYSTEM_PROMPT },
        ...userMessages,
      ],
      temperature: 0.8,
      max_tokens: 4096,
    });

    const assistantContent = completion.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.';

    // Stream the response using SSE for consistency with the chat UI
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Stream content in chunks for a typewriter effect
          const CHUNK_SIZE = 6;
          for (let i = 0; i < assistantContent.length; i += CHUNK_SIZE) {
            const chunk = assistantContent.slice(i, i + CHUNK_SIZE);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`)
            );
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('General chat streaming error:', error);
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'error', content: 'Stream interrupted.' })}\n\n`)
            );
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
    console.error('General chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
