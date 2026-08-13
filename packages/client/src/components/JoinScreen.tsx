import { useMemo, useState } from "react";
import { createRoom, storedSeatFor } from "../useGame";

export function JoinScreen({
  connecting,
  error,
  onJoin,
}: {
  connecting: boolean;
  error: string | null;
  onJoin: (code: string, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // If this browser already holds a seat in the room code as typed, offer a
  // one-click rejoin instead of demanding a name for a seat it already has.
  const seat = useMemo(() => storedSeatFor(code), [code]);

  async function handleCreate() {
    if (!name.trim()) {
      setCreateError("Enter your name first.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const newCode = await createRoom();
      onJoin(newCode, name);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create a game.");
    } finally {
      setCreating(false);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    if (!seat && !name.trim()) return; // name only required for a brand-new seat
    onJoin(code.trim().toUpperCase(), name.trim());
  }

  return (
    <div className="join-screen">
      <h1>Secret Hitler + The Ledger</h1>
      <p className="tagline">The Registrar is watching.</p>

      <form onSubmit={handleJoin} className="join-form">
        <label>
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder={seat ? seat.name : "Alice"}
            disabled={Boolean(seat)}
          />
        </label>

        <label>
          Room code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={5}
            placeholder="ABCDE"
          />
        </label>

        {seat && (
          <p className="hint">
            You already have a seat here as <strong>{seat.name}</strong> -- rejoin below.
          </p>
        )}

        <button type="submit" disabled={connecting}>
          {seat ? `Rejoin as ${seat.name}` : "Join Game"}
        </button>
      </form>

      <div className="divider">or</div>

      <button onClick={handleCreate} disabled={creating || connecting} className="secondary">
        {creating ? "Creating..." : "Create New Game"}
      </button>

      {(error || createError) && <p className="error">{error ?? createError}</p>}
    </div>
  );
}
