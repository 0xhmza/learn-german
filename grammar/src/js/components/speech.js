// Audio for the listening trainer. Short drills use the browser's German
// speech voices (Web Speech API); recordings play through an <audio>
// element. Both report how long the audio ran, so the trainer can measure
// the real speaking rate in syllables per second.
const synth = () => globalThis.speechSynthesis || null;
let audio = null;
// `token` changes whenever audio is replaced; `sequence` when the learner
// stops a multi-line playback.
let token = 0;
let sequence = 0;

export const speechAvailable = () => Boolean(synth() && globalThis.SpeechSynthesisUtterance);

export function germanVoices() {
  const engine = synth();
  if (!engine) return [];
  return engine.getVoices().filter(voice => /^de([-_]|$)/i.test(voice.lang))
    .sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name));
}

// Calls back once when the voice list changes (it loads late in Chrome).
export function onVoicesChanged(callback) {
  const engine = synth();
  if (!engine?.addEventListener) return () => {};
  engine.addEventListener('voiceschanged', callback);
  return () => engine.removeEventListener('voiceschanged', callback);
}

function cancel() {
  token += 1;
  synth()?.cancel();
  if (audio) {
    audio.pause();
    audio = null;
  }
}

export function stopAudio() {
  sequence += 1;
  cancel();
}

// Chooses the voice for a speaker: a fixed voice, or a different voice per
// item when variety is on (many voices train the ear better than one).
export function chooseVoice({ voice = '', vary = true, speaker = 0, seed = Math.random() } = {}) {
  const voices = germanVoices();
  if (!voices.length) return null;
  const fixed = voices.find(item => item.voiceURI === voice);
  if (fixed && !vary) return fixed;
  if (!vary) return voices[0];
  return voices[(Math.floor(seed * voices.length) + speaker) % voices.length];
}

// Speaks German text. Resolves with the duration in milliseconds, or null
// when it was interrupted or no speech engine is available.
export function speak(text, { rate = 1, voice = null, pitch = 1, onWord } = {}) {
  cancel();
  const engine = synth();
  if (!engine || !globalThis.SpeechSynthesisUtterance) return Promise.resolve(null);
  const mine = token;
  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice?.lang || 'de-DE';
    // A voice from an older list can be rejected; the language still applies.
    try { if (voice) utterance.voice = voice; } catch { /* keep the default voice */ }
    utterance.rate = rate;
    utterance.pitch = pitch;
    let started = 0;
    utterance.onstart = () => { started = performance.now(); };
    if (onWord) utterance.onboundary = event => { if (event.name !== 'sentence') onWord(event.charIndex); };
    const finish = ok => {
      if (mine !== token) return resolve(null);
      resolve(ok && started ? performance.now() - started : null);
    };
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    // Chrome sometimes keeps a paused queue; resume before speaking.
    engine.resume?.();
    engine.speak(utterance);
  });
}

// Speaks lines one after another, each with its own voice and pitch.
export async function speakLines(lines, { rate = 1, voices = [], pitches = [], onLine } = {}) {
  let total = 0;
  const mine = ++sequence;
  for (let i = 0; i < lines.length; i++) {
    const [speaker, text] = lines[i];
    onLine?.(i);
    const ms = await speak(text, { rate, voice: voices[speaker] ?? null, pitch: pitches[speaker] ?? 1 });
    if (ms === null || sequence !== mine) {
      onLine?.(-1);
      return null;
    }
    total += ms;
    await new Promise(resolve => setTimeout(resolve, 260 / rate));
  }
  onLine?.(-1);
  return total;
}

// Plays a recording at the given speed with the pitch kept.
export function playRecording(src, rate = 1) {
  cancel();
  const mine = token;
  return new Promise(resolve => {
    audio = new Audio(src);
    audio.playbackRate = rate;
    audio.preservesPitch = true;
    let started = 0;
    audio.onplay = () => { started = performance.now(); };
    audio.onended = () => resolve(mine === token && started ? performance.now() - started : null);
    audio.onerror = () => resolve(null);
    audio.play().catch(() => resolve(null));
  });
}
