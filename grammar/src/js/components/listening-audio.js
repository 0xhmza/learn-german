// An audio element can seek within an episode without loading the whole video.
export function mountListeningAudio(root) {
  const audio = root.querySelector('[data-listening-audio]');
  if (!audio) return null;
  const indicator = root.querySelector('[data-listening-audio-status]');
  const bar = root.querySelector('[data-listening-progress]');
  const timeLabel = root.querySelector('[data-listening-time]');
  let boundary = null;
  let from = 0;
  const time = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  const updateProgress = () => {
    const end = boundary ?? audio.duration;
    if (!Number.isFinite(end) || end <= from) return;
    const span = end - from;
    const elapsed = Math.max(0, Math.min(span, audio.currentTime - from));
    if (bar) { bar.max = span; bar.value = elapsed; }
    if (timeLabel) timeLabel.textContent = `${time(elapsed)} / ${time(span)}`;
  };
  let frame = 0;
  let disposed = false;

  const onPause = () => {
    if (!audio.paused && !audio.ended) return;
    clearInterval(frame);
    frame = 0;
    root.querySelector('[data-action="listen-stop"]')?.setAttribute('disabled', '');
    root.querySelector('.listening-player')?.classList.remove('is-playing');
  };
  const limit = () => {
    updateProgress();
    if (boundary !== null && !audio.seeking && audio.currentTime >= boundary) audio.pause();
  };
  const onPlay = () => {
    if (!frame) frame = setInterval(limit, 45);
    root.querySelector('[data-action="listen-stop"]')?.removeAttribute('disabled');
    root.querySelector('.listening-player')?.classList.add('is-playing');
  };
  audio.addEventListener('playing', onPlay);
  audio.addEventListener('pause', onPause);
  audio.addEventListener('ended', onPause);
  audio.addEventListener('timeupdate', limit);
  audio.addEventListener('loadedmetadata', updateProgress);

  return {
    setStatus(value) { if (indicator) indicator.textContent = value; },
    async play(start, end, speed) {
      if (disposed) return false;
      audio.pause();
      boundary = end;
      from = start;
      audio.playbackRate = speed;
      audio.currentTime = start;
      await audio.play();
      if (disposed) {
        audio.pause();
        return false;
      }
      return true;
    },
    pause() { audio.pause(); },
    speed(value) { audio.playbackRate = value; },
    dispose() {
      disposed = true;
      audio.removeEventListener('playing', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onPause);
      audio.removeEventListener('timeupdate', limit);
      audio.removeEventListener('loadedmetadata', updateProgress);
      audio.pause();
      clearInterval(frame);
      audio.removeAttribute('src');
      audio.load();
    }
  };
}
