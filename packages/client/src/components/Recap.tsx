import { SIGNAL_KEYS, type PlayerRecapEntry, type SignalKey, type SignalSeriesPoint } from "@interhuman/shared";

// Section 9 step 6: the end-game recap. Damning-tier signals (skepticism,
// stress -- section 7a's own split) get warmer colors, neutral-tier
// (confidence, hesitation) get cooler ones, so the chart reads at a glance
// even before you check the legend.
const SIGNAL_COLORS: Record<SignalKey, string> = {
  stress: "#e05a4e",
  skepticism: "#e8674a",
  confidence: "#4caf7d",
  hesitation: "#7d9be8",
};

function RecapChart({ points }: { points: SignalSeriesPoint[] }) {
  const width = 260;
  const height = 90;
  const pad = 6;
  const n = points.length;
  const x = (i: number) => pad + (n === 1 ? 0 : (i / (n - 1)) * (width - pad * 2));
  const y = (v: number) => height - pad - v * (height - pad * 2);

  return (
    <div className="recap-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="recap-chart" preserveAspectRatio="none">
        {SIGNAL_KEYS.map((key) => {
          const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p[key])}`).join(" ");
          return <path key={key} d={d} fill="none" stroke={SIGNAL_COLORS[key]} strokeWidth={2} />;
        })}
      </svg>
      <div className="recap-legend">
        {SIGNAL_KEYS.map((key) => (
          <span key={key} className="recap-legend-item">
            <span className="recap-swatch" style={{ background: SIGNAL_COLORS[key] }} />
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}

function PlayerRecapCard({ entry }: { entry: PlayerRecapEntry }) {
  return (
    <div className="recap-card">
      <div className="recap-card-header">
        <span className="recap-name">{entry.name}</span>
        <span className={`role-badge small ${entry.role}`}>{entry.role}</span>
      </div>
      {entry.points.length < 2 ? (
        <p className="hint">The Registrar's notes on {entry.name} were too thin to chart.</p>
      ) : (
        <RecapChart points={entry.points} />
      )}
    </div>
  );
}

/**
 * The payoff moment (section 9 step 6): the complete signal history for
 * every player, all at once, next to their actual role -- contrasted
 * against what was only ever revealed two sentences at a time during
 * Special Sessions.
 */
export function GameRecapSection({ recap }: { recap: { players: PlayerRecapEntry[] } }) {
  return (
    <div className="recap-section">
      <h3>The Full Ledger</h3>
      <p className="hint">Every signal reading, for every player, across the whole game.</p>
      <div className="recap-grid">
        {recap.players.map((entry) => (
          <PlayerRecapCard key={entry.playerId} entry={entry} />
        ))}
      </div>
    </div>
  );
}
