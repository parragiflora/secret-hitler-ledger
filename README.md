# Secret Hitler + The Ledger

Per `secret-hitler-ledger-spec.md` section 9's build order:

1. **Sections 1-5** (full rules engine) -- done.
2. **Section 6** (speech-capture start/stop hooks) -- done.
3. **Interhuman proxy + `signal_scores` storage** -- done.
4. **`trust_trajectory` rollup** -- done.
5. Section 7 (Special Sessions + The Registrar's templated readouts) -- not yet.
6. End-game recap visualization -- not yet.

## Structure

```
packages/
  shared/   Pure TypeScript rules engine (state machine, roles, deck, powers,
            veto, succession, win conditions), speech-capture trigger logic
            (section 6), the trust_trajectory trend math (section 7a/9 step
            4: direction + magnitude per signal, plus the table-wide ambient
            tension aggregate), per-player redacted view + WS protocol
            types. Fully unit-tested (vitest).
  server/   Express + WebSocket server. In-memory games keyed by a 5-char
            room code. Broadcasts a redacted PlayerView to each connected
            socket after every action. Proxies captured clips to the
            Interhuman API (POST /api/games/:code/speech-events/:id/clip),
            stores the resulting signal_scores server-side, and glues them
            together with each player's speechEvents into their
            trust_trajectory -- never sent to any client except as the one
            non-specific "ambient tension" reading (section 7: nothing else
            is shown outside a Special Session's readout, a later phase).
  client/   React + Vite frontend. Join/create a room, then a phase-driven
            UI (nomination, vote, legislative session, executive powers,
            game end) built from simple buttons/text, with a capture panel
            (getUserMedia/MediaRecorder) dropped into the relevant phases,
            and a subtle ambient-tension indicator in the header.
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

### Interhuman API key (optional)

```bash
cp packages/server/.env.example packages/server/.env
# paste your INTERHUMAN_API_KEY into packages/server/.env
```

Without a key, clip analysis runs in **mock mode** (realistic fake signal
scores, no network call) -- the app is fully playable and demoable either way.

To test the pipeline against a real recorded video without needing a full
5-player game:

```bash
npm run analyze-clip --workspace=@interhuman/server -- /path/to/clip.mov
```

## Test

```bash
npm test                # runs shared + server vitest suites
```

93 tests: shared covers the section-1 role distribution table, the policy
deck (including mid-round reshuffle), the executive-power lookup table, veto
unlock thresholds, presidency succession (including the special-election
"resume from who *would have* been President" gotcha in section 3), every
win condition, per-player view redaction (hidden roles/hands/votes), the
section-6 capture-trigger state machine, and the trust_trajectory trend math
(direction/magnitude bucketing, insufficient-data fallback, the ambient
tension aggregate). Server covers the Interhuman proxy's response parsing
(including graceful fallback to mock scores on any API surprise), the
clip-upload route end to end (auth, multer parsing, room/event lookup), and
the trust_trajectory glue logic (per-player filtering/ordering, room-wide
aggregation).

## What's not built yet (see section 9 build order)

- Special Sessions + The Registrar's templated readouts (section 7)
- End-game recap visualization (section 9 step 6)
