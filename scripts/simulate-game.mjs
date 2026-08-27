#!/usr/bin/env node
// Plays a full game end-to-end against a running server (local dev or the
// live deployment) with every seat scripted -- no real players needed. Only
// talks to the server's public HTTP/WS API (create room, join, act), so it
// exercises exactly what a real browser would, including catching
// infrastructure-level bugs (state split across machines, a room getting
// wiped by an idle restart) that unit tests can't see at all.
//
// Usage:
//   node scripts/simulate-game.mjs [options]
//
// Options:
//   --url <base>          Target base URL (default: the live deployment)
//   --players <n>         5-10 (default 6)
//   --idle-seconds <n>    After the first government is seated, close every
//                         connection, wait <n> seconds with ZERO open
//                         connections, then reconnect with saved tokens and
//                         verify the room survived. This is what would have
//                         caught the auto_stop_machines bug -- an idle gap
//                         with no traffic is exactly what let the machine
//                         restart and wipe the room. 0 (default) skips this.
//   --max-rounds <n>      Safety cap on total actions taken (not game
//                         rounds -- each real round takes ~4-8 of these), so
//                         a genuinely stuck game doesn't run forever.
//                         Default 400 comfortably covers a full game.
//
// Exit code is 0 only if the game reached GAME_END with zero errors and
// (if requested) the idle-gap probe found the room intact.

const args = process.argv.slice(2);
function argVal(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

const BASE_HTTP = argVal("url", "https://secret-hitler-ledger.fly.dev").replace(/\/$/, "");
const BASE_WS = BASE_HTTP.replace(/^http/, "ws") + "/ws";
const PLAYER_COUNT = Math.max(5, Math.min(10, Number(argVal("players", 6))));
const IDLE_SECONDS = Number(argVal("idle-seconds", 0));
const MAX_ROUNDS = Number(argVal("max-rounds", 400));
const ALL_NAMES = ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy"];
const NAMES = ALL_NAMES.slice(0, PLAYER_COUNT);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

function log(...a) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}

async function createRoomCode() {
  const res = await fetch(`${BASE_HTTP}/api/games`, { method: "POST" });
  if (!res.ok) throw new Error(`create room failed: HTTP ${res.status}`);
  return (await res.json()).code;
}

function connect(name, roomCode, { playerId, token } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE_WS);
    const state = { ws, name, playerId: playerId ?? null, token: token ?? null, view: null, connected: false };
    const timeout = setTimeout(() => reject(new Error(`${name}: connect timed out`)), 15000);
    ws.addEventListener("open", () => {
      const hello = playerId && token ? { type: "HELLO", code: roomCode, playerId, token } : { type: "HELLO", code: roomCode, name };
      ws.send(JSON.stringify(hello));
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "WELCOME") {
        clearTimeout(timeout);
        state.playerId = msg.playerId;
        state.token = msg.token;
        state.view = msg.view;
        state.connected = true;
        resolve(state);
      } else if (msg.type === "STATE") {
        state.view = msg.view;
      } else if (msg.type === "ERROR") {
        errors.push({ name, message: msg.message, at: new Date().toISOString() });
        log(`  [${name}] ERROR:`, msg.message);
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error(`${name}: WebSocket error`));
    });
    ws.addEventListener("close", () => {
      state.connected = false;
    });
  });
}

function send(state, action) {
  state.ws.send(JSON.stringify({ type: "ACTION", action }));
}

async function playRound(players, byId) {
  const view = players[0].view;
  const alive = view.players.filter((p) => p.isAlive);

  if (view.pendingSpecialSessionVote) {
    const vote = view.pendingSpecialSessionVote;
    for (const p of players) {
      if (!vote.votesCast.includes(p.playerId) && view.players.find((pp) => pp.id === p.playerId)?.isAlive) {
        send(p, { type: "CAST_SPECIAL_SESSION_VOTE", playerId: p.playerId, choice: "ja" });
      }
    }
    return;
  }

  if (view.phase === "SPECIAL_SESSION" && view.activeSpecialSession) {
    const pres = byId[view.activeSpecialSession.presidentId];
    send(pres, { type: "CONTINUE_SPECIAL_SESSION", presidentId: pres.playerId });
    return;
  }

  if (view.phase === "ROLE_REVEAL") {
    for (const p of players) send(p, { type: "ACKNOWLEDGE_ROLE", playerId: p.playerId });
    return;
  }

  if (view.phase === "NOMINATION") {
    const president = byId[view.presidentId];
    send(president, { type: "RECORD_SPEECH_EVENT", playerId: president.playerId, eventType: "nomination_speech", durationMs: null, skipped: true });
    await sleep(150);
    const eligible = alive.filter((p) => p.id !== view.presidentId && p.id !== view.termLimitedChancellorId);
    const nominee = eligible[0] ?? alive.find((p) => p.id !== view.presidentId);
    send(president, { type: "NOMINATE_CHANCELLOR", presidentId: view.presidentId, nomineeId: nominee.id });
    return;
  }

  if (view.phase === "ELECTION_VOTE") {
    for (const p of players) {
      const stillAlive = view.players.find((pp) => pp.id === p.playerId)?.isAlive;
      const isNominee = p.playerId === view.presidentialCandidateId;
      if (stillAlive && !isNominee) send(p, { type: "CAST_VOTE", playerId: p.playerId, choice: "ja" });
    }
    return;
  }

  if (view.phase === "LEGISLATIVE_PRESIDENT") {
    const president = byId[view.presidentId];
    send(president, { type: "PRESIDENT_DISCARD", presidentId: view.presidentId, discardIndex: 0 });
    return;
  }

  if (view.phase === "VETO_RESPONSE") {
    const president = byId[view.presidentId];
    send(president, { type: "PRESIDENT_VETO_RESPONSE", presidentId: view.presidentId, accept: true });
    return;
  }

  if (view.phase === "LEGISLATIVE_CHANCELLOR") {
    const chancellor = byId[view.chancellorId];
    send(chancellor, { type: "CHANCELLOR_ENACT", chancellorId: view.chancellorId, enactIndex: 0 });
    return;
  }

  if (view.phase === "POLICY_DEFENSE") {
    const chancellor = byId[view.chancellorId];
    send(chancellor, { type: "RECORD_SPEECH_EVENT", playerId: view.chancellorId, eventType: "policy_defense", durationMs: null, skipped: true });
    await sleep(150);
    send(chancellor, { type: "ACKNOWLEDGE_POLICY_DEFENSE", chancellorId: view.chancellorId });
    return;
  }

  if (view.phase === "EXECUTIVE_ACTION") {
    const president = byId[view.presidentId];
    const power = view.pendingExecutivePower;
    const target = alive.find((p) => p.id !== view.presidentId);
    const uninvestigated = alive.find((p) => p.id !== view.presidentId && !view.investigatedPlayerIds.includes(p.id));
    if (power === "investigate_loyalty") {
      if (!president.view.myExecutiveResult) send(president, { type: "EXECUTIVE_INVESTIGATE", presidentId: view.presidentId, targetId: (uninvestigated ?? target).id });
      else send(president, { type: "ACKNOWLEDGE_EXECUTIVE_ACTION", presidentId: view.presidentId });
    } else if (power === "policy_peek") {
      if (!president.view.myExecutiveResult) send(president, { type: "EXECUTIVE_POLICY_PEEK", presidentId: view.presidentId });
      else send(president, { type: "ACKNOWLEDGE_EXECUTIVE_ACTION", presidentId: view.presidentId });
    } else if (power === "special_election") {
      if (!view.specialElectionNextPresidentId) send(president, { type: "EXECUTIVE_SPECIAL_ELECTION", presidentId: view.presidentId, targetId: target.id });
      else send(president, { type: "ACKNOWLEDGE_EXECUTIVE_ACTION", presidentId: view.presidentId });
    } else if (power === "execution") {
      send(president, { type: "EXECUTIVE_EXECUTION", presidentId: view.presidentId, targetId: target.id });
    }
    return;
  }
}

async function main() {
  log(`Target: ${BASE_HTTP}  players: ${PLAYER_COUNT}  idle-test: ${IDLE_SECONDS || "off"}`);

  const roomCode = await createRoomCode();
  log("Room created:", roomCode);

  let players = [];
  for (const n of NAMES) {
    players.push(await connect(n, roomCode));
    await sleep(100);
  }
  let byId = Object.fromEntries(players.map((p) => [p.playerId, p]));
  log("All players joined.");

  send(players[0], { type: "START_GAME" });
  await sleep(400);

  let rounds = 0;
  let idleTestDone = IDLE_SECONDS <= 0;
  while (rounds < MAX_ROUNDS) {
    const view = players[0].view;
    if (view.phase === "GAME_END") {
      log("GAME_END -- winner:", view.winner, "| reason:", view.winReason);
      break;
    }

    // Run the idle-gap probe once, right after the first government is
    // seated (a stable, realistic mid-game moment) -- this is what would
    // have caught the auto-stop-wipes-the-room bug.
    if (!idleTestDone && view.roundNumber >= 1 && view.phase === "LEGISLATIVE_PRESIDENT") {
      idleTestDone = true;
      log(`Idle-gap probe: closing all ${players.length} connections, waiting ${IDLE_SECONDS}s with zero traffic...`);
      for (const p of players) p.ws.close();
      await sleep(IDLE_SECONDS * 1000);
      log("Idle-gap probe: reconnecting with saved tokens...");
      try {
        players = await Promise.all(players.map((p) => connect(p.name, roomCode, { playerId: p.playerId, token: p.token })));
        byId = Object.fromEntries(players.map((p) => [p.playerId, p]));
        log("Idle-gap probe PASSED -- room and all", players.length, "player sessions survived the idle gap.");
      } catch (err) {
        errors.push({ name: "idle-probe", message: err.message, at: new Date().toISOString() });
        log("Idle-gap probe FAILED:", err.message);
        break;
      }
      continue;
    }

    await playRound(players, byId);
    await sleep(200);
    rounds++;
  }

  await sleep(500);
  const finalView = players[0].view;
  console.log("\n--- Summary ---");
  console.log("Room:", roomCode);
  console.log("Final phase:", finalView.phase);
  console.log("Rounds elapsed:", rounds, "/", MAX_ROUNDS);
  console.log("Errors:", errors.length);
  for (const e of errors) console.log(" -", e.at, e.name, "->", e.message);

  for (const p of players) p.ws.close();

  const ok = finalView.phase === "GAME_END" && errors.length === 0;
  console.log(ok ? "\nRESULT: PASS" : "\nRESULT: FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Simulation crashed:", err);
  process.exit(1);
});
