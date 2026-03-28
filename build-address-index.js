/**
 * build-address-index.js — Process OSM address data into a searchable index
 *
 * Assigns suburbs to addresses using nearest-suburb reverse geocoding.
 * Run: node build-address-index.js
 * Output: addresses.tsv (streamed by server, zero RAM cost)
 */

const fs = require('fs');

// Load suburb centers for reverse geocoding
console.log('Loading suburb data…');
const suburbData = JSON.parse(fs.readFileSync('melbourne_suburbs.json', 'utf8'));
const suburbs = suburbData.elements
  .filter(e => e.tags?.name && e.lat && e.lon)
  .map(e => ({ name: e.tags.name, lat: e.lat, lng: e.lon }));
console.log(`  ${suburbs.length} suburbs loaded`);

function nearestSuburb(lat, lng) {
  let best = null, bestDist = Infinity;
  for (const s of suburbs) {
    const d = (s.lat - lat) ** 2 + (s.lng - lng) ** 2;
    if (d < bestDist) { bestDist = d; best = s.name; }
  }
  return best || '';
}

// Load raw addresses
console.log('Loading addresses…');
const raw = JSON.parse(fs.readFileSync('melbourne_addresses.json', 'utf8'));
const elements = raw.elements || [];
console.log(`  ${elements.length} raw nodes`);

const addresses = [];
const seen = new Set();

for (const el of elements) {
  if (!el.tags) continue;
  const num    = (el.tags['addr:housenumber'] || '').trim();
  const street = (el.tags['addr:street'] || '').trim();
  let suburb   = (el.tags['addr:suburb'] || el.tags['addr:city'] || '').trim();
  const post   = (el.tags['addr:postcode'] || '').trim();

  if (!num || !street) continue;

  // Assign suburb if missing
  if (!suburb) suburb = nearestSuburb(el.lat, el.lon);

  const display = `${num} ${street}, ${suburb}${post ? ' ' + post : ''}`;
  const key = display.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);

  addresses.push(`${display}\t${(+el.lat).toFixed(5)}\t${(+el.lon).toFixed(5)}`);
}

console.log(`  ${addresses.length} unique addresses`);
addresses.sort();

fs.writeFileSync('addresses.tsv', addresses.join('\n'));
const sizeMB = (fs.statSync('addresses.tsv').size / 1024 / 1024).toFixed(1);
console.log(`  → addresses.tsv: ${sizeMB} MB`);

// Verify suburb coverage
let withSuburb = 0;
for (const line of addresses) {
  if (line.split('\t')[0].includes(',')) withSuburb++;
}
console.log(`  Suburb coverage: ${withSuburb}/${addresses.length} (${(withSuburb/addresses.length*100).toFixed(1)}%)`);
