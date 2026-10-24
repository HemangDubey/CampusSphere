const MAX_MESSAGE = 2000;
const MAX_HISTORY = 12;
const MAX_HISTORY_CHARS = 12000;

// Returns { value: { messages } } where messages is the bounded history plus the new user turn, or { error }.
function chat(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send a JSON object with a message.' };
  const { message, history } = body;
  if (typeof message !== 'string' || !message.trim()) return { error: 'Type a message to send.' };
  if (message.length > MAX_MESSAGE) return { error: `Messages can be up to ${MAX_MESSAGE} characters.` };

  let past = [];
  if (history !== undefined) {
    if (!Array.isArray(history)) return { error: 'History must be a list of messages.' };
    if (history.length > MAX_HISTORY) return { error: `History can hold up to ${MAX_HISTORY} messages.` };
    let chars = 0;
    for (const m of history) {
      if (!m || typeof m !== 'object' || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > MAX_MESSAGE * 2) {
        return { error: 'History contains an invalid message.' };
      }
      chars += m.content.length;
      // Only role and content are forwarded; any other fields a client sends are dropped.
      past.push({ role: m.role, content: m.content });
    }
    if (chars > MAX_HISTORY_CHARS) return { error: 'The conversation is too long. Start a new conversation.' };
  }
  return { value: { messages: [...past, { role: 'user', content: message.trim() }] } };
}

module.exports = { chat, MAX_MESSAGE, MAX_HISTORY };
