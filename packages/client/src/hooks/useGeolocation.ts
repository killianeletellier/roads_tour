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

export const useVoicePlayback = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const mimeTypeRef = useRef('audio/webm');
  const playedDurationRef = useRef(0);
  const nextPlayTimeRef = useRef(0);
  const decodingRef = useRef(false);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const tryDecodeAndPlay = useCallback(async () => {
    if (decodingRef.current || chunksRef.current.length === 0) return;
    decodingRef.current = true;
    const chunkCountAtStart = chunksRef.current.length;
    try {
      const ctx = getAudioContext();
      const blob = new Blob(chunksRef.current as BlobPart[], { type: mimeTypeRef.current });
      const audioBuffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      const totalDuration = audioBuffer.duration;
      const offset = playedDurationRef.current;
      if (totalDuration <= offset + 0.02) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      const startAt = Math.max(ctx.currentTime + 0.02, nextPlayTimeRef.current);
      const segmentDuration = totalDuration - offset;
      source.start(startAt, offset, segmentDuration);
      nextPlayTimeRef.current = startAt + segmentDuration;
      playedDurationRef.current = totalDuration;
    } catch {
      /* Incomplete container — wait for more chunks */
    } finally {
      decodingRef.current = false;
      if (chunksRef.current.length > chunkCountAtStart) {
        void tryDecodeAndPlay();
      }
    }
  }, [getAudioContext]);

  const enqueueChunk = useCallback((base64: string) => {
    const bytes = base64ToBytes(base64);
    if (chunksRef.current.length === 0) {
      mimeTypeRef.current = detectAudioMimeType(bytes);
    }
    chunksRef.current.push(bytes);
    void tryDecodeAndPlay();
  }, [tryDecodeAndPlay]);

  const reset = useCallback(() => {
    chunksRef.current = [];
    mimeTypeRef.current = 'audio/webm';
    playedDurationRef.current = 0;
    nextPlayTimeRef.current = 0;
    decodingRef.current = false;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  return { enqueueChunk, reset };
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
    } catch {
      /* mic denied */
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
