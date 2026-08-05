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

export const useVoicePlayback = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);
  const playingRef = useRef(false);

  const playNext = useCallback(async () => {
    if (playingRef.current || !queueRef.current.length) return;
    playingRef.current = true;
    const chunk = queueRef.current.shift()!;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const blob = new Blob([chunk], { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.play().catch(() => resolve());
      });
    } finally {
      playingRef.current = false;
      playNext();
    }
  }, []);

  const enqueueChunk = useCallback((base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    queueRef.current.push(bytes.buffer);
    playNext();
  }, [playNext]);

  const reset = useCallback(() => {
    queueRef.current = [];
  }, []);

  return { enqueueChunk, reset };
};

export const usePushToTalk = (
  onStart: () => void,
  onChunk: (data: string) => void,
  onEnd: () => void,
) => {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorderRef.current = recorder;
      onStart();
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          e.data.arrayBuffer().then(buf => {
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            onChunk(btoa(binary));
          });
        }
      };
      recorder.start(200);
      setIsRecording(true);
    } catch {
      /* mic denied */
    }
  }, [onStart, onChunk]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    recorderRef.current = null;
    streamRef.current = null;
    setIsRecording(false);
    onEnd();
  }, [onEnd]);

  return { isRecording, start, stop };
};
