import OpenAI from 'openai';
import type { SocialCueCandidate } from '../flight/social-candidates';

const DIRECTION_LABEL: Record<string, string> = {
  auto: '自動航線',
  eastbound: '向東',
  westbound: '向西',
  northbound: '向北',
  southbound: '向南',
  northeast: '東北',
  northwest: '西北',
  southeast: '東南',
  southwest: '西南',
  circular: '環形',
  unknown: '未定',
};

function factsToLines(facts: Record<string, string | number | null>): string {
  return Object.entries(facts)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

export function fallbackSocialCueText(candidate: SocialCueCandidate): string {
  const name = String(candidate.facts.teammateName ?? candidate.relatedPassenger ?? '');
  switch (candidate.cueType) {
    case 'teammate_arrival':
      return `${name} 已從 ${candidate.facts.departureLocation} 飛抵 ${candidate.facts.arrivalLocation}，飛行 ${candidate.facts.flightDuration}。`;
    case 'teammate_departure': {
      const dir = DIRECTION_LABEL[String(candidate.facts.routeDirection)] ?? String(candidate.facts.routeDirection);
      return `${name} 從 ${candidate.facts.departureLocation} 起飛，航向${dir}，已飛 ${candidate.facts.elapsedLabel}。`;
    }
    case 'route_convergence':
      return `若想靠近 ${name}（目前在 ${candidate.facts.teammatePlace}），可試著${candidate.facts.suggestDirection}飛行，約 ${candidate.facts.distanceKm} 公里。`;
    case 'teammate_in_sky':
      return `${name} 已夜航 ${candidate.facts.elapsedLabel}，估計在 ${candidate.facts.skyRegion} 上空（進度 ${candidate.facts.flightProgress}%）。`;
    case 'parallel_heading': {
      const dir = DIRECTION_LABEL[String(candidate.facts.routeDirection)] ?? String(candidate.facts.routeDirection);
      return `你和 ${name} 都選了${dir}——從 ${candidate.facts.selfDeparture} 與 ${candidate.facts.teammateDeparture} 出發的平行夜航。`;
    }
    case 'relay_flight':
      return `你已降落，${name} 仍在夜航中（${candidate.facts.teammateDeparture} 出發，進度 ${candidate.facts.teammateProgress}%）。`;
    case 'early_landing':
      return `${name} 比你更早降落在 ${candidate.facts.arrivalLocation}。`;
    case 'late_landing':
      return `${name} 在你之後也降落在 ${candidate.facts.arrivalLocation}。`;
    case 'solo':
    default:
      return '今晚你獨自飛行。同組雷達上暫時只有你一人。';
  }
}

export async function generateSocialCueText(
  candidate: SocialCueCandidate
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackSocialCueText(candidate);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `你是「甦醒航班 Sleep Airline」的社交提示撰寫者。
- 繁體中文，1–2 句，40–70 字
- 夜航、溫柔、有畫面感，像機長低聲對乘客說的同組動態
- 只能使用提供的事實，不得編造地名、時間、人名
- 每次用不同句式與意象，避免套話
- 直接輸出提示正文，不加引號或標題`,
      },
      {
        role: 'user',
        content: `類型：${candidate.cueType}
${factsToLines(candidate.facts)}

請改寫成一句社交提示。`,
      },
    ],
    max_tokens: 120,
    temperature: 0.9,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  return text && text.length > 0 ? text : fallbackSocialCueText(candidate);
}
