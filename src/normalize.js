// Small helpers that clean up names, phones, websites and states so records
// from different sources can be compared and deduplicated.

export const US_STATES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
    PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const STATE_BY_NAME = Object.fromEntries(
    Object.entries(US_STATES).map(([abbr, name]) => [name.toLowerCase(), abbr]),
);

/** "Ohio", "ohio" or "OH" -> "OH". Unknown values -> null. */
export function stateAbbr(value) {
    if (!value) return null;
    const v = String(value).trim();
    if (US_STATES[v.toUpperCase()]) return v.toUpperCase();
    return STATE_BY_NAME[v.toLowerCase()] ?? null;
}

/** Ten-digit US phone digits, or null. */
export function phoneDigits(value) {
    if (!value) return null;
    let d = String(value).split(/\s*(?:x|ext\.?|extension|;|,)\s*\d*/i)[0].replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
    return d.length === 10 ? d : null;
}

/** "(614) 443-5704", or null when the number is not a 10-digit US number. */
export function formatPhone(value) {
    const d = phoneDigits(value);
    return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}

// Hosts that many unrelated companies share; never deduplicate on these.
const SHARED_HOSTS = new Set([
    'facebook.com', 'm.facebook.com', 'linkedin.com', 'instagram.com', 'twitter.com', 'x.com',
    'youtube.com', 'yelp.com', 'google.com', 'sites.google.com', 'business.site', 'g.page',
    'goo.gl', 'maps.google.com', 'yellowpages.com', 'manta.com', 'thomasnet.com', 'bbb.org',
    'sam.gov', 'na', 'n/a', 'none',
]);

/** Adds a scheme when missing and drops obvious junk. */
export function cleanWebsite(value) {
    if (!value) return null;
    let v = String(value).trim();
    if (!v || /^(n\/?a|none|null|-)$/i.test(v)) return null;
    if (!/^https?:\/\//i.test(v)) v = `http://${v}`;
    try {
        const u = new URL(v);
        if (!u.hostname.includes('.')) return null;
        return u.href;
    } catch {
        return null;
    }
}

/** "https://www.AcmeFab.com/about" -> "acmefab.com". Shared hosts -> null. */
export function websiteDomain(value) {
    const url = cleanWebsite(value);
    if (!url) return null;
    const host = new URL(url).hostname.toLowerCase().replace(/^www\d?\./, '');
    return SHARED_HOSTS.has(host) ? null : host;
}

const KEEP_UPPER = new Set(['LLC', 'LLP', 'LP', 'USA', 'US', 'CNC', 'EDM', 'II', 'III', 'IV', 'PC', 'DBA', 'ISO', 'NC', 'HVAC', 'JV', 'CAD', 'CAM']);

/** Turns "ACRODYNE MFG. CO" into "Acrodyne Mfg. Co". Mixed-case names are left alone. */
export function prettyName(value) {
    if (!value) return null;
    const v = String(value).trim().replace(/\s+/g, ' ');
    if (v !== v.toUpperCase()) return v;
    return v
        .toLowerCase()
        .replace(/[a-z0-9&'.]+/g, (w) => {
            const bare = w.replace(/\./g, '').toUpperCase();
            if (KEEP_UPPER.has(bare)) return w.toUpperCase();
            if (/^[a-z]&[a-z]$/.test(w)) return w.toUpperCase(); // "A&M"
            if (/^([a-z]\.)+[a-z]?\.?$/.test(w)) return w.toUpperCase(); // "R.P."
            return w.charAt(0).toUpperCase() + w.slice(1);
        });
}

/** Lowercase name without punctuation or legal suffixes, for fallback matching. */
export function nameKey(value) {
    if (!value) return '';
    return String(value)
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\b(inc|incorporated|llc|ltd|co|corp|corporation|company|the|l l c)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Mailbox words that name a job or department, not a person. A local part
// made only of these (joined by . _ - or digits), such as "dispatch",
// "dot.compliance" or "safety1", is kept.
const ROLE_WORDS = new Set(('info sales quote quotes rfq estimating office contact contacts admin administration service services '
    + 'support order orders hello inquiry inquiries mail general shop bid bids purchasing dispatch dispatcher dispatching '
    + 'safety compliance dot fmcsa logistics operations ops accounting accounts ap ar billing invoices invoice payables '
    + 'receivables recruiting recruitment careers jobs hr fleet transport transportation trucking freight loads load '
    + 'booking customerservice cs team main company corporate claims insurance permits maintenance shipping receiving '
    + 'broker brokerage carrier carriers drivers driver hiring').split(' '));
const isRoleMailbox = (local) => {
    const parts = local.toLowerCase().split(/[._\-+]|\d+/).filter(Boolean);
    return parts.length > 0 && parts.every((w) => ROLE_WORDS.has(w));
};

/**
 * Keeps only role-based company mailboxes such as info@ or sales@.
 * Personal addresses (john.smith@, jsmith@) are dropped, per the data rules.
 */
export function companyEmail(value) {
    if (!value) return null;
    const v = String(value).trim().toLowerCase();
    const m = v.match(/^([^@\s]+)@([^@\s]+\.[a-z]{2,})$/);
    if (!m) return null;
    return isRoleMailbox(m[1]) ? v : null;
}

/** First 5 digits of a ZIP, or null. */
export function zip5(value) {
    const m = String(value ?? '').match(/\d{5}/);
    return m ? m[0] : null;
}

// Common US first names (Census lists), to spot names that are only a person's.
const FIRST_NAMES = new Set(`james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark donald steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander frank patrick raymond jack dennis jerry tyler aaron jose adam nathan henry douglas zachary peter kyle ethan walter noah jeremy christian keith roger terry gerald harold sean austin carl arthur lawrence dylan jesse jordan bryan billy joe bruce gabriel logan albert willie alan juan wayne elijah randy roy vincent ralph eugene russell bobby mason philip louis luke ben jim jimmy tom tim mike bill bob dave dan doug greg jeff jon ken matt nick pat rick ron steve ted tony chris curt curtis dale dean duane earl gene glenn howard jay jerome joel lee leon lloyd marvin mitchell neil norman phil rodney ross shane todd travis troy vernon warren wesley mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty margaret sandra ashley kimberly emily donna michelle carol amanda dorothy melissa deborah stephanie rebecca sharon laura cynthia kathleen amy angela shirley anna brenda pamela emma nicole helen samantha katherine christine debra rachel carolyn janet catherine maria heather diane ruth julie olivia joyce virginia victoria kelly lauren christina joan evelyn judith megan andrea cheryl hannah jacqueline martha gloria teresa ann sara madison frances kathryn janice jean abigail alice judy sophia grace denise amber doris marilyn danielle beverly isabella theresa diana natalie brittany charlotte marie kayla alexis lori`.split(' '));

const BUSINESS_WORD = /\b(inc|incorporated|llc|llp|ltd|co|corp|corporation|company|mfg|manufacturing|fab\w*|weld\w*|machin\w*|metal\w*|steel|works|industr\w*|tool\w*|products?|shop|services?|group|enterprises?|solutions|systems?|design|laser|cnc|sons|brothers|bros|tactical|customs?|awnings?|arms|armor|motorsports?|racing|designs?|creations?|studios?|garage|automotive|repair|signs?|forge|foundry|plastics?|coatings?|electric|controls?|automation|truck\w*|transport\w*|logistic\w*|freight|express|carriers?|haul\w*|lines|delivery|cartage|moving|movers|towing|farms?|dairy|ranch|grain|feed|supply|fuel|oil|gas|waste|sand|gravel|aggregates?|excavating|construction|concrete|lumber|produce|foods?|distribut\w*|wholesale|transit|enterprises?)\b|[&\d]/i;

/**
 * True when a company name is only a person's name, such as "Matthew Moye" or
 * "Ross, Daniel" (sole proprietors on some directories). Those rows are
 * dropped so the output never holds a private individual's name on its own.
 */
export function looksLikePersonName(name) {
    if (!name) return false;
    const v = String(name).trim();
    if (BUSINESS_WORD.test(v)) return false;
    const words = v.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 3) return false;
    if (!words.every((w) => /^[A-Za-z][A-Za-z'-]*$/.test(w))) return false;
    if (words.length === 3 && !v.includes(',') && words[1].length > 1) return false; // only "First M Last"
    // "First Last", "First M Last", or "Last, First".
    const first = words[0].toLowerCase();
    const afterComma = v.includes(',') ? words[1].toLowerCase() : null;
    return FIRST_NAMES.has(first) || (afterComma != null && FIRST_NAMES.has(afterComma));
}

// Webmail and internet-provider domains: an address there says nothing about
// the company's own website.
const FREE_MAIL = new Set(`gmail.com googlemail.com yahoo.com ymail.com rocketmail.com aol.com aim.com hotmail.com outlook.com live.com msn.com
icloud.com me.com mac.com comcast.net verizon.net att.net sbcglobal.net bellsouth.net charter.net cox.net frontier.com frontiernet.net
windstream.net earthlink.net protonmail.com proton.me mail.com gmx.com gmx.us zoho.com yandex.com tds.net embarqmail.com centurylink.net
q.com juno.com netzero.net netzero.com rr.com roadrunner.com twc.com optonline.net optimum.net suddenlink.net mediacombb.net cableone.net
prodigy.net pacbell.net ameritech.net swbell.net flash.net wowway.com wavecable.com hughes.net hughesnet.com aol.net email.com usa.net
inbox.com fastmail.com hey.com yahoo.co.uk yahoo.com.mx hotmail.es outlook.es live.com.mx nc.rr.com att.com bex.net ptd.net
consolidated.net cox.com spectrum.net myfairpoint.net fairpoint.net midco.net centurytel.net cfl.rr.com tampabay.rr.com
kc.rr.com satx.rr.com austin.rr.com columbus.rr.com neo.rr.com woh.rr.com aol.co.uk outlook.com.mx`.split(/\s+/));

/** Company email domain ("acme@AcmeTrucking.com" -> "acmetrucking.com"); null for webmail/ISP domains. */
export function emailDomain(value) {
    const m = String(value ?? '').trim().toLowerCase().match(/^[^@\s]+@([a-z0-9.-]+\.[a-z]{2,})$/);
    if (!m) return null;
    const host = m[1].replace(/^(www|mail|email)\./, '');
    if (FREE_MAIL.has(host) || /\.(rr|edu|gov|mil)\./.test(`.${host}.`)) return null;
    return host;
}

/**
 * True when a domain plausibly belongs to the company: a distinctive word of
 * the company name (or its initials) appears in the domain's first label.
 * "rjtrucking.com" matches "R J Trucking LLC"; "dotcompliancehelp.com" does not
 * match "Smith Hauling Inc".
 */
export function domainMatchesName(domain, ...names) {
    if (!domain) return false;
    const label = domain.split('.').slice(-2, -1)[0] ?? '';
    const flat = label.replace(/[^a-z0-9]/g, '');
    const GENERIC = new Set(['trucking', 'transport', 'transportation', 'logistics', 'freight', 'express', 'services', 'service',
        'company', 'carriers', 'carrier', 'lines', 'hauling', 'group', 'enterprises', 'and', 'the', 'inc', 'llc', 'corp', 'ltd',
        'usa', 'america', 'american', 'national', 'transit', 'delivery', 'systems', 'solutions', 'co', 'of', 'dba']);
    for (const name of names.filter(Boolean)) {
        const words = String(name).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
        if (words.some((w) => w.length >= 4 && !GENERIC.has(w) && flat.includes(w))) return true;
        const initials = words.filter((w) => !['inc', 'llc', 'corp', 'ltd', 'co', 'the', 'of', 'and'].includes(w)).map((w) => w[0]).join('');
        if (initials.length >= 2 && flat.startsWith(initials) && flat.length <= initials.length + 12) return true;
        const joined = words.filter((w) => !['inc', 'llc', 'corp', 'ltd', 'co', 'the'].includes(w)).join('');
        if (joined.length >= 4 && (flat.includes(joined) || joined.includes(flat) && flat.length >= 5)) return true;
    }
    return false;
}

/** "20240318" -> "2024-03-18"; anything else -> null. */
export function ymd(value) {
    const m = String(value ?? '').match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m || m[1] < '1900') return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
}

/** True when a name contains a word that only businesses use (LLC, Trucking, Express, &, digits...). */
export function hasBusinessWord(name) {
    return BUSINESS_WORD.test(String(name ?? ''));
}

const MORE_BUSINESS_WORDS = /(trans|fleet|freight|cargo|haul|truck|logist|express)|\b(limited|trailers?|hotshot|usa|worldwide|global|international|intl|holdings?|partners|ventures|shipping|auto|motors?|equipment|rentals?|leasing|towing|xpress|exp|carrier|line|inc|corp)\b/i;

/**
 * Stricter person-name test for registries full of one-person registrations:
 * any 2-4 word, letters-only name with no business word at all ("Ethel Jean
 * Bush", "Garcia Juan") is treated as a person's name.
 */
export function mayBePersonName(name) {
    if (!name) return false;
    if (looksLikePersonName(name)) return true;
    const v = String(name).trim();
    if (hasBusinessWord(v) || MORE_BUSINESS_WORDS.test(v)) return false;
    const words = v.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Za-z][A-Za-z'-]*$/.test(w));
}
