# Secret Hitler + The Ledger

Phase 1 build (per `secret-hitler-ledger-spec.md` section 9): the full rules
engine for sections 1-5, playable end-to-end by real players over the network,
with **no AI and no video capture yet**. The Registrar's speech-capture,
signal scoring, and Special Sessions are later phases.

## Structure

```
packages/
  shared/   Pure TypeScript rules engine (state machine, roles, deck,
            powers, veto, succession, win conditions) + per-player
            redacted view + WS protocol types. Fully unit-tested (vitest).
  server/   Express + WebSocket server. In-memory games keyed by a 5-char
            room code. Broadcasts a redacted PlayerView to each connected
            socket after every action.
  client/   React + Vite frontend. Join/create a room, then a phase-driven
            UI (nomination, vote, legislative session, executive powers,
            game end) built from simple buttons/text.
```

## Run it

```bash
npm install

# terminal 1
npm run dev:server      # http://localhost:8787

# terminal 2
npm run dev:client      # http://localhost:5173
```

Open the client in 5-10 browser tabs/devices, one player creates a game and
shares the room code, everyone else joins with it.

## Test

```bash
npm test                # runs the shared package's vitest suite
```

43 tests cover the section-1 role distribution table, the policy deck
(including mid-round reshuffle), the executive-power lookup table, veto
unlock thresholds, presidency succession (including the special-election
"resume from who *would have* been President" gotcha in section 3), every
win condition, and per-player view redaction (hidden roles/hands/votes).

## What's not built yet (see section 9 build order)

- Speech/signal capture hooks (section 6)
- Interhuman proxy + `signal_scores` (section 9 step 3)
- `trust_trajectory` rollup (section 9 step 4)
- Special Sessions + The Registrar's templated readouts (section 7)
- End-game recap visualization (section 9 step 6)
