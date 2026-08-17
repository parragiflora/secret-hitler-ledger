# Secret Hitler

Per `secret-hitler-ledger-spec.md` section 9's build order:

1. **Sections 1-5** (full rules engine) -- done.
2. **Section 6** (speech-capture start/stop hooks) -- done.
3. **Interhuman proxy + `signal_scores` storage** -- done.
4. **`trust_trajectory` rollup** -- done.
5. **Section 7** (Special Sessions + The Registrar's templated readouts) -- done.
6. End-game recap visualization -- not yet.

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
            types. Fully unit-tested (vitest).
  server/   Express + WebSocket server. In-memory games keyed by a 5-char
            room code. Broadcasts a redacted PlayerView to each connected
            socket after every action. Proxies captured clips to the
            Interhuman API (POST /api/games/:code/speech-events/:id/clip),
            stores the resulting signal_scores server-side, glues them into
            each player's trust_trajectory, and generates each Special
            Session's two readouts (never sent to any client except through
            those two surfaces -- the ambient tension reading and a Special
            Session's readout -- per section 7).
  client/   React + Vite frontend. Join/create a room, then a phase-driven
            UI (nomination, vote, legislative session, executive powers,
            Special Sessions, game end), a capture panel
            (getUserMedia/MediaRecorder) dropped into the relevant phases,
            and a subtle ambient-tension indicator in the header.
```

## Run it

```bash
npm install
npm run dev
```

That starts both the game server (`:8787`) and the client (`:5173`) together.
Open `http://localhost:5173` yourself, click **Create New Game**, and share
the room code with the rest of the table.

`npm run dev:server` / `npm run dev:client` still work individually if you
want them in separate terminals.

### Getting other players onto the page

The client dev server proxies both its REST calls and its WebSocket
connection to the game server (see `packages/client/vite.config.ts`), so
**only port 5173 ever needs to be reachable by other players** -- the game
server itself never needs to be exposed.

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
  whole game -- fine for a one-off game night, not for something you want a
  permanent link to. Every other player, including you, uses that one URL.

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

125 tests: shared covers the section-1 role distribution table, the policy
deck (including mid-round reshuffle), the executive-power lookup table, veto
unlock thresholds, presidency succession (including the special-election
"resume from who *would have* been President" gotcha in section 3), every
win condition, per-player view redaction (hidden roles/hands/votes), the
section-6 capture-trigger state machine, the trust_trajectory trend math
(direction/magnitude bucketing, insufficient-data fallback, the ambient
tension aggregate), the Special Session state machine (all three triggers,
guards against acting mid-session, the vote-to-propose flow), and the
templated readout generator (variant rotation, insufficient-data fallback).
Server covers the Interhuman proxy's response parsing (including graceful
fallback to mock scores on any API surprise), the clip-upload route end to
end (auth, multer parsing, room/event lookup), the trust_trajectory glue
logic, and Special Session readout generation/logging.

## What's not built yet (see section 9 build order)

- End-game recap visualization (section 9 step 6)
