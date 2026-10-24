const { ok, HttpError } = require('../utils/response');
const validator = require('../validators/ai');
const ai = require('../services/aiService');

// POST /api/ai/chat  { message, history? }  ->  { reply }
exports.chat = async (req, res, next) => {
  try {
    const parsed = validator.chat(req.body);
    if (parsed.error) throw new HttpError(400, 'VALIDATION_ERROR', parsed.error);
    let reply;
    try { reply = await ai.complete(parsed.value.messages); }
    catch (e) {
      if (e instanceof ai.AiError) throw new HttpError(e.status, e.code, e.message);
      throw new HttpError(502, 'AI_FAILED', 'The AI Assistant could not complete that request. Please try again.');
    }
    ok(res, { reply });
  } catch (e) { next(e); }
};
