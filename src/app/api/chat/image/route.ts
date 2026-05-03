import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

// ─── iluma (Flux) Image Generation Route ──────────────────────────────────────
// Uses z-ai-web-dev-sdk for image generation, branded as "iluma"

export async function POST(req: NextRequest) {
  const isAuthenticated = req.headers.get('x-authenticated') === 'true';

  try {
    const { prompt, size } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize and limit prompt length
    const sanitizedPrompt = prompt.trim().slice(0, 2000);

    // Validate size parameter
    const validSizes = ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'];
    const imageSize = validSizes.includes(size) ? size : '1024x1024';

    // Use z-ai-web-dev-sdk for image generation (Flux-based)
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const response = await zai.images.generations.create({
      prompt: sanitizedPrompt,
      size: imageSize,
    });

    if (!response.data || response.data.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Image generation failed. Please try again.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const imageData = response.data[0];
    const imageUrl = imageData.base64
      ? `data:image/png;base64,${imageData.base64}`
      : (imageData as Record<string, unknown>).url as string || '';

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image generation produced no output.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        image: {
          id: `img-${Date.now()}`,
          prompt: sanitizedPrompt,
          url: imageUrl,
          size: imageSize,
          createdAt: new Date().toISOString(),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('iluma image generation error:', error);
    return new Response(
      JSON.stringify({ error: 'Image generation failed. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
