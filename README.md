# Secret Hitler

A web build of [Secret Hitler](https://www.secrethitler.com/) — the hidden-role
party game where Liberals and Fascists (one of whom is secretly Hitler)
vote governments into power and pass policies, with no reliable way to
know who's on which side except how people talk and vote.

This version adds a twist: **The Registrar**, an AI that quietly watches
speech at key moments (nominating a Chancellor, defending a policy, last
words before an execution) and reads behavioral signals from it — building
a private read on each player over the course of the game. It never
interrupts play with a running commentary. Occasionally, a Special Session
pauses the table and The Registrar reveals two findings about whoever's
currently in government. At the very end, once the game is over, everyone
sees the complete picture for every player — the full signal history laid
out, right next to who was actually on which team.

## Play

**https://secret-hitler-ledger.fly.dev**

Open it, click **Create New Game**, share the room code with 4-9 other
players. There's a "How to Play" walkthrough on the join screen and in the
lobby if anyone needs the rules. Needs 5-10 players to start.

The app stays running continuously (no scale-to-zero) -- game rooms live
only in that process's memory with no persistence layer, so the machine
restarting for any reason wipes every active room. Don't change that
without adding real persistence first (see `fly.toml`'s warning comment).

## How it's built

```
packages/
  shared/   The game's rules as a pure, fully unit-tested state machine --
            no I/O, no side effects. Roles, the policy deck, elections,
            executive powers, win conditions, the speech-capture triggers,
            the Special Session logic, and the trend math behind what The
            Registrar reports.
  server/   Express + WebSocket server. Holds games in memory, broadcasts
            each player their own (role-appropriate, redacted) view of the
            game after every action, and proxies captured speech clips to
            the Interhuman API for analysis.
  client/   React + Vite frontend -- join/create a room, then a UI that
            walks through each phase of a round, with camera capture
            dropped in at the moments that matter.
```

One Node process (see `Dockerfile`) serves the API, the WebSocket
connection, and the built client together -- that's the whole deployment.

## Local development

```bash
npm install
cp packages/server/.env.example packages/server/.env
# paste a real INTERHUMAN_API_KEY into that file -- the server won't start without one
npm run dev
```

That starts the game server (`:8787`) and the client (`:5173`) together.
Open `http://localhost:5173`, click **Create New Game**, share the room
code. (`npm run dev:server` / `npm run dev:client` work individually too,
if you want them in separate terminals.)

To test the Interhuman pipeline against a real recorded video, without
needing a full 5-player game to trigger a capture moment:

```bash
npm run analyze-clip --workspace=@interhuman/server -- /path/to/clip.mov
```

### Getting other players onto a local dev instance

Only relevant if you're testing local changes rather than using the
deployed link above. The client dev server proxies its API and WebSocket
traffic to the game server, so only port 5173 ever needs to be reachable.

- **Same WiFi:** `npm run dev` prints a `Network:` URL right under the
  `Local:` one -- open that on another device on the same network.
- **Different networks:** run `npx ngrok http 5173` in a second terminal
  and share the URL it prints instead. Free tier gives a new URL each
  restart, and your machine has to stay on for the whole game -- which is
  exactly what the deployed link above exists to avoid.

## Tests

```bash
npm test
```

## Deploying

```bash
flyctl deploy
```

Needs `flyctl auth login` once (or `FLY_API_TOKEN` in a headless
environment). The Interhuman API key is already set on the app as a Fly
secret and isn't touched by a redeploy.

**After every deploy, check the machine count:**

```bash
flyctl machines list --app secret-hitler-ledger
```

Game rooms live only in that process's in-memory `Map` -- there's no shared
store -- so this app must always run as exactly **one** machine. Fly's
default rolling-deploy strategy provisions a second one anyway ("for
zero-downtime deploys"), which silently splits players across two
disconnected game universes depending on which one their connection lands
on. If you ever see more than one machine listed:

```bash
flyctl scale count 1 --app secret-hitler-ledger --yes
```
