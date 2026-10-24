const { ok, HttpError } = require('../utils/response');
const validator = require('../validators/ai');
const ai = require('../services/aiService');
const { buildContext } = require('../services/aiContext');

// POST /api/ai/chat  { message, history? }  ->  { reply }
exports.chat = async (req, res, next) => {
  try {
    const parsed = validator.chat(req.body);
    if (parsed.error) throw new HttpError(400, 'VALIDATION_ERROR', parsed.error);
    let reply;
    // Grounding data is best effort: if it cannot be built the assistant still answers, without it.
    const context = await buildContext(req.user).catch(() => '');
    try { reply = await ai.complete(parsed.value.messages, { context }); }
    catch (e) {
      if (e instanceof ai.AiError) throw new HttpError(e.status, e.code, e.message);
      throw new HttpError(502, 'AI_FAILED', 'The AI Assistant could not complete that request. Please try again.');
    }
    ok(res, { reply });
  } catch (e) { next(e); }
};
