// Wybor kodeka dla MediaRecorder. Wydzielone z DelayMirrorView, bo eksport
// klipu z wypalona tarcza musi nagrywac DOKLADNIE tym samym kodekiem —
// inaczej plik do udostepnienia zmienialby format zaleznie od tego, ktora
// droga powstal.

/** Pelny codec do „Udostepnij" (kompletny plik) — preferuj mp4 dla WhatsApp/iOS. */
export function getFullCodec(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}
