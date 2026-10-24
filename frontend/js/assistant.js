// AI Assistant chat page. Talks only to the CampusSphere backend (aiApi.chat); voice uses the browser's
// built-in Web Speech APIs. Failed requests are shown as errors with a retry; no reply is ever invented.
import { initShell } from './shell.js';
import { authApi, aiApi, AI_LIMITS } from './api.js';
import { esc } from './ui.js';
import { LANGUAGES, splitBlocks, speechText, boundHistory, errorMessageFor, tooLong, renderMarkdown } from './assistant-core.js';

await initShell({ active: '/assistant', crumbs: [['Discover'], ['AI Assistant']] });

const $ = (s) => document.querySelector(s);
const log = $('[data-log]');
const composer = $('#composer');
const form = $('[data-form]');
const sendBtn = $('[data-send]');
const statusEl = $('[data-status]');
const micBtn = $('[data-mic]');
const jump = $('[data-jump]');
const langSel = $('[data-lang]');
const autoSpeak = $('[data-autospeak]');

const state = { messages: [], busy: false, signedIn: false, speakingId: null, listening: false, nextId: 1, typing: false };

// ---- small persisted preferences (best effort; the page works without storage) ----
const store = {
  get(k) { try { return localStorage.getItem(`cs.assistant.${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`cs.assistant.${k}`, v); } catch { /* ignore */ } }
};
if (LANGUAGES[store.get('lang')]) langSel.value = store.get('lang');
autoSpeak.checked = store.get('autospeak') === '1';
const lang = () => LANGUAGES[langSel.value] || LANGUAGES.en;
const setStatus = (text) => { statusEl.textContent = text || ''; };

// ---- rendering ----
function paragraphs(text) {
  return text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

function bubble(m) {
  if (m.role === 'user') {
    return `<div class="msg msg--user${m.error ? ' msg--failed' : ''}"><span class="msg__who">You</span><div class="msg__body">${paragraphs(m.content)}</div>
      ${m.error ? `<div class="msg__error" role="alert">${esc(m.errorText)} <button class="button button--secondary button--sm" type="button" data-retry="${m.id}">Retry</button></div>` : ''}</div>`;
  }
  const body = splitBlocks(m.content).map((b) => (b.type === 'code' ? `<pre><code>${esc(b.content)}</code></pre>` : renderMarkdown(b.content))).join('');
  const speaking = state.speakingId === m.id;
  const canSpeak = 'speechSynthesis' in window;
  return `<div class="msg msg--assistant"><span class="msg__who">AI Assistant</span><div class="msg__body">${body}</div>
    ${canSpeak ? `<button class="button button--ghost button--sm" type="button" data-speak="${m.id}" aria-pressed="${speaking}">${speaking ? 'Stop reading' : 'Read aloud'}</button>` : ''}</div>`;
}

function render({ stickToBottom } = {}) {
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const hasMessages = state.messages.length > 0;
  $('[data-empty]')?.remove();
  log.innerHTML = (hasMessages ? '' : emptyHtml())
    + state.messages.map(bubble).join('')
    + (state.typing ? '<div class="msg msg--assistant msg--typing" aria-label="The AI Assistant is writing a reply"><span class="msg__who">AI Assistant</span><div class="typing" aria-hidden="true"><span></span><span></span><span></span></div></div>' : '');
  if (stickToBottom || nearBottom) { log.scrollTop = log.scrollHeight; jump.hidden = true; }
  else jump.hidden = false;
}

function emptyHtml() {
  return `<div class="chat__empty" data-empty><p class="empty-state__title">How can I help today?</p><p class="empty-state__text">Try one of these, or type your own question.</p><div class="chat__examples">
    ${[['Coursework: == vs ===', 'Explain the difference between == and === in JavaScript with a short example.'], ['Study plan for web basics', 'Give me a 4-week study plan to learn HTML, CSS and JavaScript events.'],
       ['Library: what to ask', 'What questions should I ask the library about borrowing rules?'], ['Programming: SQL JOIN', 'Explain what a SQL JOIN is, with a small example.']]
      .map(([label, text]) => `<button class="chip chip--btn" type="button" data-example="${esc(text)}">${esc(label)}</button>`).join('')}</div></div>`;
}

function updateControls() {
  const locked = !state.signedIn;
  composer.disabled = locked;
  sendBtn.disabled = locked || state.busy;
  sendBtn.classList.toggle('is-loading', state.busy);
  sendBtn.setAttribute('aria-busy', String(state.busy));
  micBtn.disabled = locked || !SR;
}

// ---- sending ----
async function run(msg) {
  state.busy = true;
  state.typing = true;
  msg.error = false;
  updateControls();
  render({ stickToBottom: true });
  setStatus('The AI Assistant is writing a reply…');
  const index = state.messages.indexOf(msg);
  try {
    const { reply } = await aiApi.chat({ message: msg.content, history: boundHistory(state.messages.slice(0, index)) });
    state.messages.push({ id: state.nextId++, role: 'assistant', content: reply });
    setStatus('Reply received.');
    state.typing = false;
    render({ stickToBottom: true });
    if (autoSpeak.checked) speak(state.messages.at(-1).id);
  } catch (e) {
    state.typing = false;
    if (e.status === 401 || e.code === 'UNAUTHENTICATED') { state.signedIn = false; $('[data-signin]').hidden = false; }
    msg.error = true;
    msg.errorText = errorMessageFor(e);
    setStatus(msg.errorText);
    render({ stickToBottom: true });
  } finally {
    state.busy = false;
    updateControls();
  }
}

function send(text) {
  const content = text.trim();
  if (!content || state.busy || !state.signedIn) return;
  if (tooLong(content)) { setStatus(`Messages can be up to ${AI_LIMITS.maxMessage} characters. Please shorten yours.`); return; }
  const msg = { id: state.nextId++, role: 'user', content };
  state.messages.push(msg);
  composer.value = '';
  updateCount();
  run(msg);
}

function updateCount() {
  const n = composer.value.length;
  $('[data-count]').textContent = String(n);
  $('#composer-hint').classList.toggle('is-over', n > AI_LIMITS.maxMessage);
}

form.addEventListener('submit', (e) => { e.preventDefault(); send(composer.value); });
composer.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(composer.value); }
});
composer.addEventListener('input', updateCount);

log.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.example) { composer.value = t.dataset.example; updateCount(); composer.focus(); }
  else if (t.dataset.retry) { const m = state.messages.find((x) => x.id === Number(t.dataset.retry)); if (m && !state.busy) run(m); }
  else if (t.dataset.speak) toggleSpeak(Number(t.dataset.speak));
});
log.addEventListener('scroll', () => { if (log.scrollHeight - log.scrollTop - log.clientHeight < 80) jump.hidden = true; });
jump.addEventListener('click', () => { log.scrollTop = log.scrollHeight; jump.hidden = true; });

$('[data-new]').addEventListener('click', () => {
  stopSpeaking();
  stopListening();
  state.messages = [];
  state.typing = false;
  composer.value = '';
  updateCount();
  setStatus('Started a new conversation.');
  render({ stickToBottom: true });
  composer.focus();
});
$('[data-clear]').addEventListener('click', () => {
  stopSpeaking();
  state.messages = [];
  setStatus('Messages cleared.');
  render({ stickToBottom: true });
});

// ---- voice output ----
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
function stopSpeaking() {
  if (synth) synth.cancel();
  if (state.speakingId !== null) { state.speakingId = null; render(); }
}
function speak(id) {
  const m = state.messages.find((x) => x.id === id);
  if (!synth || !m) return;
  synth.cancel(); // never overlap two readings
  const text = speechText(m.content);
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang().speech;
  const voice = synth.getVoices().find((v) => v.lang === u.lang) || synth.getVoices().find((v) => v.lang.startsWith(u.lang.slice(0, 2)));
  if (voice) u.voice = voice; // otherwise the browser default is used
  u.onend = u.onerror = () => { if (state.speakingId === id) { state.speakingId = null; render(); } };
  state.speakingId = id;
  render();
  synth.speak(u);
}
function toggleSpeak(id) { if (state.speakingId === id) stopSpeaking(); else speak(id); }

autoSpeak.addEventListener('change', () => { store.set('autospeak', autoSpeak.checked ? '1' : '0'); if (!autoSpeak.checked) stopSpeaking(); });
langSel.addEventListener('change', () => { store.set('lang', langSel.value); if (state.listening) stopListening(); });
if (!synth) { autoSpeak.disabled = true; autoSpeak.closest('.check').title = 'Reading aloud is not supported in this browser.'; }

// ---- voice input (dictation) ----
const getSR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const SR = getSR();
let recognition = null;
let heardText = false;

function setListening(on) {
  state.listening = on;
  micBtn.setAttribute('aria-pressed', String(on));
  micBtn.setAttribute('aria-label', on ? 'Stop dictation' : 'Start dictation');
  $('[data-mic-text]').textContent = on ? 'Listening… tap to stop' : 'Dictate';
  micBtn.classList.toggle('is-listening', on);
}

function stopListening() { if (recognition) { try { recognition.stop(); } catch { /* already stopped */ } } }

function startListening() {
  const Recognizer = getSR();
  if (!Recognizer) return;
  if (synth) synth.cancel();
  recognition = new Recognizer();
  recognition.lang = lang().recognition;
  recognition.interimResults = true;
  recognition.continuous = false;
  const base = composer.value.trim();
  heardText = false;
  recognition.onstart = () => { setListening(true); setStatus(`Listening (${lang().label}). Speak now, then review the text before sending.`); };
  recognition.onresult = (e) => {
    const transcript = [...e.results].map((r) => r[0].transcript).join(' ').trim();
    if (transcript) { heardText = true; composer.value = `${base ? `${base} ` : ''}${transcript}`.slice(0, AI_LIMITS.maxMessage + 200); updateCount(); }
  };
  recognition.onerror = (e) => {
    const messages = {
      'not-allowed': 'Microphone access was blocked. Allow it in your browser settings to dictate, or type your message.',
      'service-not-allowed': 'Speech recognition is not allowed in this browser. You can type instead.',
      'no-speech': 'I did not hear anything. Try again, or type your message.',
      'audio-capture': 'No microphone was found.',
      'language-not-supported': `${lang().label} dictation is not supported in this browser. Try English or type your message.`,
      network: 'Dictation needs a connection to the browser speech service. Check your connection or type instead.',
      aborted: ''
    };
    setStatus(e.error in messages ? messages[e.error] : 'Dictation stopped because of an error. You can type instead.');
    heardText = true; // an error message has been shown; skip the "nothing heard" notice
  };
  recognition.onend = () => {
    setListening(false);
    if (!heardText) setStatus('Nothing was recognised. Try again or type your message.');
    else if (composer.value.trim() && /^(Listening|Nothing)/.test(statusEl.textContent)) setStatus('Dictation finished. Review or edit the text, then press Send.');
    recognition = null;
    composer.focus();
  };
  try { recognition.start(); } catch { setStatus('Dictation could not start. Please try again.'); setListening(false); }
}

micBtn.addEventListener('click', () => (state.listening ? stopListening() : startListening()));
if (!SR) {
  micBtn.disabled = true;
  micBtn.title = 'Dictation is not supported in this browser.';
  $('[data-mic-text]').textContent = 'Dictation unavailable';
  setStatus('Dictation is not supported in this browser. You can still type your messages.');
}

window.addEventListener('pagehide', () => { stopListening(); if (synth) synth.cancel(); });

// ---- start ----
authApi.me().then(() => { state.signedIn = true; }).catch(() => { $('[data-signin]').hidden = false; }).finally(() => { updateControls(); render(); });
updateCount();
// Questions typed on the landing page arrive as ?q=... and are placed in the box for review (never auto-sent).
const preset = new URLSearchParams(location.search).get('q');
if (preset) { composer.value = preset.slice(0, AI_LIMITS.maxMessage); updateCount(); }
