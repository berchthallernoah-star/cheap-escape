// Prices a fare for a specific group of travellers, applying their cards.
// A "fare" is a list of parts; each part is either per person or a group ticket.

/**
 * @typedef {{ name: string, cards: string[] }} Traveler
 * @typedef {{ eur?: number, kind?: 'bayern', first?: number, extra?: number, max?: number,
 *             coveredBy?: string[], discounts?: Record<string, number> }} FarePart
 */

function hasAny(traveler, cards) {
  return (cards || []).some((c) => traveler.cards.includes(c));
}

/**
 * @param {FarePart[]} fare
 * @param {Traveler[]} travelers
 * @returns {{ eur: number, free: string[], notes: string[] }}
 */
export function priceFare(fare, travelers) {
  let eur = 0;
  const free = new Set();
  const notes = [];
  for (const part of fare) {
    const payers = travelers.filter((t) => !hasAny(t, part.coveredBy));
    for (const t of travelers) if (hasAny(t, part.coveredBy)) free.add(t.name);
    if (part.kind === 'bayern') {
      const n = payers.length;
      if (n > 0) {
        const tickets = Math.ceil(n / part.max);
        let cost = 0;
        let left = n;
        for (let i = 0; i < tickets; i++) {
          const k = Math.min(left, part.max);
          cost += part.first + part.extra * (k - 1);
          left -= k;
        }
        eur += cost;
        notes.push(`Bayern-Ticket für ${n}`);
      }
    } else {
      for (const t of payers) {
        let mult = 1;
        for (const [card, m] of Object.entries(part.discounts || {})) {
          if (t.cards.includes(card)) mult = Math.min(mult, m);
        }
        eur += (part.eur || 0) * mult;
      }
    }
  }
  // A traveler is only "free" if no part charged them.
  const charged = new Set();
  for (const part of fare) {
    for (const t of travelers) if (!hasAny(t, part.coveredBy) && ((part.eur || 0) > 0 || part.kind === 'bayern')) charged.add(t.name);
  }
  const fullyFree = [...free].filter((n) => !charged.has(n));
  return { eur: round2(eur), free: fullyFree, notes };
}

/** Parking cost for `minutes` with { perDay, weekCap? } (per started 24h). */
export function parkingCost(tariff, minutes) {
  const days = Math.max(1, Math.ceil(minutes / 1440));
  if (!tariff.weekCap) return round2(days * tariff.perDay);
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  return round2(weeks * tariff.weekCap + Math.min(rest * tariff.perDay, tariff.weekCap));
}

export function fuelCost(km, car) {
  return round2((km * car.litresPer100km * car.fuelEurPerLitre) / 100);
}

export function round2(x) {
  return Math.round(x * 100) / 100;
}
