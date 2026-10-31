# Data sources

Checked live on 2026-10-31. On GitHub Actions a full refresh takes about 4–6 minutes and ~2,300 requests. Each refresh
records what worked in the snapshot's `sources` list, and the app footer shows it.
Real captured responses are kept in `tests/fixtures/live-*.json` and tested.

| Source | What it gives | Status (live check 2026-10-31) |
|---|---|---|
| Ryanair fare finder | One-way fares + times, every route from/to the 8 home airports, 60 days (whole months) | ✓ works: 8,312 fares, 0 errors |
| Kiwi.com search | All airlines incl. combinations of different airlines (self-transfer): out from each home airport to anywhere, home from the 20 cheapest destination regions (e.g. London + Birmingham) | ✓ works: 13,857 itineraries. **Kiwi sells nothing to or from Russia** (0 results, also via Istanbul/Belgrade/Yerevan) |
| Wizz Air timetable | Daily cheapest fare per route (BTS, FMM, NUE …), departure times; arrival estimated from distance | ✓ works: 2,410 fares |
| Hostelworld city pages | Cheapest bed per city (page title), ~80 cities | ✓ works. Some lead prices under €3 look like display errors |
| trivago (MCP for AI assistants) | Cheapest hotels/hostels/apartments per city for the next 2 weekends (≤ €80/night) | ✓ works: 30 cities |
| Flixbus (airport buses) | Salzburg ↔ MUC / VIE / BTS / FMM airports, Linz | ✓ works: 2,079 departures |
| Flixbus (trips) | Salzburg ↔ 88 cities, weekends of the next 3 weeks | ✓ works: 5,071 departures |
| OSRM (OpenStreetMap) | Drive minutes + km to car parks and to 116 cities | ✓ works |
| E-Control Spritpreisrechner | Current Super 95 price near home | ✓ works (€1.788/l on 31 Oct) |
| Deutsche Bahn | Live train prices | ✗ bahn.de refuses server requests (HTTP 403); typical train prices are used instead |
| ÖBB | Live train prices | ✗ refuses server requests (HTTP 403); typical train prices are used instead |
| Static: trains | Typical timetables + prices Salzburg ↔ 20 cities, card coverage | estimates, marked ≈ |
| Static: driving | Tolls/vignettes and city parking (rough for discovered cities) | estimates, marked ≈ |
| Walking / bike / bike sharing | From coordinates | estimates |
| BlaBlaCar | Search links only (no open API) | link |

## Known gaps and how to close them

- **Russia:** no source the app can use sells tickets to Russia (EU airspace closed to
  Russian airlines, EU airlines don't fly there, Kiwi.com and Ryanair exclude it). Aviasales
  (Travelpayouts) still lists Russia routes but needs a free API token.
- **Kiwi returns at most 50 offers per search**, so very long tails (the 51st cheapest) can be missing.
- **Train prices are typical, not live.** ÖBB and DB fare APIs are not public;
  Sparschiene/Sparpreis vary daily. Cards are applied exactly; base fares are ≈.
- **Ryanair's per-day calendar shows only the cheapest flight per day and route.**
  For the next 10 days the refresh also asks for afternoon/evening departures
  separately, so Friday-evening flights are not missed.
- **Terms of use:** these are the same requests a person's browser makes on the
  airlines' sites. The refresh stays polite: a hard request budget, at most 5
  requests in parallel per website, caching, and no booking automation. If a site starts refusing,
  that source is marked failed and the app keeps working with the rest.
