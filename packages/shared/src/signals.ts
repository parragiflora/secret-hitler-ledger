// The 4 signals this build tracks end-to-end (section 7a). Interhuman's API
// actually detects 13 signal types; these 4 were chosen deliberately for the
// Registrar's readouts (terse, and split into a "damning" tier -- skepticism/
// stress -- vs a more neutral tier -- confidence/hesitation). See
// packages/server/src/interhuman.ts for the full picked-vs-discarded list.
export const SIGNAL_KEYS = ["confidence", "stress", "skepticism", "hesitation"] as const;
export type SignalKey = (typeof SIGNAL_KEYS)[number];
