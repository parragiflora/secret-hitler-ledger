// Section 7: glues a room's speechEvents + signalScores into the two
// government players' readouts. Unlike Interhuman analysis, this is pure/
// synchronous (computePlayerTrustTrajectory and generateSessionReadouts do
// no I/O), so it's generated in one shot the moment a Special Session opens
// -- no async round-trip, no separate "readout ready" event needed.
import { generateSessionReadouts, type PendingSpecialSession } from "@interhuman/shared";
import type { Room } from "./rooms.js";
import { computePlayerTrustTrajectory } from "./trustTrajectory.js";

export function generateSpecialSessionReadouts(
  room: Room,
  pending: PendingSpecialSession,
): { presidentReadout: string; chancellorReadout: string } {
  const president = room.state.players.find((p) => p.id === pending.presidentId);
  const chancellor = room.state.players.find((p) => p.id === pending.chancellorId);
  const presidentName = president?.name ?? "The President";
  const chancellorName = chancellor?.name ?? "The Chancellor";

  const presidentTrajectory = computePlayerTrustTrajectory(room.state.speechEvents, room.signalScores, pending.presidentId);
  const chancellorTrajectory = computePlayerTrustTrajectory(room.state.speechEvents, room.signalScores, pending.chancellorId);

  const result = generateSessionReadouts(
    presidentName,
    presidentTrajectory,
    chancellorName,
    chancellorTrajectory,
    room.readoutVariantHistory,
  );
  room.readoutVariantHistory = result.updatedHistory;

  room.specialSessions.push({
    id: `ss_${room.code}_${pending.roundNumber}_${room.specialSessions.length}`,
    roundNumber: pending.roundNumber,
    triggerReason: pending.triggerReason,
    presidentId: pending.presidentId,
    chancellorId: pending.chancellorId,
    presidentReadout: result.presidentText,
    chancellorReadout: result.chancellorText,
    createdAt: new Date().toISOString(),
  });

  return { presidentReadout: result.presidentText, chancellorReadout: result.chancellorText };
}
