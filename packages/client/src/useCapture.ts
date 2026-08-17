import { useCallback, useEffect, useRef, useState } from "react";

// Section 6 start/stop recording hooks. The recorded Blob is exposed
// (alongside a local previewUrl for a quick "yes it recorded" confirmation)
// so the caller can upload it for analysis -- see section 9 step 3
// (Interhuman proxy), wired in CapturePanel.tsx.

export type CaptureStatus = "idle" | "requesting" | "recording" | "stopped" | "skipped" | "denied";

export interface UseCaptureResult {
  status: CaptureStatus;
  elapsedSec: number;
  error: string | null;
  stream: MediaStream | null;
  previewUrl: string | null;
  blob: Blob | null;
  start: () => Promise<void>;
  stop: () => void;
  skip: () => void;
  reset: () => void;
}

export function useCapture(maxDurationSec: number): UseCaptureResult {
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const skippedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("requesting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = s;
      setStream(s);
      chunksRef.current = [];
      skippedRef.current = false;

      const recorder = new MediaRecorder(s);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (!skippedRef.current && chunksRef.current.length > 0) {
          const recordedBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
          setBlob(recordedBlob);
          setPreviewUrl(URL.createObjectURL(recordedBlob));
        }
      };
      recorderRef.current = recorder;
      recorder.start();

      startTimeRef.current = Date.now();
      setElapsedSec(0);
      setStatus("recording");
      timerRef.current = window.setInterval(() => {
        const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSec(secs);
        if (secs >= maxDurationSec) {
          clearTimer();
          recorderRef.current?.stop();
          stopTracks();
          setStatus("stopped");
        }
      }, 250);
    } catch (err) {
      setStatus("denied");
      setError(err instanceof Error ? err.message : "Camera/microphone permission was denied.");
    }
  }, [maxDurationSec, stopTracks]);

  const stop = useCallback(() => {
    if (status !== "recording") return;
    clearTimer();
    skippedRef.current = false;
    recorderRef.current?.stop();
    stopTracks();
    setStatus("stopped");
  }, [status, stopTracks]);

  const skip = useCallback(() => {
    clearTimer();
    skippedRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    stopTracks();
    setStatus("skipped");
  }, [stopTracks]);

  const reset = useCallback(() => {
    clearTimer();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setStatus("idle");
    setElapsedSec(0);
    setError(null);
    chunksRef.current = [];
  }, [previewUrl]);

  useEffect(
    () => () => {
      clearTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { status, elapsedSec, error, stream, previewUrl, blob, start, stop, skip, reset };
}
