// FMCSA open data on data.transportation.gov (Socrata API, no key needed).
//
// - Company Census File (az4n-8mr2): one row per USDOT number with address,
//   phone, fleet, drivers, cargo and safety rating. Filtered server side.
// - Carrier (6eyk-hxee): operating authority (MC number) status and insurance.
// - SMS AB PassProperty (4y6x-dmck): 24-month inspection and out-of-service counts, BASIC alerts.
// - Crash File (aayw-vxb3): reportable crashes.
// - Out of Service Orders (p2mt-9ige).

import { fetchJson } from '../http.js';
import { CARGO, cargoOf } from '../cargo.js';
import {
    formatPhone, phoneDigits, prettyName, companyEmail, emailDomain, domainMatchesName, zip5, ymd, US_STATES,
} from '../normalize.js';

export const SOURCE = 'fmcsa';
const BASE = 'https://data.transportation.gov/resource';
export const DATASETS = {
    census: 'az4n-8mr2',
    authority: '6eyk-hxee',
    sms: '4y6x-dmck',
    crashes: 'aayw-vxb3',
    oosOrders: 'p2mt-9ige',
};

const CENSUS_COLUMNS = [
    'dot_number', 'legal_name', 'dba_name', 'status_code', 'carrier_operation', 'classdef', 'carship', 'business_org_desc',
    'phone', 'fax', 'email_address', 'phy_street', 'phy_city', 'phy_state', 'phy_zip', 'phy_country',
    'power_units', 'truck_units', 'total_drivers', 'total_cdl',
    'owntruck', 'owntract', 'owntrail', 'trmtruck', 'trmtract', 'trmtrail', 'trptruck', 'trptract', 'trptrail',
    'mcs150_date', 'mcs150_mileage', 'mcs150_mileage_year', 'add_date', 'hm_ind', 'safety_rating', 'safety_rating_date',
    'docket1prefix', 'docket1', 'docket1_status_code', 'docket2prefix', 'docket2', 'docket3prefix', 'docket3',
    'interstate_beyond_100_miles', 'interstate_within_100_miles', 'intrastate_beyond_100_miles', 'intrastate_within_100_miles',
    'crgo_cargoothr', 'crgo_cargoothr_desc',
    ...Object.values(CARGO).map((c) => c.field),
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** "YYYYMMDD" for a date `months` before `now`. */
export function monthsAgo(months, now = new Date()) {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - months);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/** SoQL WHERE clause for the census search. */
export function censusWhere(input, states, now = new Date()) {
    const parts = [`status_code='A'`, `phy_state in(${states.map(q).join(',')})`];
    if (input.cargoTypes.length) parts.push(`(${input.cargoTypes.map((c) => `${CARGO[c].field}='X'`).join(' OR ')})`);
    if (input.hazmatOnly) parts.push(`hm_ind='Y'`);
    if (input.minPowerUnits > 0) parts.push(`power_units::number>=${input.minPowerUnits}`);
    if (input.maxPowerUnits != null) parts.push(`power_units::number<=${input.maxPowerUnits}`);
    if (input.operationType === 'for_hire') parts.push(`classdef like '%AUTHORIZED FOR HIRE%'`);
    if (input.operationType === 'private') parts.push(`classdef like '%PRIVATE PROPERTY%' AND classdef not like '%AUTHORIZED FOR HIRE%'`);
    if (input.interstateOnly) parts.push(`carrier_operation='A'`);
    if (input.updatedWithinMonths > 0) parts.push(`mcs150_date>=${q(monthsAgo(input.updatedWithinMonths, now))}`);
    if (input.minYearsInBusiness > 0) parts.push(`add_date<=${q(monthsAgo(input.minYearsInBusiness * 12, now))}`);
    if (input.maxYearsInBusiness != null) parts.push(`add_date>=${q(monthsAgo(input.maxYearsInBusiness * 12, now))}`);
    return parts.join(' AND ');
}

export function soqlUrl(dataset, params) {
    const u = new URL(`${BASE}/${dataset}.json`);
    for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(`$${k}`, String(v));
    return u.href;
}

const headers = (token) => (token ? { 'X-App-Token': token } : {});

/**
 * Pages through matching census rows, biggest fleets first. Calls onPage(rows)
 * for each page; stops when onPage returns true or rows run out.
 */
export async function searchCensus(where, { pageSize = 10_000, onPage, log, token, shouldStop } = {}) {
    let offset = 0;
    let pages = 0;
    for (;;) {
        if (shouldStop?.()) break;
        const url = soqlUrl(DATASETS.census, {
            select: CENSUS_COLUMNS.join(','),
            where,
            order: 'power_units::number DESC, dot_number',
            limit: pageSize,
            offset,
        });
        const rows = await fetchJson(url, { log, headers: headers(token), timeoutMs: 120_000 });
        pages++;
        if (!Array.isArray(rows)) throw new Error('Unexpected reply from the FMCSA census search');
        const stop = await onPage(rows);
        if (stop || rows.length < pageSize) break;
        offset += pageSize;
    }
    return { pages };
}

/** Counts matching census rows (for the log). */
export async function countCensus(where, { log, token } = {}) {
    const rows = await fetchJson(soqlUrl(DATASETS.census, { select: 'count(*) as n', where }), { log, headers: headers(token) });
    return Number(rows?.[0]?.n ?? 0);
}

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const sum = (...vals) => vals.reduce((a, v) => a + (num(v) ?? 0), 0);

function docketOf(r) {
    for (const i of [1, 2, 3]) {
        const prefix = r[`docket${i}prefix`];
        const n = r[`docket${i}`];
        if (prefix && n && ['MC', 'FF', 'MX'].includes(prefix)) return `${prefix}${String(Number(n))}`;
    }
    return null;
}

const OPERATION = { A: 'interstate', B: 'intrastate_hazmat', C: 'intrastate' };
const RATING = { S: 'satisfactory', C: 'conditional', U: 'unsatisfactory' };

/** Census row -> output-shaped record (enrichment fields filled later). */
export function mapCensus(r, scrapedAt = new Date().toISOString()) {
    const dot = String(Number(r.dot_number));
    const name = prettyName(r.legal_name);
    const dba = r.dba_name && r.dba_name.trim().toUpperCase() !== String(r.legal_name ?? '').trim().toUpperCase() ? prettyName(r.dba_name) : null;
    const domain = emailDomain(r.email_address);
    const classes = String(r.classdef ?? '').split(';').map((s) => s.trim()).filter(Boolean);
    const opTypes = [];
    if (classes.some((c) => c === 'AUTHORIZED FOR HIRE')) opTypes.push('for_hire');
    if (classes.some((c) => c === 'EXEMPT FOR HIRE')) opTypes.push('exempt_for_hire');
    if (classes.some((c) => c === 'PRIVATE PROPERTY')) opTypes.push('private_fleet');
    if (classes.some((c) => c.startsWith('PRIVATE PASSENGER'))) opTypes.push('private_passenger');
    if (classes.some((c) => /GOVERNMENT|INDIAN TRIBE/.test(c))) opTypes.push('government');
    const carship = String(r.carship ?? '').split(';');
    const cargo = cargoOf(r);
    const state = US_STATES[r.phy_state] ? r.phy_state : null;
    const addDate = ymd(r.add_date);
    return {
        company_name: name,
        dba_name: dba,
        usdot_number: dot,
        mc_number: docketOf(r),
        operation_types: opTypes,
        also_broker: carship.includes('B'),
        also_shipper: carship.includes('S'),
        interstate: r.carrier_operation === 'A',
        operation_area: OPERATION[r.carrier_operation] ?? null,
        power_units: num(r.power_units),
        drivers: num(r.total_drivers),
        cdl_drivers: num(r.total_cdl),
        trucks: sum(r.owntruck, r.trmtruck, r.trptruck),
        tractors: sum(r.owntract, r.trmtract, r.trptract),
        trailers: sum(r.owntrail, r.trmtrail, r.trptrail),
        annual_miles: num(r.mcs150_mileage) || null,
        annual_miles_year: num(r.mcs150_mileage_year) || null,
        cargo_types: cargo,
        cargo_other: r.crgo_cargoothr === 'X' && r.crgo_cargoothr_desc && !/^unspecified$/i.test(r.crgo_cargoothr_desc) ? r.crgo_cargoothr_desc.trim() : null,
        hazmat: r.hm_ind === 'Y',
        phone: formatPhone(r.phone),
        fax: formatPhone(r.fax),
        email: companyEmail(r.email_address),
        email_domain: domain,
        website: domain && domainMatchesName(domain, r.legal_name, r.dba_name) ? `https://${domain}` : null,
        street: r.phy_street ? r.phy_street.trim() : null,
        city: prettyName(r.phy_city),
        state,
        zip: zip5(r.phy_zip),
        registered_date: addDate,
        years_registered: addDate ? Math.floor((Date.parse(scrapedAt) - Date.parse(addDate)) / (365.25 * 864e5)) : null,
        mcs150_updated: ymd(r.mcs150_date),
        safety_rating: RATING[r.safety_rating] ?? 'not_rated',
        safety_rating_date: ymd(r.safety_rating_date),
        // Filled by enrichment.
        authority_status: null,
        authority_types: [],
        authority_pending: false,
        insurance_bipd_on_file_usd: null,
        insurance_bipd_required_usd: null,
        cargo_insurance_on_file: null,
        inspections_24mo: null,
        driver_inspections_24mo: null,
        vehicle_inspections_24mo: null,
        driver_oos_rate_pct: null,
        vehicle_oos_rate_pct: null,
        safety_alerts: [],
        crashes_24mo: null,
        crash_fatalities_24mo: null,
        crash_injuries_24mo: null,
        out_of_service_order: false,
        out_of_service_reason: null,
        safer_url: `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dot}`,
        scraped_at: scrapedAt,
        _phoneDigits: phoneDigits(r.phone),
        _business_org: r.business_org_desc ?? null,
    };
}

const inList = (dots, pad = 0) => dots.map((d) => q(pad ? d.padStart(pad, '0') : d)).join(',');

async function getAll(dataset, params, opts) {
    return fetchJson(soqlUrl(dataset, { limit: 50_000, ...params }), { ...opts, headers: headers(opts.token), timeoutMs: 30_000 });
}

/** Operating authority per USDOT number. */
export async function fetchAuthority(dots, opts = {}) {
    const rows = await getAll(DATASETS.authority, { where: `dot_number in(${inList(dots, 8)})` }, opts);
    const out = new Map();
    for (const r of rows) {
        const dot = String(Number(r.dot_number));
        const a = out.get(dot) ?? { dockets: [], types: new Set(), inactive: false, pending: false, bipd: 0, required: 0, cargoFile: false };
        a.dockets.push(r.docket_number);
        if (r.common_stat === 'A') a.types.add('common');
        if (r.contract_stat === 'A') a.types.add('contract');
        if (r.broker_stat === 'A') a.types.add('broker');
        if ([r.common_stat, r.contract_stat, r.broker_stat].includes('I')) a.inactive = true;
        if ([r.common_app_pend, r.contract_app_pend, r.broker_app_pend].includes('Y')) a.pending = true;
        a.bipd = Math.max(a.bipd, (num(r.bipd_file) ?? 0) * 1000);
        a.required = Math.max(a.required, (num(r.min_cov_amount) ?? 0) * 1000);
        if (r.cargo_file === 'Y') a.cargoFile = true;
        out.set(dot, a);
    }
    return out;
}

const ALERTS = { unsafe_driv_ac: 'unsafe_driving', hos_driv_ac: 'hours_of_service', driv_fit_ac: 'driver_fitness', contr_subst_ac: 'drugs_alcohol', veh_maint_ac: 'vehicle_maintenance' };

/** 24-month inspection summary per USDOT number. */
export async function fetchSms(dots, opts = {}) {
    const rows = await getAll(DATASETS.sms, { where: `dot_number in(${inList(dots)})` }, opts);
    return new Map(rows.map((r) => [String(Number(r.dot_number)), r]));
}

/** Crashes since `since` (YYYYMMDD) per USDOT number. */
export async function fetchCrashes(dots, since, opts = {}) {
    const rows = await getAll(DATASETS.crashes, {
        select: 'dot_number,count(*) as n,sum(fatalities::number) as f,sum(injuries::number) as i',
        where: `dot_number in(${inList(dots)}) AND report_date>=${q(since)}`,
        group: 'dot_number',
    }, opts);
    return new Map(rows.map((r) => [String(Number(r.dot_number)), { n: num(r.n) ?? 0, f: num(r.f) ?? 0, i: num(r.i) ?? 0 }]));
}

/** Out-of-service orders still in force (not rescinded) per USDOT number. */
export async function fetchOosOrders(dots, opts = {}) {
    const rows = await getAll(DATASETS.oosOrders, { where: `dot_number in(${inList(dots)})` }, opts);
    const out = new Map();
    for (const r of rows) {
        if (r.rescind_date || (r.status && r.status !== 'ACTIVE')) continue;
        out.set(String(Number(r.dot_number)), r.oos_reason ?? 'Out of service');
    }
    return out;
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

export function applyAuthority(rec, a) {
    if (!a) {
        rec.authority_status = rec.mc_number ? 'unknown' : 'none';
        return rec;
    }
    rec.authority_types = [...a.types];
    rec.authority_pending = a.pending;
    if (!rec.mc_number) rec.mc_number = a.dockets.find((d) => d.startsWith('MC')) ?? a.dockets[0] ?? null;
    const carrierAuth = a.types.has('common') || a.types.has('contract');
    rec.authority_status = carrierAuth ? 'active' : a.types.has('broker') ? 'broker_only' : a.pending ? 'pending' : a.inactive ? 'inactive' : 'none';
    rec.insurance_bipd_on_file_usd = a.bipd || 0;
    rec.insurance_bipd_required_usd = a.required || null;
    rec.cargo_insurance_on_file = a.cargoFile;
    return rec;
}

export function applySms(rec, s) {
    if (!s) {
        rec.inspections_24mo = 0;
        return rec;
    }
    rec.inspections_24mo = num(s.insp_total) ?? 0;
    rec.driver_inspections_24mo = num(s.driver_insp_total) ?? 0;
    rec.vehicle_inspections_24mo = num(s.vehicle_insp_total) ?? 0;
    rec.driver_oos_rate_pct = pct(num(s.driver_oos_insp_total) ?? 0, rec.driver_inspections_24mo);
    rec.vehicle_oos_rate_pct = pct(num(s.vehicle_oos_insp_total) ?? 0, rec.vehicle_inspections_24mo);
    rec.safety_alerts = Object.entries(ALERTS).filter(([k]) => s[k] === 'Y').map(([, v]) => v);
    return rec;
}

export function applyCrashes(rec, c) {
    rec.crashes_24mo = c?.n ?? 0;
    rec.crash_fatalities_24mo = c?.f ?? 0;
    rec.crash_injuries_24mo = c?.i ?? 0;
    return rec;
}

export function applyOos(rec, reason) {
    rec.out_of_service_order = Boolean(reason);
    rec.out_of_service_reason = reason ?? null;
    return rec;
}
