// US Trucking Carrier Finder: Apify Actor entry point.
//
// 1. Read the input (where, cargo, fleet size, filters).
// 2. Search the FMCSA company census for matching active carriers.
// 3. Add operating authority, insurance, inspections, crashes and
//    out-of-service orders from the other FMCSA datasets.
// 4. Drop what fails the filters and push one row per carrier, charging the
//    "company" pay-per-event event.

import { pathToFileURL } from 'node:url';
import { Actor, log } from 'apify';
import { CARGO_IDS } from './cargo.js';
import { US_STATES, mayBePersonName, nameKey } from './normalize.js';
import { zipCentroid, isKnownZip, distanceMiles, statesWithinRadius } from './geo.js';
import { mapPool } from './http.js';
import {
    censusWhere, searchCensus, countCensus, mapCensus, monthsAgo,
    fetchAuthority, fetchSms, fetchCrashes, fetchOosOrders,
    applyAuthority, applySms, applyCrashes, applyOos, SOURCE,
} from './sources/fmcsa.js';

export const CHARGE_EVENT = 'company';
export const OPERATION_TYPES = ['for_hire', 'private', 'any'];
export const SORTS = ['fleet_size', 'distance', 'newest', 'oldest', 'safest'];
const ENRICH_BATCH = 200;

/** When Apify will stop the run, minus a margin for saving. Null locally. */
export function runDeadline(env = process.env, marginMs = 60_000) {
    const at = Date.parse(env.ACTOR_TIMEOUT_AT ?? env.APIFY_TIMEOUT_AT ?? '');
    return Number.isFinite(at) ? at - marginMs : null;
}

const clampInt = (v, def, lo, hi) => {
    if (v === null || v === undefined || v === '') return def;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(Math.round(n), hi)) : def;
};

/** Validates and fills defaults. Throws a plain-language message on bad input. */
export function parseInput(raw = {}) {
    const states = [...new Set((raw.states ?? (raw.zipCode ? [] : ['OH'])).map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
    const badStates = states.filter((s) => !US_STATES[s]);
    if (badStates.length) throw new Error(`Unknown state code: ${badStates.join(', ')}. Use two-letter codes such as OH.`);

    const zipCode = raw.zipCode ? String(raw.zipCode).trim().slice(0, 5) : null;
    if (zipCode && !isKnownZip(zipCode)) throw new Error(`ZIP code ${zipCode} was not found. Use a 5-digit US ZIP code.`);
    const radiusMiles = Number(raw.radiusMiles ?? 50);
    if (zipCode && !(radiusMiles > 0 && radiusMiles <= 500)) throw new Error('Radius must be between 1 and 500 miles.');
    if (!zipCode && !states.length) throw new Error('Pick at least one state, or a ZIP code and radius.');

    const cargoTypes = [...new Set((raw.cargoTypes ?? ['refrigerated_food']).filter(Boolean))];
    const badCargo = cargoTypes.filter((c) => !CARGO_IDS.includes(c));
    if (badCargo.length) throw new Error(`Unknown cargo type: ${badCargo.join(', ')}. Use one of ${CARGO_IDS.join(', ')}.`);

    const operationType = raw.operationType ?? 'for_hire';
    if (!OPERATION_TYPES.includes(operationType)) throw new Error(`Operation type must be one of ${OPERATION_TYPES.join(', ')}.`);
    const sortBy = raw.sortBy ?? 'fleet_size';
    if (!SORTS.includes(sortBy)) throw new Error(`Sort must be one of ${SORTS.join(', ')}.`);
    if (sortBy === 'distance' && !zipCode) throw new Error('Sorting by distance needs a ZIP code.');

    const minPowerUnits = clampInt(raw.minPowerUnits, 1, 0, 100_000);
    const maxPowerUnits = clampInt(raw.maxPowerUnits, null, 0, 100_000);
    if (maxPowerUnits != null && maxPowerUnits < minPowerUnits) throw new Error('Maximum trucks must be at least the minimum.');
    const minYears = clampInt(raw.minYearsInBusiness, 0, 0, 100);
    const maxYears = clampInt(raw.maxYearsInBusiness, null, 0, 100);
    if (maxYears != null && maxYears < minYears) throw new Error('Maximum years registered must be at least the minimum.');
    const maxOos = raw.maxVehicleOosRate == null || raw.maxVehicleOosRate === '' ? null : Number(raw.maxVehicleOosRate);
    if (maxOos != null && !(maxOos >= 0 && maxOos <= 100)) throw new Error('Maximum vehicle out-of-service rate must be between 0 and 100.');

    return {
        states,
        zipCode,
        radiusMiles,
        cargoTypes,
        operationType,
        requireActiveAuthority: raw.requireActiveAuthority !== false,
        minPowerUnits,
        maxPowerUnits,
        hazmatOnly: raw.hazmatOnly === true,
        interstateOnly: raw.interstateOnly === true,
        updatedWithinMonths: clampInt(raw.updatedWithinMonths, 24, 0, 600),
        minYearsInBusiness: minYears,
        maxYearsInBusiness: maxYears,
        includeSafetyData: raw.includeSafetyData !== false,
        excludeUnsafe: raw.excludeUnsafe !== false,
        maxVehicleOosRate: maxOos,
        requirePhone: raw.requirePhone === true,
        requireEmail: raw.requireEmail === true,
        sortBy,
        maxResults: clampInt(raw.maxResults, 500, 1, 200_000),
        socrataAppToken: raw.socrataAppToken ? String(raw.socrataAppToken).trim() : null,
    };
}

/** Location test for an input: rec => boolean (and sets rec.distance_miles for ZIP searches). */
export function locationFilter(input) {
    if (input.zipCode) {
        const centre = zipCentroid(input.zipCode);
        return {
            centre,
            test: (rec) => {
                const p = zipCentroid(rec.zip);
                if (!p) return false;
                const d = distanceMiles(centre, p);
                rec.distance_miles = Math.round(d * 10) / 10;
                return d <= input.radiusMiles;
            },
        };
    }
    const set = new Set(input.states);
    return { centre: null, test: (rec) => set.has(rec.state) };
}

/** Filters that need the enrichment data. Returns the reason a carrier is dropped, or null. */
export function rejectReason(rec, input) {
    if (input.operationType === 'for_hire' && input.requireActiveAuthority && rec.authority_status !== 'active') return 'no_active_authority';
    if (input.excludeUnsafe) {
        if (rec.out_of_service_order) return 'out_of_service_order';
        if (rec.safety_rating === 'unsatisfactory') return 'unsatisfactory_rating';
    }
    if (input.maxVehicleOosRate != null && rec.vehicle_oos_rate_pct != null && rec.vehicle_inspections_24mo >= 3
        && rec.vehicle_oos_rate_pct > input.maxVehicleOosRate) return 'vehicle_oos_rate';
    if (input.requirePhone && !rec.phone) return 'no_phone';
    if (input.requireEmail && !rec.email) return 'no_email';
    return null;
}

/** A rough 0-100 safety score for sorting: fewer OOS, crashes and alerts is better. */
export function safetyScore(r) {
    let s = 100;
    if (r.safety_rating === 'conditional') s -= 25;
    if (r.safety_rating === 'unsatisfactory') s -= 60;
    if (r.out_of_service_order) s -= 80;
    s -= (r.safety_alerts?.length ?? 0) * 10;
    if (r.vehicle_oos_rate_pct != null && r.vehicle_inspections_24mo >= 3) s -= Math.max(0, r.vehicle_oos_rate_pct - 22) * 0.8;
    if (r.driver_oos_rate_pct != null && r.driver_inspections_24mo >= 3) s -= Math.max(0, r.driver_oos_rate_pct - 6) * 1.2;
    const units = Math.max(1, r.power_units ?? 1);
    // Crashes and deaths per truck, so big fleets are not punished for size.
    s -= Math.min(30, Math.max(0, (r.crashes_24mo ?? 0) / units - 0.05) * 150);
    s -= Math.min(15, ((r.crash_fatalities_24mo ?? 0) / units) * 1000);
    return Math.max(0, Math.round(s));
}

const byName = (a, b) => (a.company_name ?? '').localeCompare(b.company_name ?? '');
const SORTERS = {
    fleet_size: (a, b) => (b.power_units ?? 0) - (a.power_units ?? 0) || (b.drivers ?? 0) - (a.drivers ?? 0) || byName(a, b),
    distance: (a, b) => (a.distance_miles ?? 1e9) - (b.distance_miles ?? 1e9) || (b.power_units ?? 0) - (a.power_units ?? 0),
    newest: (a, b) => (b.registered_date ?? '').localeCompare(a.registered_date ?? '') || byName(a, b),
    oldest: (a, b) => (a.registered_date ?? '9').localeCompare(b.registered_date ?? '9') || byName(a, b),
    safest: (a, b) => (b.power_units ?? 0) - (a.power_units ?? 0), // re-sorted after enrichment
};

/** Final output row with a fixed field order and no internal fields. */
export function toOutputRow(rec) {
    const out = {};
    for (const [k, v] of Object.entries(rec)) if (!k.startsWith('_')) out[k] = v;
    out.distance_miles = rec.distance_miles ?? null;
    out.safety_score = safetyScore(rec);
    out.source = SOURCE;
    return out;
}

/** Drops person-only names and duplicate registrations (same name and phone). */
export class CarrierSet {
    constructor() {
        this.rows = [];
        this.dots = new Set();
        this.namePhone = new Set();
    }

    add(rec) {
        if (!rec.company_name || mayBePersonName(rec.company_name)) return 'person_name';
        if (this.dots.has(rec.usdot_number)) return 'duplicate';
        const np = rec._phoneDigits ? `${nameKey(rec.company_name)}|${rec._phoneDigits}` : null;
        if (np && this.namePhone.has(np)) return 'duplicate';
        if (rec.dba_name && mayBePersonName(rec.dba_name)) rec.dba_name = null;
        this.dots.add(rec.usdot_number);
        if (np) this.namePhone.add(np);
        this.rows.push(rec);
        return 'added';
    }
}

export async function enrichBatch(batch, input, { log: logger, token, sinceCrash }) {
    const dots = batch.map((r) => r.usdot_number);
    const opts = { log: logger, token };
    const [auth, sms, crashes, oos] = await Promise.all([
        fetchAuthority(dots, opts),
        input.includeSafetyData ? fetchSms(dots, opts) : null,
        input.includeSafetyData ? fetchCrashes(dots, sinceCrash, opts) : null,
        input.includeSafetyData || input.excludeUnsafe ? fetchOosOrders(dots, opts) : null,
    ]);
    for (const r of batch) {
        if (auth) applyAuthority(r, auth.get(r.usdot_number));
        if (sms) applySms(r, sms.get(r.usdot_number));
        if (crashes) applyCrashes(r, crashes.get(r.usdot_number));
        if (oos) applyOos(r, oos.get(r.usdot_number));
    }
}

export async function collect(input, { log: logger = log, deadline = runDeadline(), now = new Date() } = {}) {
    const outOfTime = () => deadline != null && Date.now() > deadline;
    const scrapedAt = now.toISOString();
    const where = locationFilter(input);
    const searchStates = input.zipCode ? statesWithinRadius(where.centre, input.radiusMiles) : input.states;
    const soql = censusWhere(input, searchStates, now);
    const token = input.socrataAppToken;
    const stats = {
        census_matches: null, census_pages: 0, outside_radius: 0, person_names_dropped: 0, duplicates: 0,
        enriched: 0, dropped: {}, errors: 0, last_error: null, stopped_early_for_time: false,
    };

    try {
        stats.census_matches = await countCensus(soql, { log: logger, token });
        logger.info(`FMCSA census: ${stats.census_matches} active registrations match in ${searchStates.join(', ')}`);
    } catch (err) {
        logger.warning(`Count failed: ${err.message}`);
    }

    // The census comes back biggest fleets first. When sorting by fleet size we
    // can stop once there are plenty of candidates; other sorts need them all.
    const set = new CarrierSet();
    const enough = input.sortBy === 'fleet_size' ? input.maxResults * 3 + 2000 : 400_000;
    const { pages } = await searchCensus(soql, {
        log: logger,
        token,
        shouldStop: outOfTime,
        onPage: (rows) => {
            for (const raw of rows) {
                const rec = mapCensus(raw, scrapedAt);
                if (!where.test(rec)) { stats.outside_radius++; continue; }
                const res = set.add(rec);
                if (res === 'person_name') stats.person_names_dropped++;
                if (res === 'duplicate') stats.duplicates++;
            }
            return set.rows.length >= enough;
        },
    });
    stats.census_pages = pages;

    const candidates = set.rows.sort(SORTERS[input.sortBy]);
    logger.info(`${candidates.length} candidate carriers after location and name checks; adding authority and safety data`);

    // Enrich in batches, in sort order, until enough carriers pass the filters.
    const sinceCrash = monthsAgo(24, now);
    const kept = [];
    const batches = [];
    for (let i = 0; i < candidates.length; i += ENRICH_BATCH) batches.push(candidates.slice(i, i + ENRICH_BATCH));
    const needAll = input.sortBy === 'safest';
    let next = 0;
    const done = new Array(batches.length).fill(false);
    const keptCount = () => kept.length;
    await mapPool(batches.map((b, i) => i), 3, async (i) => {
        if (!needAll && keptCount() >= input.maxResults) return;
        if (outOfTime()) { stats.stopped_early_for_time = true; return; }
        try {
            await enrichBatch(batches[i], input, { log: logger, token, sinceCrash });
            done[i] = true;
            stats.enriched += batches[i].length;
            // Keep results in sort order: only move finished batches that follow the last kept one.
            while (next < batches.length && done[next]) {
                for (const r of batches[next]) {
                    const why = rejectReason(r, input);
                    if (why) stats.dropped[why] = (stats.dropped[why] ?? 0) + 1;
                    else kept.push(r);
                }
                next++;
            }
        } catch (err) {
            stats.errors++;
            stats.last_error = err.message;
            logger.warning(`Enrichment batch failed: ${err.message}`);
            done[i] = true; // skip it rather than stall the ones after it
            batches[i] = [];
            while (next < batches.length && done[next]) {
                for (const r of batches[next]) if (!rejectReason(r, input)) kept.push(r);
                next++;
            }
        }
    });
    if (stats.stopped_early_for_time) logger.warning('Ran out of time before checking every carrier. Raise the run timeout to get everything.');

    let rows = kept.map(toOutputRow);
    if (input.sortBy === 'safest') rows.sort((a, b) => b.safety_score - a.safety_score || (b.power_units ?? 0) - (a.power_units ?? 0));
    return { rows, stats };
}

async function run() {
    await Actor.init();
    const input = parseInput((await Actor.getInput()) ?? {});
    log.info('Input', { ...input, socrataAppToken: input.socrataAppToken ? '(set)' : null });

    const { rows, stats } = await collect(input);
    if (rows.length === 0 && stats.census_pages === 0) throw new Error('The FMCSA data service did not answer. See the log for details.');

    // Respect both maxResults and the spending limit the user set for the run.
    const charging = Actor.getChargingManager();
    const affordable = charging.calculateMaxEventChargeCountWithinLimit(CHARGE_EVENT);
    const limit = Math.min(input.maxResults, Number.isFinite(affordable) ? affordable : Infinity);
    const out = rows.slice(0, limit);
    for (let i = 0; i < out.length; i += 100) {
        const res = await Actor.pushData(out.slice(i, i + 100), CHARGE_EVENT);
        if (res?.eventChargeLimitReached) {
            log.info('Reached the spending limit for this run.');
            break;
        }
    }

    const summary = {
        found: rows.length,
        returned: out.length,
        with_phone: out.filter((r) => r.phone).length,
        with_email: out.filter((r) => r.email).length,
        with_website: out.filter((r) => r.website).length,
        with_active_authority: out.filter((r) => r.authority_status === 'active').length,
        stats,
    };
    await Actor.setValue('RUN_SUMMARY', summary);
    log.info('Done', summary);
    const matched = stats.census_matches != null ? ` from ${stats.census_matches} matching FMCSA registrations` : '';
    await Actor.setStatusMessage(`Returned ${out.length} vetted carriers${matched}.`, { isStatusMessageTerminal: true });
    await Actor.exit();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().catch(async (err) => {
        log.error(err.message);
        await Actor.fail(err.message);
    });
}
