// An audio element can seek within an episode without loading the whole video.
export function mountListeningAudio(root) {
  const audio = root.querySelector('[data-listening-audio]');
  if (!audio) return null;
  const indicator = root.querySelector('[data-listening-audio-status]');
  let boundary = null;
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

  return {
    setStatus(value) { if (indicator) indicator.textContent = value; },
    async play(start, end, speed) {
      if (disposed) return false;
      audio.pause();
      boundary = end;
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
      audio.pause();
      clearInterval(frame);
      audio.removeAttribute('src');
      audio.load();
    }
  };
}
