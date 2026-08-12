import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, GameAction, PlayerView, ServerMessage } from "@interhuman/shared";

const SERVER_HTTP = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "http://localhost:8787";
const SERVER_WS = SERVER_HTTP.replace(/^http/, "ws") + "/ws";

interface StoredSession {
  code: string;
  playerId: string;
  token: string;
}

function sessionKey(code: string): string {
  return `secret-hitler-session-${code.toUpperCase()}`;
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
  connect: (code: string, name?: string) => void;
  sendAction: (action: GameAction) => void;
  leaveSession: (code: string) => void;
}

export function useGame(): UseGame {
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback((code: string, name?: string) => {
    setConnecting(true);
    setError(null);
    const ws = new WebSocket(SERVER_WS);
    wsRef.current = ws;

    ws.onopen = () => {
      const stored = localStorage.getItem(sessionKey(code));
      if (stored && !name) {
        const s: StoredSession = JSON.parse(stored);
        const hello: ClientMessage = { type: "HELLO", code, playerId: s.playerId, token: s.token };
        ws.send(JSON.stringify(hello));
      } else {
        const hello: ClientMessage = { type: "HELLO", code, name };
        ws.send(JSON.stringify(hello));
      }
    };

    ws.onmessage = (ev) => {
      const msg: ServerMessage = JSON.parse(ev.data as string);
      if (msg.type === "WELCOME") {
        const session: StoredSession = { code, playerId: msg.playerId, token: msg.token };
        localStorage.setItem(sessionKey(code), JSON.stringify(session));
        setView(msg.view);
        setConnecting(false);
      } else if (msg.type === "STATE") {
        setView(msg.view);
      } else if (msg.type === "ERROR") {
        setError(msg.message);
        setConnecting(false);
      }
    };

    ws.onerror = () => setError("Connection error -- is the server running?");
    ws.onclose = () => setConnecting(false);
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
    localStorage.removeItem(sessionKey(code));
    wsRef.current?.close();
    setView(null);
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  return { view, error, connecting, connect, sendAction, leaveSession };
}
