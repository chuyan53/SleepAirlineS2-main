import type { Flight, SocialCue } from '../../types';
import { generateSocialCueText } from '../ai/social-cue';
import {
  collectSocialCueCandidates,
  pickRandomSocialCueCandidate,
  soloSocialCueCandidate,
  type CurrentFlightContext,
} from './social-candidates';

export type { CurrentFlightContext };

/** 隨機抽取一則同組社交 cue，並以 AI 改寫文案。 */
export async function resolveGroupSocialCue(
  current: CurrentFlightContext,
  groupFlights: Flight[]
): Promise<SocialCue> {
  const candidates = collectSocialCueCandidates(current, groupFlights);
  const picked = pickRandomSocialCueCandidate(candidates) ?? soloSocialCueCandidate();
  const cueText = await generateSocialCueText(picked);

  return {
    cueType: picked.cueType,
    relatedPassenger: picked.relatedPassenger,
    cueText,
  };
}
