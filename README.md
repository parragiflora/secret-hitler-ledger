# Secret Hitler

Per `secret-hitler-ledger-spec.md` section 9's build order:

1. **Sections 1-5** (full rules engine) -- done.
2. **Section 6** (speech-capture start/stop hooks) -- done.
3. **Interhuman proxy + `signal_scores` storage** -- done.
4. **`trust_trajectory` rollup** -- done.
5. **Section 7** (Special Sessions + The Registrar's templated readouts) -- done.
6. **End-game recap visualization** -- done.

## Structure

```
packages/
  shared/   Pure TypeScript rules engine (state machine, roles, deck, powers,
            veto, succession, win conditions), speech-capture trigger logic
            (section 6), the trust_trajectory trend math (section 7a/9 step
            4: direction + magnitude per signal, plus the table-wide ambient
            tension aggregate), the Special Session state machine and its
            three triggers (section 7), a deterministic templated-readout
            generator (no LLM call), per-player redacted view + WS protocol
            types (including the end-game recap shape). Fully unit-tested
            (vitest).
  server/   Express + WebSocket server. In-memory games keyed by a 5-char
            room code. Broadcasts a redacted PlayerView to each connected
            socket after every action. Proxies captured clips to the
            Interhuman API (POST /api/games/:code/speech-events/:id/clip),
            stores the resulting signal_scores server-side, glues them into
            each player's trust_trajectory, generates each Special
            Session's two readouts, and assembles the full end-game recap
            (every player's complete signal history) once GAME_END --
            nothing else ever sends that data to a client (section 7/9
            step 6).
  client/   React + Vite frontend. Join/create a room, then a phase-driven
            UI (nomination, vote, legislative session, executive powers,
            Special Sessions, game end + recap charts), a capture panel
            (getUserMedia/MediaRecorder) dropped into the relevant phases,
            and a subtle ambient-tension indicator in the header.
```

## Just want to play?

**https://secret-hitler-ledger.fly.dev** -- always on, no setup, no terminal.
Open it, click **Create New Game**, share the room code. That's the whole
deployment: one Node process (see `Dockerfile`) serving the API, the
WebSocket connection, and the built client together, on Fly.io's free tier.

It scales to zero when nobody's using it (`fly.toml`'s
`auto_stop_machines`/`min_machines_running = 0`, to stay comfortably inside
the free allowance), so the very first request after a quiet stretch takes a
few extra seconds to wake back up -- normal, not broken.

To redeploy after code changes: `flyctl deploy` (needs `flyctl auth login`
once, or `FLY_API_TOKEN` set in a headless environment). Secrets (the
Interhuman API key) are already set on the app via `flyctl secrets set` --
redeploying doesn't touch them.

## Run it locally (development)

```bash
npm install
npm run dev
```

That starts both the game server (`:8787`) and the client (`:5173`) together.
Open `http://localhost:5173` yourself, click **Create New Game**, and share
the room code with the rest of the table.

`npm run dev:server` / `npm run dev:client` still work individually if you
want them in separate terminals.

### Getting other players onto a local dev instance

Only relevant if you're testing local changes rather than using the
deployed link above. The client dev server proxies both its REST calls and
its WebSocket connection to the game server (see
`packages/client/vite.config.ts`), so **only port 5173 ever needs to be
reachable by other players** -- the game server itself never needs to be
exposed.

- **Same WiFi:** `npm run dev` prints a `Network:` URL
  (`http://<your-LAN-IP>:5173`) right under the `Local:` one. Anyone on the
  same network opens that URL directly. Nothing else to do.

- **Different networks entirely:** run a tunnel pointed at port 5173 in a
  second terminal, e.g.

  ```bash
  npx ngrok http 5173
  ```

  Share the `https://....ngrok-free.app` URL it prints (instead of the LAN
  URL) along with the room code. Free tier gives you a new URL each time you
  restart the tunnel, and your machine has to stay on/connected for the
  whole game -- this is what the Fly.io deployment above exists to avoid.

### Interhuman API key (required)

```bash
cp packages/server/.env.example packages/server/.env
# paste your INTERHUMAN_API_KEY into packages/server/.env
```

The server refuses to start without this -- there is no mock-data fallback
anywhere. If a specific clip analysis call fails (bad network, API hiccup),
that one speech simply gets no `signal_scores` entry (the same
"insufficient data" state a deliberately-skipped speech already has); it
never blocks the game itself, and never fabricates a reading in its place.

To test the pipeline against a real recorded video without needing a full
5-player game:

```bash
npm run analyze-clip --workspace=@interhuman/server -- /path/to/clip.mov
```

## Test

```bash
npm test                # runs shared + server vitest suites
```

131 tests: shared covers the section-1 role distribution table, the policy
deck (including mid-round reshuffle), the executive-power lookup table, veto
unlock thresholds, presidency succession (including the special-election
"resume from who *would have* been President" gotcha in section 3), every
win condition, per-player view redaction (hidden roles/hands/votes), the
section-6 capture-trigger state machine, the trust_trajectory trend math
(direction/magnitude bucketing, insufficient-data fallback, the ambient
tension aggregate), the Special Session state machine (all three triggers,
guards against acting mid-session, the vote-to-propose flow), the templated
readout generator (variant rotation, insufficient-data fallback), and the
end-game recap (hidden before GAME_END, identical to every viewer once
there). Server covers the Interhuman proxy's response parsing and its
required-key/no-fallback error handling (missing key, failed call, non-OK
response, a response missing one of the 4 tracked signals -- all throw
rather than substituting fabricated data), the clip-upload route end to end
(auth, multer parsing, room/event lookup, a failed analysis correctly
leaving no `signal_scores` entry), the trust_trajectory glue logic, Special
Session readout generation/logging, and the recap's full per-player signal
series assembly.

## What's not built yet

Nothing from the section 9 build order -- all 6 steps are done. The spec's
own section 10 "Decisions (resolved)" and later sections describe further
optional directions (e.g. revisiting templated readouts with an LLM after
more playtesting) that were deliberately left as future work, not gaps.
