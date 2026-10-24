// Pure helpers for the AI Assistant page (no DOM), so they can be unit-tested in Node.
import { AI_LIMITS } from './api.js';

export const LANGUAGES = {
  en: { label: 'English', recognition: 'en-IN', speech: 'en-IN' },
  hi: { label: 'Hindi', recognition: 'hi-IN', speech: 'hi-IN' },
  // Hinglish has no recognition language of its own. English (India) recognises mixed speech best in
  // many browsers; users can edit the text before sending.
  hinglish: { label: 'Hinglish (mixed)', recognition: 'en-IN', speech: 'en-IN' }
};

// Splits reply text into text and fenced-code blocks: [{ type: 'text'|'code', content, lang? }]
export function splitBlocks(text) {
  const out = [];
  const re = /```([\w+-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', content: text.slice(last, m.index) });
    out.push({ type: 'code', lang: m[1], content: m[2].replace(/\n$/, '') });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ type: 'text', content: text.slice(last) });
  return out.filter((b) => b.content.trim() !== '');
}

// What gets read aloud: code blocks are replaced with a short note, markdown marks are removed.
export function speechText(text) {
  return splitBlocks(text)
    .map((b) => (b.type === 'code' ? 'Code example omitted.' : b.content))
    .join(' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Only successfully answered turns are sent as context, newest last, capped to the server's limit.
export function boundHistory(messages) {
  return messages
    .filter((m) => !m.error && !m.pending && (m.role === 'user' || m.role === 'assistant'))
    .slice(-AI_LIMITS.maxHistory)
    .map(({ role, content }) => ({ role, content }));
}

// Friendly text for a failed request. Never echoes provider details; only the generic API message or ours.
export function errorMessageFor(err) {
  switch (err?.code) {
    case 'UNAUTHENTICATED': return 'Please sign in to use the AI Assistant.';
    case 'RATE_LIMITED': return 'You are sending messages too quickly. Please wait a moment.';
    case 'AI_BUSY': return 'The AI Assistant is busy right now. Please wait a moment and try again.';
    case 'AI_TIMEOUT':
    case 'TIMEOUT': return 'The AI Assistant took too long to respond. Please try again.';
    case 'NETWORK_ERROR': return 'Could not reach the server. Check your connection and try again.';
    case 'AI_UNAVAILABLE': return 'The AI Assistant is not available right now.';
    case 'VALIDATION_ERROR': return err.message || 'That message could not be sent.';
    default: return 'The AI Assistant could not complete that request. Please try again.';
  }
}

// Which messages are too long to send (the composer shows a counter and blocks sending).
export const tooLong = (text) => text.length > AI_LIMITS.maxMessage;
