import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, GameAction, PlayerView, ServerMessage } from "@interhuman/shared";

// Defaults to same-origin (relative URLs) so this works unmodified whether
// the page was opened as localhost, a LAN IP, or a tunnel hostname -- the
// dev server proxies /api and /ws through to the game server either way
// (see vite.config.ts). Set VITE_SERVER_URL only if the server is deployed
// somewhere separate from the client.
const SERVER_HTTP = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "";
const SERVER_WS = SERVER_HTTP
  ? SERVER_HTTP.replace(/^http/, "ws") + "/ws"
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

interface StoredSession {
  code: string;
  playerId: string;
  token: string;
  name: string;
}

// One session per room code (so a browser can hold seats in several rooms
// over time), plus a pointer to whichever room was most recently active so a
// fresh page load can silently rejoin it without the player re-entering
// anything (the actual reconnect gap this module fixes).
const LAST_ROOM_KEY = "secret-hitler-last-room";
function sessionKey(code: string): string {
  return `secret-hitler-session-${code.toUpperCase()}`;
}

function getStoredSession(code: string): StoredSession | null {
  const raw = localStorage.getItem(sessionKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredSession): void {
  localStorage.setItem(sessionKey(session.code), JSON.stringify(session));
  localStorage.setItem(LAST_ROOM_KEY, session.code);
}

function clearStoredSession(code: string): void {
  localStorage.removeItem(sessionKey(code));
  if (localStorage.getItem(LAST_ROOM_KEY)?.toUpperCase() === code.toUpperCase()) {
    localStorage.removeItem(LAST_ROOM_KEY);
  }
}

function getLastRoomCode(): string | null {
  return localStorage.getItem(LAST_ROOM_KEY);
}

/** Does this browser already hold a seat in `code`? Lets the join screen offer a one-click rejoin. */
export function storedSeatFor(code: string): { name: string } | null {
  if (!code.trim()) return null;
  const s = getStoredSession(code);
  return s ? { name: s.name } : null;
}

/**
 * Uploads a recorded speech clip for analysis (section 9 step 3). Fire-and-
 * forget from the caller's perspective -- never blocks game progression, and
 * silently no-ops if this browser has no session for the room (shouldn't
 * happen in practice, since you can only be recording your own speech).
 */
export async function uploadClip(code: string, speechEventId: string, blob: Blob): Promise<{ ok: boolean }> {
  const session = getStoredSession(code);
  if (!session) return { ok: false };
  const form = new FormData();
  form.append("clip", blob, "clip.webm");
  try {
    const res = await fetch(`${SERVER_HTTP}/api/games/${code}/speech-events/${speechEventId}/clip`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
      body: form,
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { ok: boolean };
    return data;
  } catch {
    return { ok: false };
  }
}

export async function createRoom(): Promise<string> {
  const res = await fetch(`${SERVER_HTTP}/api/games`, { method: "POST" });
  if (!res.ok) throw new Error("Could not reach the server to create a game.");
  const data = (await res.json()) as { code: string };
  return data.code;
}

export interface UseGame {
  view: PlayerView | null;
  error: string | null;
  connecting: boolean;
  reconnecting: boolean;
  connect: (code: string, name?: string) => void;
  sendAction: (action: GameAction) => void;
  leaveSession: (code: string) => void;
}

export function useGame(): UseGame {
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback((code: string, name?: string, silent = false) => {
    if (silent) setReconnecting(true);
    else setConnecting(true);
    setError(null);
    const ws = new WebSocket(SERVER_WS);
    wsRef.current = ws;

    // A stored session for this room always wins over a freshly typed name --
    // that's what lets a reloaded/rejoined tab resume its seat mid-game
    // instead of attempting (and failing) a brand-new JOIN_GAME once the
    // lobby has already started.
    const stored = getStoredSession(code);

    ws.onopen = () => {
      const hello: ClientMessage = stored
        ? { type: "HELLO", code, playerId: stored.playerId, token: stored.token }
        : { type: "HELLO", code, name };
      ws.send(JSON.stringify(hello));
    };

    ws.onmessage = (ev) => {
      const msg: ServerMessage = JSON.parse(ev.data as string);
      if (msg.type === "WELCOME") {
        saveStoredSession({ code, playerId: msg.playerId, token: msg.token, name: stored?.name ?? name ?? "" });
        setView(msg.view);
        setConnecting(false);
        setReconnecting(false);
      } else if (msg.type === "STATE") {
        setView(msg.view);
      } else if (msg.type === "ERROR") {
        // A stale/invalid reconnect (room gone, token no longer valid) should
        // fall back to a fresh join next time, not keep retrying the same
        // broken session.
        if (stored) clearStoredSession(code);
        if (!silent) setError(msg.message);
        setConnecting(false);
        setReconnecting(false);
      }
    };

    ws.onerror = () => {
      if (!silent) setError("Connection error -- is the server running?");
    };
    ws.onclose = () => {
      setConnecting(false);
      setReconnecting(false);
    };
  }, []);

  const sendAction = useCallback((action: GameAction) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      setError("Not connected.");
      return;
    }
    const message: ClientMessage = { type: "ACTION", action };
    wsRef.current.send(JSON.stringify(message));
  }, []);

  const leaveSession = useCallback((code: string) => {
    clearStoredSession(code);
    wsRef.current?.close();
    setView(null);
  }, []);

  // Silently resume the most recently active room on load, if this browser
  // holds a seat in one -- the fix for "reload/rejoin a tab mid-game".
  useEffect(() => {
    const lastCode = getLastRoomCode();
    if (lastCode && getStoredSession(lastCode)) {
      connect(lastCode, undefined, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  return { view, error, connecting, reconnecting, connect, sendAction, leaveSession };
}
