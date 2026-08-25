import { useRef, useState } from "react";

interface Page {
  title: string;
  body: string[];
}

const PAGES: Page[] = [
  {
    title: "The Premise",
    body: [
      "5-10 players, secretly split into two teams: Liberals and Fascists. One Fascist is secretly Hitler.",
      "Everyone sits around a shared table, taking turns as President and Chancellor, enacting policies that push the game toward one side's victory.",
      "You don't know who's who -- only what people say and how they vote.",
    ],
  },
  {
    title: "The Roles",
    body: [
      "Liberals: the majority. They know nothing except their own role -- they have to read the table.",
      "Fascists: always know each other, and know who Hitler is.",
      "Hitler: in 5-6 player games, Hitler also knows the fascist team. In 7+ player games, Hitler knows no one -- and no one (except fellow fascists) knows Hitler.",
      "Roles are assigned once at the start and never change.",
    ],
  },
  {
    title: "A Round",
    body: [
      "Nomination -- the President nominates anyone as Chancellor.",
      "Election -- everyone votes Ja or Nein. Majority Ja seats the government; a tie or majority Nein fails it (3 failed elections in a row force through a random policy).",
      "Legislative session -- the President privately sees 3 policies and discards 1; the Chancellor sees the remaining 2 and enacts 1.",
      "Enacting a Fascist policy sometimes unlocks a one-time Presidential power (investigate a player, peek at policies, force a special election, or execute someone) before the next round begins.",
    ],
  },
  {
    title: "Winning",
    body: [
      "Liberals win by enacting 5 Liberal policies, or by executing Hitler.",
      "Fascists win by enacting 6 Fascist policies, or by getting Hitler elected Chancellor once 3+ Fascist policies are already on the board.",
    ],
  },
  {
    title: "The Registrar",
    body: [
      "This build has a twist: at key moments (nominating, defending a policy, last words before execution), you may be prompted to speak on camera.",
      "An AI -- The Registrar -- quietly reads behavioral signals from what you say, building a private trust trajectory on each player.",
      "It stays silent during normal play -- you'll only ever see a vague, table-wide \"mood\" indicator.",
      "Occasionally, a Special Session pauses the game and The Registrar reveals two findings about the sitting President and Chancellor. That's the only place any of this ever surfaces.",
    ],
  },
];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const goTo = (i: number) => setPage(Math.max(0, Math.min(PAGES.length - 1, i)));

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return; // too small to count as a swipe
    if (delta < 0) goTo(page + 1); // swiped left -> next page
    else goTo(page - 1); // swiped right -> previous page
  }

  const isLast = page === PAGES.length - 1;
  const current = PAGES[page];

  return (
    <div className="rules-overlay" role="dialog" aria-label="How to Play">
      <div className="rules-card" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button className="link rules-close" onClick={onClose} aria-label="Close">
          Close ✕
        </button>

        <div className="rules-page">
          <h2>{current.title}</h2>
          <ul>
            {current.body.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="rules-nav">
          <button className="secondary" onClick={() => goTo(page - 1)} disabled={page === 0}>
            ← Back
          </button>
          <div className="rules-dots">
            {PAGES.map((_, i) => (
              <button
                key={i}
                className={`rules-dot ${i === page ? "active" : ""}`}
                onClick={() => goTo(i)}
                aria-label={`Go to page ${i + 1}`}
              />
            ))}
          </div>
          {isLast ? (
            <button onClick={onClose}>Got it</button>
          ) : (
            <button className="secondary" onClick={() => goTo(page + 1)}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
