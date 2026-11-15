// ZIP code radius search.
//
// src/data/zip-centroids.csv holds the centre point of every US ZIP code area,
// from the US Census Bureau 2024 Gazetteer (ZCTA file, public domain).

import { readFileSync } from 'node:fs';

let cache = null;

function load() {
    if (cache) return cache;
    const text = readFileSync(new URL('./data/zip-centroids.csv', import.meta.url), 'utf8');
    const byZip = new Map();
    const prefixSums = new Map();
    for (const line of text.split('\n').slice(1)) {
        const [zip, lat, lon] = line.split(',');
        if (!zip) continue;
        const point = [Number(lat), Number(lon)];
        byZip.set(zip, point);
        // Average per 3-digit prefix, used for ZIPs that are not in the file
        // (PO boxes and single-building ZIPs have no area of their own).
        const p = prefixSums.get(zip.slice(0, 3)) ?? [0, 0, 0];
        prefixSums.set(zip.slice(0, 3), [p[0] + point[0], p[1] + point[1], p[2] + 1]);
    }
    const byPrefix = new Map([...prefixSums].map(([k, [la, lo, n]]) => [k, [la / n, lo / n]]));
    cache = { byZip, byPrefix };
    return cache;
}

/** [lat, lon] for a ZIP, falling back to its 3-digit area. Null when unknown. */
export function zipCentroid(zip) {
    if (!zip) return null;
    const z = String(zip).slice(0, 5);
    const { byZip, byPrefix } = load();
    return byZip.get(z) ?? byPrefix.get(z.slice(0, 3)) ?? null;
}

/** True when `zip` is a ZIP code we know about. */
export function isKnownZip(zip) {
    return load().byZip.has(String(zip ?? '').slice(0, 5));
}

/** Great-circle distance in miles. */
export function distanceMiles([lat1, lon1], [lat2, lon2]) {
    const R = 3958.8;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

// First three ZIP digits -> state. Ranges from the USPS ZIP prefix allocation.
const PREFIX_RANGES = [
    [5, 5, 'NY'], [6, 9, 'PR'], [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'],
    [50, 54, 'VT'], [55, 55, 'MA'], [56, 59, 'VT'], [60, 69, 'CT'], [70, 89, 'NJ'], [100, 149, 'NY'],
    [150, 196, 'PA'], [197, 199, 'DE'], [200, 200, 'DC'], [201, 201, 'VA'], [202, 205, 'DC'],
    [206, 219, 'MD'], [220, 246, 'VA'], [247, 268, 'WV'], [270, 289, 'NC'], [290, 299, 'SC'],
    [300, 319, 'GA'], [320, 339, 'FL'], [341, 349, 'FL'], [350, 369, 'AL'], [370, 385, 'TN'],
    [386, 397, 'MS'], [398, 399, 'GA'], [400, 427, 'KY'], [430, 459, 'OH'], [460, 479, 'IN'],
    [480, 499, 'MI'], [500, 528, 'IA'], [530, 549, 'WI'], [550, 567, 'MN'], [569, 569, 'DC'],
    [570, 577, 'SD'], [580, 588, 'ND'], [590, 599, 'MT'], [600, 629, 'IL'], [630, 658, 'MO'],
    [660, 679, 'KS'], [680, 693, 'NE'], [700, 714, 'LA'], [716, 729, 'AR'], [730, 732, 'OK'],
    [733, 733, 'TX'], [734, 749, 'OK'], [750, 799, 'TX'], [800, 816, 'CO'], [820, 831, 'WY'],
    [832, 838, 'ID'], [840, 847, 'UT'], [850, 865, 'AZ'], [870, 884, 'NM'], [885, 885, 'TX'],
    [889, 898, 'NV'], [900, 961, 'CA'], [967, 968, 'HI'], [970, 979, 'OR'], [980, 994, 'WA'],
    [995, 999, 'AK'],
];

/** Two-letter state for a ZIP code, from its first three digits. */
export function zipState(zip) {
    const p = Number(String(zip ?? '').slice(0, 3));
    if (!Number.isFinite(p)) return null;
    const hit = PREFIX_RANGES.find(([lo, hi]) => p >= lo && p <= hi);
    return hit ? hit[2] : null;
}

/** States that have any ZIP area within `radiusMiles` (plus a margin) of `centre`. */
export function statesWithinRadius(centre, radiusMiles) {
    const { byZip } = load();
    const states = new Set();
    for (const [zip, point] of byZip) {
        if (distanceMiles(centre, point) <= radiusMiles + 15) {
            const st = zipState(zip);
            if (st) states.add(st);
        }
    }
    return [...states];
}

/** Nearest ZIP code to a point, as { zip, miles }. Scans all ZIPs; use sparingly. */
export function nearestZip(point) {
    const { byZip } = load();
    let best = null;
    for (const [zip, p] of byZip) {
        // Cheap pre-filter before the exact distance.
        if (Math.abs(p[0] - point[0]) > 0.5 || Math.abs(p[1] - point[1]) > 0.7) continue;
        const d = distanceMiles(point, p);
        if (!best || d < best.miles) best = { zip, miles: d };
    }
    return best;
}
