import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikePersonName, formatPhone, websiteDomain, cleanWebsite, prettyName, companyEmail, stateAbbr, nameKey } from '../src/normalize.js';
import { zipCentroid, distanceMiles, zipState, statesWithinRadius } from '../src/geo.js';

test('phones', () => {
    assert.equal(formatPhone('6145550100'), '(614) 555-0100');
    assert.equal(formatPhone('+1 614-555-0100'), '(614) 555-0100');
    assert.equal(formatPhone('614.555.0100 ext 22'), '(614) 555-0100');
    assert.equal(formatPhone('555-0100'), null);
});

test('websites and domains', () => {
    assert.equal(cleanWebsite('www.acmefab.com'), 'http://www.acmefab.com/');
    assert.equal(websiteDomain('https://www.AcmeFab.com/about'), 'acmefab.com');
    assert.equal(websiteDomain('https://www.facebook.com/acmefab'), null);
    assert.equal(cleanWebsite('N/A'), null);
});

test('names, states and emails', () => {
    assert.equal(prettyName('ACRODYNE MFG. CO'), 'Acrodyne Mfg. Co');
    assert.equal(prettyName('ACME CNC LLC'), 'Acme CNC LLC');
    assert.equal(prettyName('R.P. GATTA, INC.'), 'R.P. Gatta, Inc.');
    assert.equal(prettyName('Already Mixed Case Inc'), 'Already Mixed Case Inc');
    assert.equal(stateAbbr('Ohio'), 'OH');
    assert.equal(stateAbbr('oh'), 'OH');
    assert.equal(companyEmail('Sales@AcmeFab.com'), 'sales@acmefab.com');
    assert.equal(companyEmail('jane.example@acmefab.com'), null);
    assert.equal(nameKey('The Acme Fab Co., Inc.'), nameKey('ACME FAB'));
});

test('ZIP geography', () => {
    const cle = zipCentroid('44114');
    const col = zipCentroid('43215');
    assert.ok(cle && col);
    const d = distanceMiles(cle, col);
    assert.ok(d > 100 && d < 130, `Cleveland to Columbus was ${d}`);
    assert.equal(zipState('44114'), 'OH');
    assert.equal(zipState('90210'), 'CA');
    const near = statesWithinRadius(zipCentroid('45202'), 30); // Cincinnati touches KY and IN
    assert.ok(['OH', 'KY', 'IN'].every((s) => near.includes(s)), near.join());
});

test('person-only names are recognised', () => {
    assert.ok(looksLikePersonName('MATTHEW MOYE'));
    assert.ok(looksLikePersonName("Mary O'Neil"));
    assert.ok(!looksLikePersonName('Matthew Moye Welding'));
    assert.ok(!looksLikePersonName('Moye & Sons'));
    assert.ok(!looksLikePersonName('Lextech Industries'));
    assert.ok(!looksLikePersonName('Fab Form'));
    assert.ok(!looksLikePersonName('Compco'));
    assert.ok(looksLikePersonName('Ross, Daniel'));
    assert.ok(!looksLikePersonName('Wolfpack Workshop'));
    assert.ok(!looksLikePersonName('Curtis Tactical'));
    assert.ok(!looksLikePersonName('Bruce Custom Awnings'));
    assert.ok(looksLikePersonName('John Q Public'));
});
