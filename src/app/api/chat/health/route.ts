import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

// ─── Health AI Chat Route ──────────────────────────────────────────────────────
// Uses z-ai-web-dev-sdk for health-focused AI conversations

const HEALTH_SYSTEM_PROMPT = `You are Eesha Health AI, a knowledgeable and empathetic health assistant. You provide evidence-based health information while always emphasizing that you are NOT a doctor and your advice should not replace professional medical consultation.

GUIDELINES:
1. Always start serious medical discussions with a disclaimer that you are an AI, not a doctor
2. Provide evidence-based information from established medical sources
3. Be empathetic and supportive in your responses
4. When symptoms suggest a potentially serious condition, strongly recommend seeing a healthcare professional
5. Never prescribe medications or suggest specific dosages
6. Provide general wellness, nutrition, fitness, and mental health guidance
7. Use clear, accessible language — avoid overly technical jargon when possible
8. If asked about emergencies, always direct the user to call emergency services
9. Be honest about the limits of your knowledge
10. Support mental health discussions with compassion and appropriate resources

You can discuss:
- General wellness and preventive health
- Nutrition and dietary guidance
- Exercise and fitness recommendations
- Mental health awareness and coping strategies
- Common health conditions (general information only)
- Sleep hygiene and stress management
- Health-related lifestyle questions

Always format your responses with clear sections, use markdown for readability, and include relevant health disclaimers where appropriate.`;

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

    // Use z-ai-web-dev-sdk for health chat
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: HEALTH_SYSTEM_PROMPT },
        ...userMessages,
      ],
      temperature: 0.7,
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
          console.error('Health streaming error:', error);
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
    console.error('Health chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
