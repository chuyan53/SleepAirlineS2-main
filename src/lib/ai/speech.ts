import OpenAI from 'openai';
import type { BroadcastStyle } from '../../types';

type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

const VOICE_BY_STYLE: Record<BroadcastStyle, OpenAIVoice> = {
  formal_captain: 'onyx',
  poetic: 'fable',
  playful: 'nova',
  flight_attendant: 'shimmer',
  radio_host: 'echo',
  custom: 'alloy',
};

export async function generateBroadcastSpeech(
  text: string,
  style?: BroadcastStyle
): Promise<Buffer> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 尚未設定。');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_TTS_MODEL ?? 'tts-1';
  const envVoice = process.env.OPENAI_TTS_VOICE as OpenAIVoice | undefined;
  const voice = (style && VOICE_BY_STYLE[style]) || envVoice || 'onyx';

  const response = await client.audio.speech.create({
    model,
    voice,
    input: text.slice(0, 4096),
    response_format: 'mp3',
  });

  return Buffer.from(await response.arrayBuffer());
}
