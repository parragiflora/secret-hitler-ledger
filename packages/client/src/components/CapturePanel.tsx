import { useEffect, useRef, useState } from "react";
import { speechEventId, type GameAction, type PlayerView, type SpeechEventType } from "@interhuman/shared";
import { useCapture } from "../useCapture";
import { uploadClip } from "../useGame";

type Send = (action: GameAction) => void;

const LABELS: Record<SpeechEventType, string> = {
  nomination_speech: "Nomination Speech",
  acceptance_speech: "Acceptance Speech",
  policy_defense: "Policy Defense",
  investigation_announcement: "Investigation Announcement",
  last_words: "Last Words",
};

/**
 * Section 6: renders the active speech-capture moment, if any. Self-guards --
 * renders nothing if there's no active moment or it's already been logged.
 * Non-speakers see a passive "X is speaking" note; the speaker gets record/
 * stop/skip controls. On submit, the clip is uploaded for analysis (section
 * 9 step 3) as a fire-and-forget call -- it never blocks game progression,
 * and the analyzed scores are never shown here (or anywhere outside a
 * Special Session's readout, a later phase).
 */
export function CapturePanel({ view, send }: { view: PlayerView; send: Send }) {
  const capture = view.activeCapture;
  const isSpeaker = capture?.speakerId === view.myId;
  const { status, elapsedSec, error, stream, previewUrl, blob, start, stop, skip, reset } = useCapture(
    capture?.maxDurationSec ?? 30,
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "sent" | "failed">("idle");

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  // Reset local recorder state whenever the active moment itself changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    reset();
    setConfirmingSkip(false);
    setUploadStatus("idle");
  }, [capture?.eventType, capture?.speakerId, view.roundNumber]);

  if (!capture || view.activeCaptureLogged) return null;

  function submit(skipped: boolean) {
    const durationMs = skipped ? null : elapsedSec * 1000;
    send({ type: "RECORD_SPEECH_EVENT", playerId: view.myId, eventType: capture!.eventType, durationMs, skipped });

    if (!skipped && blob) {
      const eventId = speechEventId(view.myId, capture!.eventType, view.roundNumber);
      setUploadStatus("uploading");
      uploadClip(view.code, eventId, blob).then((result) => {
        setUploadStatus(result.ok ? "sent" : "failed");
      });
    }
  }

  const speakerName = view.players.find((p) => p.id === capture.speakerId)?.name ?? "?";
  const label = LABELS[capture.eventType] + (capture.required ? " (required)" : " (optional)");

  if (!isSpeaker) {
    return (
      <div className="capture-panel bystander">
        <span className="capture-label">{label}</span>
        <p className="hint">
          {speakerName} {capture.required ? "is speaking..." : "may optionally speak..."}
        </p>
      </div>
    );
  }

  return (
    <div className="capture-panel">
      <span className="capture-label">{label}</span>

      {status === "idle" && !confirmingSkip && (
        <div className="capture-actions">
          <button onClick={start}>Record</button>
          <button
            className="secondary"
            onClick={() => {
              // Required moments get a nag before skipping (section 6:
              // "Required (prompt if skipped)"); optional ones skip at once.
              if (capture.required) setConfirmingSkip(true);
              else {
                skip();
                submit(true);
              }
            }}
          >
            Skip
          </button>
        </div>
      )}

      {status === "idle" && confirmingSkip && (
        <div className="capture-actions">
          <p className="hint">This speech is required for the Ledger. Skip anyway?</p>
          <button
            className="secondary danger"
            onClick={() => {
              skip();
              submit(true);
            }}
          >
            Skip anyway
          </button>
          <button onClick={() => setConfirmingSkip(false)}>Never mind, I'll record</button>
        </div>
      )}

      {status === "requesting" && <p className="hint">Requesting camera/mic access...</p>}

      {status === "recording" && (
        <div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} autoPlay muted playsInline className="capture-preview" />
          <p className="hint">
            Recording... {elapsedSec}s / {capture.maxDurationSec}s
          </p>
          <button onClick={stop}>Stop</button>
        </div>
      )}

      {status === "stopped" && (
        <div>
          {previewUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={previewUrl} controls className="capture-preview" />
          )}
          <p className="hint">Captured {elapsedSec}s.</p>
          {uploadStatus === "idle" ? (
            <div className="capture-actions">
              <button onClick={() => submit(false)}>Submit</button>
              <button className="secondary" onClick={reset}>
                Redo
              </button>
            </div>
          ) : (
            <p className="hint">
              {uploadStatus === "uploading" && "Sending to The Registrar..."}
              {uploadStatus === "sent" && "Sent to The Registrar."}
              {uploadStatus === "failed" && "Recorded, but the upload didn't go through."}
            </p>
          )}
        </div>
      )}

      {status === "denied" && (
        <div>
          <p className="error">{error}</p>
          <button onClick={() => submit(true)}>Continue without recording</button>
        </div>
      )}
    </div>
  );
}
