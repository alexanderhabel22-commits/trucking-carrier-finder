import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARGO, CARGO_IDS } from '../src/cargo.js';
import {
    censusWhere, mapCensus, applyAuthority, applySms, applyCrashes, applyOos, monthsAgo, soqlUrl, fetchAuthority,
} from '../src/sources/fmcsa.js';
import { parseInput, locationFilter, rejectReason, safetyScore, toOutputRow, CarrierSet } from '../src/main.js';
import { censusRow, authorityRows, smsRow } from './fixtures.js';

const NOW = new Date('2026-11-15T00:00:00Z');

test('every cargo type has a census column and a label', () => {
    const fields = new Set();
    for (const id of CARGO_IDS) {
        assert.match(CARGO[id].field, /^crgo_/, id);
        assert.ok(CARGO[id].label, id);
        fields.add(CARGO[id].field);
    }
    assert.equal(fields.size, CARGO_IDS.length, 'no two cargo types share a column');
});

test('default input is refrigerated for-hire carriers in Ohio', () => {
    const i = parseInput({});
    assert.deepEqual(i.states, ['OH']);
    assert.deepEqual(i.cargoTypes, ['refrigerated_food']);
    assert.equal(i.operationType, 'for_hire');
    assert.equal(i.requireActiveAuthority, true);
    assert.equal(i.excludeUnsafe, true);
    assert.equal(i.maxResults, 500);
});

test('bad input gets a plain-language error', () => {
    assert.throws(() => parseInput({ states: ['XX'] }), /Unknown state/);
    assert.throws(() => parseInput({ cargoTypes: ['spaceships'] }), /Unknown cargo/);
    assert.throws(() => parseInput({ zipCode: '00000' }), /not found/);
    assert.throws(() => parseInput({ minPowerUnits: 10, maxPowerUnits: 5 }), /at least the minimum/);
    assert.throws(() => parseInput({ sortBy: 'distance' }), /needs a ZIP/);
    assert.throws(() => parseInput({ operationType: 'pirate' }), /Operation type/);
});

test('a ZIP search does not default to Ohio', () => {
    const i = parseInput({ zipCode: '60601', radiusMiles: 30 });
    assert.deepEqual(i.states, []);
    assert.equal(i.zipCode, '60601');
});

test('census WHERE clause carries every filter', () => {
    const i = parseInput({ states: ['OH', 'IN'], cargoTypes: ['refrigerated_food', 'meat'], minPowerUnits: 5, maxPowerUnits: 50, hazmatOnly: true, interstateOnly: true, updatedWithinMonths: 12, minYearsInBusiness: 2 });
    const w = censusWhere(i, i.states, NOW);
    assert.match(w, /status_code='A'/);
    assert.match(w, /phy_state in\('OH','IN'\)/);
    assert.match(w, /\(crgo_coldfood='X' OR crgo_meat='X'\)/);
    assert.match(w, /power_units::number>=5/);
    assert.match(w, /power_units::number<=50/);
    assert.match(w, /hm_ind='Y'/);
    assert.match(w, /carrier_operation='A'/);
    assert.match(w, /classdef like '%AUTHORIZED FOR HIRE%'/);
    assert.match(w, /mcs150_date>='20251115'/);
    assert.match(w, /add_date<='20241115'/);
    const priv = censusWhere(parseInput({ operationType: 'private', cargoTypes: [] }), ['OH'], NOW);
    assert.match(priv, /classdef not like '%AUTHORIZED FOR HIRE%'/);
    assert.doesNotMatch(priv, /crgo_/);
});

test('monthsAgo and soqlUrl', () => {
    assert.equal(monthsAgo(24, NOW), '20241115');
    const u = new URL(soqlUrl('az4n-8mr2', { where: "phy_state='OH'", limit: 10 }));
    assert.equal(u.searchParams.get('$where'), "phy_state='OH'");
    assert.equal(u.searchParams.get('$limit'), '10');
});

test('census row maps to a clean record', () => {
    const r = mapCensus(censusRow(), NOW.toISOString());
    assert.equal(r.company_name, 'Milk Transportation LLC');
    assert.equal(r.dba_name, null, 'DBA equal to the legal name is dropped');
    assert.equal(r.usdot_number, '14762');
    assert.equal(r.mc_number, 'MC491205');
    assert.deepEqual(r.operation_types, ['for_hire', 'private_fleet']);
    assert.equal(r.also_broker, true);
    assert.equal(r.interstate, true);
    assert.equal(r.power_units, 198);
    assert.equal(r.tractors, 180);
    assert.equal(r.trailers, 300);
    assert.deepEqual(r.cargo_types.sort(), ['general_freight', 'refrigerated_food']);
    assert.equal(r.cargo_other, 'MILK');
    assert.equal(r.phone, '(740) 325-0069');
    assert.equal(r.email, 'dispatch@milktransport.com');
    assert.equal(r.email_domain, 'milktransport.com');
    assert.equal(r.website, 'https://milktransport.com');
    assert.equal(r.street, '300 NORTH 5TH STREET');
    assert.equal(r.city, 'Martins Ferry');
    assert.equal(r.zip, '43935');
    assert.equal(r.registered_date, '1998-06-01');
    assert.equal(r.years_registered, 28);
    assert.equal(r.safety_rating, 'satisfactory');
    assert.match(r.safer_url, /query_string=14762$/);
});

test('personal emails are dropped but their company domain is kept', () => {
    const r = mapCensus(censusRow({ email_address: 'jeff.weekley@uniteddairy.com' }));
    assert.equal(r.email, null);
    assert.equal(r.email_domain, 'uniteddairy.com');
    assert.equal(r.website, null, 'domain does not match the company name, so it is not called its website');
    const g = mapCensus(censusRow({ email_address: 'milktrucks@gmail.com' }));
    assert.equal(g.email_domain, null);
    assert.equal(g.website, null);
    assert.equal(mapCensus(censusRow({ email_address: 'safety@gmail.com' })).email, 'safety@gmail.com', 'role mailbox on webmail is still a company mailbox');
});

test('officer names and cell phones never reach the output', () => {
    const r = toOutputRow(mapCensus(censusRow({ company_officer_1: 'JANE DOE', cell_phone: '6145550100' })));
    const text = JSON.stringify(r);
    assert.doesNotMatch(text, /JANE|Jane|6145550100|555-0100/);
    assert.ok(!Object.keys(r).some((k) => k.startsWith('_')));
});

test('authority, insurance and safety enrichment', () => {
    const r = mapCensus(censusRow());
    const authMap = new Map([['14762', { dockets: ['MC491205'], types: new Set(['contract']), inactive: false, pending: false, bipd: 1_000_000, required: 750_000, cargoFile: true }]]);
    applyAuthority(r, authMap.get('14762'));
    assert.equal(r.authority_status, 'active');
    assert.deepEqual(r.authority_types, ['contract']);
    assert.equal(r.insurance_bipd_on_file_usd, 1_000_000);
    assert.equal(r.insurance_bipd_required_usd, 750_000);
    applySms(r, smsRow);
    assert.equal(r.inspections_24mo, 120);
    assert.equal(r.vehicle_oos_rate_pct, 12.5);
    assert.equal(r.driver_oos_rate_pct, 3.6);
    assert.deepEqual(r.safety_alerts, ['hours_of_service']);
    applyCrashes(r, { n: 3, f: 0, i: 2 });
    assert.equal(r.crashes_24mo, 3);
    applyOos(r, undefined);
    assert.equal(r.out_of_service_order, false);

    const none = applyAuthority(mapCensus(censusRow({ docket1prefix: null, docket1: null })), undefined);
    assert.equal(none.authority_status, 'none');
    const broker = applyAuthority(mapCensus(censusRow()), { dockets: ['MC1'], types: new Set(['broker']), inactive: false, pending: false, bipd: 0, required: 0, cargoFile: false });
    assert.equal(broker.authority_status, 'broker_only');
});

test('authority rows are grouped by zero-padded USDOT number', async () => {
    const realFetch = globalThis.fetch;
    let asked;
    globalThis.fetch = async (url) => {
        asked = decodeURIComponent(String(url).replace(/\+/g, ' '));
        return new Response(JSON.stringify(authorityRows), { status: 200 });
    };
    try {
        const m = await fetchAuthority(['14762', '999']);
        assert.match(asked, /dot_number in\('00014762','00000999'\)/);
        assert.deepEqual([...m.get('14762').types], ['contract']);
        assert.equal(m.get('14762').bipd, 1_000_000);
        assert.equal(m.get('999').inactive, true);
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('filters that need enrichment', () => {
    const input = parseInput({ maxVehicleOosRate: 20, requirePhone: true });
    const ok = applyAuthority(mapCensus(censusRow()), { dockets: [], types: new Set(['common']), bipd: 1e6, required: 75e4 });
    assert.equal(rejectReason(ok, input), null);
    assert.equal(rejectReason({ ...ok, authority_status: 'inactive' }, input), 'no_active_authority');
    assert.equal(rejectReason({ ...ok, out_of_service_order: true }, input), 'out_of_service_order');
    assert.equal(rejectReason({ ...ok, safety_rating: 'unsatisfactory' }, input), 'unsatisfactory_rating');
    assert.equal(rejectReason({ ...ok, vehicle_oos_rate_pct: 40, vehicle_inspections_24mo: 10 }, input), 'vehicle_oos_rate');
    assert.equal(rejectReason({ ...ok, vehicle_oos_rate_pct: 100, vehicle_inspections_24mo: 1 }, input), null, 'one bad inspection is too few to judge');
    assert.equal(rejectReason({ ...ok, phone: null }, input), 'no_phone');
    const priv = parseInput({ operationType: 'private' });
    assert.equal(rejectReason({ ...ok, authority_status: 'none' }, priv), null, 'private fleets need no authority');
});

test('safety score rewards clean records', () => {
    const clean = { safety_rating: 'satisfactory', safety_alerts: [], vehicle_oos_rate_pct: 10, vehicle_inspections_24mo: 20, driver_oos_rate_pct: 2, driver_inspections_24mo: 20, power_units: 10, crashes_24mo: 0 };
    const bad = { ...clean, safety_rating: 'conditional', safety_alerts: ['hours_of_service', 'vehicle_maintenance'], vehicle_oos_rate_pct: 50, crashes_24mo: 5, crash_fatalities_24mo: 1 };
    assert.equal(safetyScore(clean), 100);
    assert.ok(safetyScore(bad) < 40);
});

test('person-only names and duplicate registrations are dropped', () => {
    const set = new CarrierSet();
    assert.equal(set.add(mapCensus(censusRow())), 'added');
    assert.equal(set.add(mapCensus(censusRow())), 'duplicate');
    assert.equal(set.add(mapCensus(censusRow({ dot_number: '2', legal_name: 'MILK TRANSPORTATION, LLC' }))), 'duplicate', 'same name and phone');
    assert.equal(set.add(mapCensus(censusRow({ dot_number: '3', legal_name: 'NICHOLAS CRIVELLI', phone: '7242664022' }))), 'person_name');
    assert.equal(set.add(mapCensus(censusRow({ dot_number: '4', legal_name: 'CRIVELLI TRUCKING LLC', dba_name: 'JOHN SMITH', phone: '7242664023' }))), 'added');
    assert.equal(set.rows[1].dba_name, null, 'a DBA that is only a person name is blanked');
});

test('ZIP radius filter sets distance', () => {
    const where = locationFilter(parseInput({ zipCode: '43935', radiusMiles: 25 }));
    const near = mapCensus(censusRow());
    assert.equal(where.test(near), true);
    assert.equal(near.distance_miles, 0);
    const far = mapCensus(censusRow({ phy_zip: '90210', phy_state: 'CA' }));
    assert.equal(where.test(far), false);
});

test('stricter person-name check for one-person registrations', async () => {
    const { mayBePersonName } = await import('../src/normalize.js');
    for (const n of ['Ethel Jean Bush', 'Renaldo James Young', 'Connie Sheffield', 'NICHOLAS CRIVELLI']) assert.equal(mayBePersonName(n), true, n);
    for (const n of ['Apex Legends Limited', 'Worldwide Trailers USA', 'Hotshot Nana', 'Wdr Transllc', 'Blue Ridge Express', 'Smith Trucking LLC', 'J & B Hauling']) assert.equal(mayBePersonName(n), false, n);
});
