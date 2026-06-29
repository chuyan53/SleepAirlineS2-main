import OpenAI from 'openai';

const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-1-mini';

export interface SceneryGenerationResult {
  imageBuffer: Buffer;
  imagePrompt: string;
  contentType: string;
  filename: string;
}

export function buildSceneryPrompt(city: string, country: string, displayName: string): string {
  const place = displayName || `${city}, ${country}`;
  return [
    `View through an airplane cabin window on a quiet night flight,`,
    `gazing at the landscape near ${place}.`,
    `Dreamy and poetic mood: deep midnight navy sky, soft starlight,`,
    `gentle moonlit mist over terrain typical of ${country} —`,
    `rolling hills, coastline, or valley silhouettes, not a tourist postcard or famous monument.`,
    `Cinematic, half-awake memory feel; subtle amber reflection on the window glass,`,
    `cool blue-teal atmosphere like a long night journey before dawn.`,
    `Soft atmospheric perspective, no people, no text, no watermark, no logos.`,
  ].join(' ');
}

/** Landscape aspect ratio suits the night-window composition. */
export const SCENERY_IMAGE_SIZE = '1536x1024';

function safeFilename(city: string, flightId: string): string {
  const slug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'landing';
  return `landing-${slug}-${flightId.slice(-8)}.png`;
}

function isGptImageModel(model: string): boolean {
  return model.startsWith('gpt-image') || model.startsWith('chatgpt-image');
}

export async function generateLandingScenery(
  city: string,
  country: string,
  displayName: string,
  flightId: string
): Promise<SceneryGenerationResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const imagePrompt = buildSceneryPrompt(city, country, displayName);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL;

  const response = await client.images.generate(
    isGptImageModel(model)
      ? {
          model,
          prompt: imagePrompt,
          size: SCENERY_IMAGE_SIZE,
          quality: 'medium',
          output_format: 'png',
          n: 1,
        }
      : {
          model,
          prompt: imagePrompt,
          size: SCENERY_IMAGE_SIZE,
          quality: 'standard',
          n: 1,
      }
  );

  const imageData = response.data?.[0];
  if (!imageData) return null;

  const b64 = imageData.b64_json;
  if (b64) {
    return {
      imageBuffer: Buffer.from(b64, 'base64'),
      imagePrompt,
      contentType: 'image/png',
      filename: safeFilename(city, flightId),
    };
  }

  const imageUrl = imageData.url;
  if (!imageUrl) return null;

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) return null;
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

  return {
    imageBuffer,
    imagePrompt,
    contentType: imageRes.headers.get('content-type') ?? 'image/png',
    filename: safeFilename(city, flightId),
  };
}
