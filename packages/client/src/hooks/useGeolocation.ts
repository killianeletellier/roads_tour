import { useEffect, useRef, useState, useCallback } from 'react';
import { watchUserPosition } from '@roads-tour/shared';
import { POSITION_UPDATE_INTERVAL_MS } from '@roads-tour/shared';

export const useGeolocation = () => {
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);

  useEffect(() => {
    return watchUserPosition((coords, h, s) => {
      setLocation(coords);
      setHeading(h);
      setSpeed(s);
    });
  }, []);

  return { location, heading, speed };
};

export const useThrottledPosition = (
  memberId: string | null,
  location: [number, number] | null,
  heading: number | null,
  speed: number | null,
  onSend: (memberId: string, lat: number, lon: number, heading: number | null, speed: number | null) => void,
) => {
  const lastSent = useRef(0);

  useEffect(() => {
    if (!memberId || !location) return;
    const now = Date.now();
    if (now - lastSent.current < POSITION_UPDATE_INTERVAL_MS) return;
    lastSent.current = now;
    onSend(memberId, location[1], location[0], heading, speed);
  }, [memberId, location, heading, speed, onSend]);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const detectAudioMimeType = (bytes: Uint8Array): string => {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45) return 'audio/webm';
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'audio/mp4';
  }
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'audio/ogg';
  }
  return 'audio/webm';
};

const getMediaSourceMimeType = (detected: string): string | null => {
  const candidates =
    detected === 'audio/mp4'
      ? ['audio/mp4; codecs="mp4a.40.2"', 'audio/mp4; codecs="aac"', 'audio/mp4']
      : detected === 'audio/ogg'
        ? ['audio/ogg; codecs="opus"', 'audio/ogg']
        : ['audio/webm; codecs="opus"', 'audio/webm'];
  return candidates.find(type => MediaSource.isTypeSupported(type)) ?? null;
};

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

export const useVoicePlayback = () => {
  const chunksRef = useRef<Uint8Array[]>([]);
  const mimeTypeRef = useRef('audio/webm');
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingRef = useRef<Uint8Array[]>([]);
  const objectUrlRef = useRef<string | null>(null);
  const streamingRef = useRef(false);
  const unlockedRef = useRef(false);
  const playedRef = useRef(false);

  const cleanupMediaSource = useCallback(() => {
    sourceBufferRef.current = null;
    if (mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
      try {
        mediaSourceRef.current.endOfStream();
      } catch (err) {
        console.warn('[voice] endOfStream failed:', err);
      }
    }
    mediaSourceRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }
    pendingRef.current = [];
    streamingRef.current = false;
  }, []);

  const playAudio = useCallback(async (audio: HTMLAudioElement) => {
    try {
      await audio.play();
      playedRef.current = true;
    } catch (err) {
      console.warn('[voice] audio.play() blocked — tap the screen to enable playback:', err);
    }
  }, []);

  const unlockAudio = useCallback(async () => {
    if (unlockedRef.current) {
      if (audioRef.current?.paused) void playAudio(audioRef.current);
      return;
    }
    unlockedRef.current = true;
    try {
      const probe = new Audio(SILENT_WAV);
      probe.volume = 0.001;
      await probe.play();
      probe.pause();
    } catch (err) {
      console.warn('[voice] unlockAudio failed:', err);
    }
    if (audioRef.current?.paused) void playAudio(audioRef.current);
  }, [playAudio]);

  const flushPending = useCallback(() => {
    const sourceBuffer = sourceBufferRef.current;
    if (!sourceBuffer || sourceBuffer.updating || pendingRef.current.length === 0) return;

    const chunk = pendingRef.current.shift()!;
    const buffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
    try {
      sourceBuffer.appendBuffer(buffer);
    } catch (err) {
      console.warn('[voice] appendBuffer failed:', err);
      streamingRef.current = false;
      pendingRef.current.unshift(chunk);
    }
  }, []);

  const initStreaming = useCallback((mimeType: string) => {
    if (streamingRef.current || typeof MediaSource === 'undefined') return;

    const msMime = getMediaSourceMimeType(mimeType);
    if (!msMime) {
      console.warn('[voice] MediaSource unsupported for', mimeType);
      return;
    }

    cleanupMediaSource();
    streamingRef.current = true;

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    const objectUrl = URL.createObjectURL(mediaSource);
    objectUrlRef.current = objectUrl;

    const audio = new Audio();
    audioRef.current = audio;
    audio.src = objectUrl;

    mediaSource.addEventListener('sourceopen', () => {
      try {
        const sourceBuffer = mediaSource.addSourceBuffer(msMime);
        sourceBufferRef.current = sourceBuffer;
        sourceBuffer.mode = 'sequence';
        sourceBuffer.addEventListener('updateend', flushPending);
        flushPending();
        void playAudio(audio);
      } catch (err) {
        console.warn('[voice] MediaSource init failed:', err);
        streamingRef.current = false;
      }
    }, { once: true });
  }, [cleanupMediaSource, flushPending, playAudio]);

  const enqueueChunk = useCallback((base64: string) => {
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(base64);
    } catch (err) {
      console.warn('[voice] invalid base64 chunk:', err);
      return;
    }
    if (bytes.length === 0) return;

    if (chunksRef.current.length === 0) {
      mimeTypeRef.current = detectAudioMimeType(bytes);
      initStreaming(mimeTypeRef.current);
    }

    chunksRef.current.push(bytes);
    if (streamingRef.current) {
      pendingRef.current.push(bytes);
      flushPending();
    }
  }, [flushPending, initStreaming]);

  const playBlobFallback = useCallback(async () => {
    if (chunksRef.current.length === 0 || playedRef.current) return;

    cleanupMediaSource();
    const blob = new Blob(chunksRef.current as BlobPart[], { type: mimeTypeRef.current });
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;

    const audio = new Audio(objectUrl);
    audioRef.current = audio;
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(objectUrl);
      if (objectUrlRef.current === objectUrl) objectUrlRef.current = null;
      audioRef.current = null;
    }, { once: true });

    try {
      await audio.play();
      playedRef.current = true;
    } catch (err) {
      console.warn('[voice] blob fallback play failed:', err);
      URL.revokeObjectURL(objectUrl);
      objectUrlRef.current = null;
      audioRef.current = null;
    }
  }, [cleanupMediaSource]);

  const finalize = useCallback(() => {
    if (streamingRef.current && mediaSourceRef.current?.readyState === 'open' && sourceBufferRef.current) {
      const waitForQueue = () => {
        const sourceBuffer = sourceBufferRef.current;
        if (!sourceBuffer || sourceBuffer.updating || pendingRef.current.length > 0) {
          window.setTimeout(waitForQueue, 50);
          return;
        }
        try {
          mediaSourceRef.current?.endOfStream();
        } catch (err) {
          console.warn('[voice] endOfStream on finalize failed:', err);
          void playBlobFallback();
        }
      };
      waitForQueue();
      return;
    }
    void playBlobFallback();
  }, [playBlobFallback]);

  const reset = useCallback(() => {
    chunksRef.current = [];
    mimeTypeRef.current = 'audio/webm';
    playedRef.current = false;
    cleanupMediaSource();
  }, [cleanupMediaSource]);

  return { enqueueChunk, finalize, reset, unlockAudio };
};

const getSupportedRecorderMimeType = (): string | undefined => {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return types.find(type => MediaRecorder.isTypeSupported(type));
};

const RECORDER_TIMESLICE_MS = 250;

export const usePushToTalk = (
  onStart: () => void,
  onChunk: (data: string) => void,
  onEnd: () => void,
) => {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getSupportedRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      onStart();
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          void e.data.arrayBuffer().then(buf => {
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            onChunk(btoa(binary));
          });
        }
      };
      recorder.start(RECORDER_TIMESLICE_MS);
      setIsRecording(true);
    } catch (err) {
      console.warn('[voice] microphone access denied:', err);
    }
  }, [onStart, onChunk]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    const finalize = () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      recorderRef.current = null;
      streamRef.current = null;
      setIsRecording(false);
      onEnd();
    };

    recorder.onstop = finalize;
    if (recorder.state === 'recording') {
      recorder.requestData();
      recorder.stop();
    } else {
      finalize();
    }
  }, [onEnd]);

  return { isRecording, start, stop };
};
