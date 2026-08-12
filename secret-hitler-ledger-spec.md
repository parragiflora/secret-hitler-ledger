# Secret Hitler + The Ledger — Rules Engine Spec

A build spec for Claude Code. Covers standard Secret Hitler rules as a state machine, plus the new Ledger / Special Session mechanics layered on top. Written to be implementation-ready — phases, valid transitions, edge cases, and where Interhuman hooks in.

---

## 0. Naming: "The Registrar"

The AI persona is called **The Registrar** throughout this build — the in-fiction bureaucratic record-keeper that silently maintains "The Ledger" (every player's trust trajectory) and steps forward only during Special Sessions to read its findings aloud. Use this name in all player-facing UI and generated text instead of generic "the AI" — e.g. "The Registrar has called a Special Session," "The Registrar's findings on the President and Chancellor," not "AI analysis complete." Fits the bureaucratic/political theme (policies, elections, official records) and reads better live than a generic assistant voice.

(Alternatives if you want a different flavor: The Stenographer, The Clerk, The Notary — swap via find-and-replace on "Registrar" if you change your mind.)

---

## 1. Game setup

### Player count → role distribution

| Players | Liberals | Fascists (non-Hitler) | Hitler | Hitler knows fascists? |
|---|---|---|---|---|
| 5 | 3 | 1 | 1 | Yes |
| 6 | 4 | 1 | 1 | Yes |
| 7 | 4 | 2 | 1 | No |
| 8 | 5 | 2 | 1 | No |
| 9 | 5 | 3 | 1 | No |
| 10 | 6 | 3 | 1 | No |

Rules:
- Minimum 5 players, maximum 10.
- Fascists always know each other and know who Hitler is, regardless of player count.
- Hitler knows the fascist team only in 5-6 player games.
- Roles are assigned once at game start and **never change** for the rest of the game.

### Policy deck
- 17 total policy tiles: 6 Liberal, 11 Fascist.
- Deck is shuffled at game start. When the draw pile runs out mid-round, reshuffle all discarded + enacted-but-returned tiles (enacted tiles stay on the board, only unenacted discards go back) and continue. Track `draw_pile_count` and `discard_pile_count`.

### Boards
- Liberal track: 5 policy slots.
- Fascist track: 6 policy slots, each slot has an associated executive power (varies by player count — see section 5).
- Election tracker: 0-3. Increments on every failed government vote, resets to 0 on any successful government.

---

## 2. Core phase loop

```
LOBBY
  → ROLE_REVEAL
    → [ROUND LOOP START]
      → NOMINATION
        → ELECTION_VOTE
          → (if passed) → LEGISLATIVE_PRESIDENT
            → LEGISLATIVE_CHANCELLOR
              → (if policy enacted) → POLICY_DEFENSE (optional speech)
                → CHECK_WIN_CONDITIONS
                  → (if power triggered) → EXECUTIVE_ACTION
                    → CHECK_WIN_CONDITIONS
                  → [ROUND LOOP: advance presidency, back to NOMINATION]
          → (if failed) → increment election tracker
            → (if tracker == 3) → CHAOS_POLICY → CHECK_WIN_CONDITIONS → [ROUND LOOP]
            → (else) → advance presidency → [ROUND LOOP]
    → GAME_END
```

### Phase details

**NOMINATION**
- Current President selects a Chancellor candidate from eligible players (see term limits below).
- President gives a nomination speech (this is a captured speech moment — see section 6).
- Transition: → ELECTION_VOTE once a candidate is selected.

**ELECTION_VOTE**
- All players vote Ja/Nein simultaneously (don't reveal votes until all are in, to avoid bandwagon bias — standard rule).
- No capture at this phase — see section 6 for why vote-moment capture was cut for v1.
- Pass condition: strict majority Ja (ties fail).
- Special rule: if this is the 3rd enacted Fascist policy or later has been reached AND the nominated Chancellor is confirmed to be Hitler AND this vote passes → **immediate Fascist win**, skip legislative phase entirely.
- Transition: pass → LEGISLATIVE_PRESIDENT. Fail → increment election tracker, check chaos, advance presidency.

**LEGISLATIVE_PRESIDENT**
- President draws top 3 policies from draw pile.
- President discards 1 face-down, passes remaining 2 to Chancellor.
- Transition: → LEGISLATIVE_CHANCELLOR.

**LEGISLATIVE_CHANCELLOR**
- Chancellor sees the 2 policies.
- If veto is unlocked (see section 4), Chancellor may propose a veto instead of enacting.
  - If proposed: President must accept or reject.
    - Accept → both policies discarded, counts as a failed government (election tracker +1), no policy enacted, no speech required. → advance presidency.
    - Reject → Chancellor must then enact one of the two policies as normal.
- Otherwise: Chancellor discards 1 face-down, enacts the other onto the appropriate board.
- Transition: → POLICY_DEFENSE.

**POLICY_DEFENSE**
- Chancellor optionally gives a short speech explaining/defending the enacted policy (especially expected if it was Fascist). Not a hard rule requirement in physical Secret Hitler, but **make it a required capture moment in this build** — prompt the Chancellor to say a line before continuing, since this is a primary Ledger data source.
- Transition: → CHECK_WIN_CONDITIONS.

**CHECK_WIN_CONDITIONS** (run after every policy enactment and every executive action)
- Liberal win: 5 Liberal policies enacted, OR Hitler is executed.
- Fascist win: 6 Fascist policies enacted, OR Hitler is elected Chancellor after the 3rd Fascist policy is on the board (see ELECTION_VOTE special rule).
- If no win: continue to EXECUTIVE_ACTION if a power was triggered by this policy slot, else advance presidency and loop.

**EXECUTIVE_ACTION** (triggered by specific Fascist policy slots — see section 5)
- President performs the power (investigate loyalty, call special election, policy peek, execution).
- Capture: if the power involves the President or target speaking (e.g., announcing an investigation result, or an about-to-be-executed player's last words), treat as a speech moment.
- Transition: → CHECK_WIN_CONDITIONS → advance presidency (unless special election overrides normal succession, see below) → loop.

**CHAOS_POLICY** (election tracker hits 3)
- Top policy of the draw pile is enacted automatically, no vote, no Chancellor discard.
- Election tracker resets to 0 regardless of policy type.
- Term limits reset to none for the next round (standard rule — prevents permanent gridlock).
- Transition: → CHECK_WIN_CONDITIONS → advance presidency → loop.

**GAME_END**
- Show final roles for all players.
- Trigger the full Ledger reveal (section 7).

---

## 3. Presidency succession & term limits

- Presidency normally passes clockwise (by seating/join order) after every round, regardless of whether the government passed or failed.
- Term limits: the most recent Chancellor is always term-limited (cannot be nominated next round). The most recent President is also term-limited **only in games of 7+ players**; in 5-6 player games only the Chancellor is term-limited.
- Term limits reset after a Chaos Policy (tracker hit 3).
- Special Election power (see section 5) overrides normal clockwise succession for exactly one round: the President-elect chosen by the power picks anyone (even themself is disallowed — must be someone else) to be the next President. After that one round, succession resumes clockwise from the player who *would have* been President if the special election hadn't happened (not from the special President) — this is a common rules gotcha, implement carefully.

---

## 4. Veto power

- Not a role or card — a **board state** that unlocks automatically.
- Unlock threshold by player count:
  - 5-6 players: veto never unlocks.
  - 7-8 players: unlocks once 5 Fascist policies are enacted.
  - 9-10 players: unlocks once 4 Fascist policies are enacted.
- Once unlocked, stays unlocked for the rest of the game.
- Mechanic: see LEGISLATIVE_CHANCELLOR phase above.
- Data to track: `veto_unlocked: bool`, `veto_attempts: [{round, proposed_by, president_response, outcome}]`.
- This is also a **Special Session trigger condition** (see section 7) the first time a veto is actually used (not just unlocked).

---

## 5. Executive powers by fascist policy slot

Powers differ by player count — implement as a lookup table keyed by `(player_count_bracket, fascist_policy_slot_number)`.

| Fascist slot | 5-6 players | 7-8 players | 9-10 players |
|---|---|---|---|
| 1 | — | — | Investigate Loyalty |
| 2 | — | Investigate Loyalty | Investigate Loyalty |
| 3 | Policy Peek | Special Election | Special Election |
| 4 | Execution | Execution | Execution |
| 5 | Execution | Execution | Execution |
| 6 | — | — | — |

- **Investigate Loyalty**: President secretly views one player's party membership (Liberal/Fascist — not "Hitler" specifically). Can only investigate each player once per game. No public reveal required, but the President may lie about what they saw (this is a great speech-capture moment — "announcing" the investigation result, true or false).
- **Policy Peek**: President privately views the top 3 policies in the draw pile without changing their order. No speech required, no public info.
- **Special Election**: President chooses any other player to be the next President (see succession override in section 3).
- **Execution**: President chooses a player to eliminate. That player is out for the rest of the game (no more votes, no more nominations) but role is NOT revealed unless it was Hitler. If the executed player was Hitler → immediate Liberal win.

---

## 6. Speech / signal capture moments

These are the deterministic triggers for sending clips to Interhuman. Because each is tied to a known phase transition, capture start/stop can be driven directly by the state machine — no manual detection needed.

| Event type | Phase | Speaker | Typical length | Required or optional |
|---|---|---|---|---|
| `nomination_speech` | NOMINATION | President | 15-45s | Required (prompt if skipped) |
| `acceptance_speech` | NOMINATION (after selection) | Chancellor candidate | 10-30s | Optional |
| `policy_defense` | POLICY_DEFENSE | Chancellor | 15-45s | Required |
| `investigation_announcement` | EXECUTIVE_ACTION (Investigate) | President | 10-30s | Optional |
| `last_words` | EXECUTIVE_ACTION (Execution), before elimination | Target player | 10-20s | Optional |

Note: `vote_moment` capture (a clip at the second of casting each Ja/Nein vote) was considered but cut for v1 — highest friction (every single vote, every player, every round) for the lowest signal value. Every player already produces plenty of capture data via nomination and policy-defense speeches; revisit vote-moment capture only if trajectory data feels too sparse after playtesting.

Each captured clip → `speech_events` row → sent to Interhuman → `signal_scores` row → rolled into that player's `trust_trajectory`.

---

## 7. The Ledger & Special Sessions

### Passive tracking
- Every `speech_events` capture updates the speaking player's `trust_trajectory`: a rolling summary of confidence/stress/skepticism/hesitation trend across all their speech events so far this game.
- Nothing is shown to any player during normal play except the ambient tension indicator (a non-specific, low-info UI element — does not name players or scores).

### Special Session triggers (final: three triggers for launch)
1. **3rd Fascist policy enacted** — classic "Hitler can now win via Chancellor" threshold. Fires automatically the moment the 3rd Fascist tile is enacted, before the next round's nomination begins.
2. **An Execution is about to happen** — fires automatically once the President has selected their execution target (Presidential Power, slot varies by player count per section 5), triggered *before* the target is actually eliminated so they're still in government/alive for the readout and can still speak (ties into `last_words` capture, if used).
3. **Player-called Special Session (group vote, once per game)** — any player can propose calling a Special Session at any point during discussion. Requires a majority Ja vote from the table (same threshold as an election vote) to actually trigger. This is a **shared, game-wide resource capped at one use per game total** (not one per player) — once spent, option 3 is no longer available for the rest of that game, but triggers 1 and 2 still fire normally if/when their conditions are met.

Note: triggers 1 and 2 are automatic and can each only fire once per game (there's only one 3rd-Fascist-policy moment, and each Execution is its own instance — if there are multiple Executions across the game, e.g. slots 4 and 5 in a 7-10 player game, each one independently qualifies, so this trigger could fire twice). Trigger 3 fires at most once total. Realistic range: 2-4 Special Sessions per game.

### Special Session sequence
1. Game state pauses (`SPECIAL_SESSION` phase inserted into the loop, blocks normal progression until dismissed).
2. Backend pulls `trust_trajectory` for exactly the two players currently in government (President + Chancellor) — never more than two.
3. Backend generates a short descriptive readout per player using **templated strings** (see section 7a below) — no LLM call, fully deterministic and demo-safe.
4. Readout pushed to all clients simultaneously (websocket broadcast) as a full-screen reveal, presented as **The Registrar's findings**.
5. Table discusses as long as they want, then a "continue" action from the President resumes the paused phase.
6. Log the session in `special_sessions` (round, trigger reason, the two players, generated text) — this feeds the end-game recap.

### 7a. Templated readout generation (The Registrar's voice)

Goal: turn raw trend data into a short, cryptic-but-specific paragraph per player, with zero LLM calls — fully deterministic, so it can't say anything embarrassing or off-tone live.

**Step 1 — compute inputs per player, per signal.** For each of the 4 tracked signals (confidence, stress, skepticism, hesitation), compute two things from that player's `signal_scores` history so far:
- `direction`: rising / falling / flat (compare average of their last 2 speech events to their average of all earlier ones; flat if the delta is within a small threshold, e.g. ±10%)
- `magnitude`: how big the swing is — bucket into `slight` / `notable` / `sharp` based on delta size (pick thresholds during playtesting, e.g. slight <15%, notable 15-35%, sharp >35%)

If a player has fewer than 2 speech events total, skip trend language for them entirely and use a "not enough data yet" fallback line instead (this will legitimately happen for a Chancellor nominated for the first time).

**Step 2 — pick the single most notable signal per player.** Don't report all 4 signals every time (too busy, dilutes the effect) — rank by magnitude and take the top 1, tie-break by a fixed priority order, e.g. `skepticism > stress > confidence > hesitation` (skepticism and stress read as the most "damning" and make for better drama; confidence/hesitation are more neutral).

**Step 3 — fill a template.** One sentence structure per (signal, direction) pair, each with 2-3 phrasing variants to rotate through (avoid repeating the exact same sentence twice in one game — track which variant was last used per signal+direction combo and skip it next time). Example bank:

```
skepticism, rising:
  - "The Registrar notes a growing skepticism in {name}'s recent remarks."
  - "{name}'s tone has turned notably more doubtful since their last turn at the podium."
stress, rising:
  - "{name}'s composure has visibly thinned across their recent statements."
  - "The Registrar records a marked increase in strain in {name}'s delivery."
confidence, falling:
  - "{name} spoke with far less certainty than in previous sessions."
  - "A noticeable dip in conviction, according to the Registrar's notes on {name}."
hesitation, rising:
  - "{name} has grown measurably slower to commit to their words."
confidence, rising:
  - "{name} has grown steadily more assured with each address."
skepticism, falling / stress, falling / hesitation, falling:
  - (mirror the "rising" set with inverse phrasing, e.g. "eased," "settled," "steadied")
flat / not enough data:
  - "The Registrar has not yet gathered enough on {name} to report a trend."
```

Optionally prepend a magnitude qualifier for `sharp` swings only, to make the biggest moments hit harder: "sharply," "markedly," "a stark shift —" prefixed onto the sentence. Leave `slight`/`notable` swings unqualified so the sharp ones stand out.

**Step 4 — assemble the full readout.** Two sentences total (one per player in government), presented side by side under a shared header like "The Registrar's Findings — Round {n}." No verdict line, no "this player is fascist" — just the two sentences and a beat of silence before returning control to the table.

**Why templated over LLM here:** fully deterministic means no risk of an inappropriate or nonsensical line live in front of a group; trivially fast (no API latency mid-game); and the variant rotation is enough to avoid feeling repetitive across a single game (you'll realistically generate a Special Session readout 2-4 times per game per the trigger list above, so you don't need dozens of variants — 2-3 per direction is plenty). Revisit an LLM-based version later only if templated readouts feel stale across many repeated playtests.

### End-game recap
- After GAME_END, show the full `trust_trajectory` history for every player as a simple line/area chart per signal, alongside actual roles.
- This is the payoff moment — first time the *complete* picture is shown, contrasted against what was revealed piecemeal in Special Sessions.

---

## 8. Data model (reference)

```
games
  id, code, phase, round_number, player_count,
  president_id, chancellor_id, previous_chancellor_id, previous_president_id,
  election_tracker (0-3), liberal_policies_enacted, fascist_policies_enacted,
  veto_unlocked (bool), draw_pile, discard_pile, status

players
  id, game_id, name, role (liberal/fascist/hitler), seat_order,
  is_alive (bool), device_session_id

votes
  id, game_id, round_number, player_id, choice (ja/nein), cast_at

speech_events
  id, game_id, player_id, round_number, event_type, clip_url_or_ref, captured_at

signal_scores
  id, speech_event_id, confidence, stress, skepticism, hesitation, raw_response_json

trust_trajectory
  player_id, game_id, signal_name, trend_direction, trend_magnitude, last_updated
  (or computed on-the-fly from signal_scores if you don't want a separate rollup table for v1)

special_sessions
  id, game_id, round_number, trigger_reason (policy_threshold/execution/player_called), president_id, chancellor_id, generated_readout_text, created_at

special_session_call_votes
  id, game_id, proposed_by, round_number, votes (per-player ja/nein), outcome, resolved_at
  -- only relevant if trigger_reason = player_called; game_id has at most one row here where outcome = passed,
  -- since this resource is spent game-wide, not per-player

executive_actions
  id, game_id, round_number, power_type, actor_id, target_id, result_json
```

---

## 9. Build order recommendation

1. Implement sections 1-5 (full rules engine) with **no AI, no video** — playable end to end by humans via simple buttons/text, verify all win conditions and edge cases (special election succession override, chaos policy term-limit reset, veto interaction with election tracker) with test playthroughs.
2. Wire in section 6 (capture triggers) — just start/stop recording hooks tied to phase transitions, no analysis yet.
3. Wire in the Interhuman proxy + `signal_scores` storage (reuse Signal Game / Moonrise proxy pattern).
4. Add `trust_trajectory` rollup logic.
5. Add section 7 (Special Sessions) last, once trajectory data is confirmed flowing correctly across a few full test games.
6. Add end-game recap visualization.

---

## 10. Decisions (resolved)

- **Dealing**: app manages the full policy deck, role assignment, and board state — fully digital, matching Moonrise's approach. Not a companion to a physical game.
- **`vote_moment` capture**: cut for v1. See section 6 note for rationale.
- **Readout generation**: templated, not LLM-based. Full logic in section 7a.
- **Special Session triggers**: finalized as 3rd Fascist policy, each Execution, and one player-called group vote (shared, game-wide, one-time resource). Realistic range is 2-4 Special Sessions per game — worth confirming after a few test games that this doesn't feel too frequent, especially in games with two Executions.
- **Failed player-called vote**: does NOT spend the one-time resource — only a successful (passed) call spends it, so the table can retry later after gathering more support.
