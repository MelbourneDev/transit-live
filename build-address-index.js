/**
 * build-address-index.js — Process OSM address data into a compact search index
 *
 * Run: node build-address-index.js
 * Output: addresses.json (loaded by server.js at startup)
 */

const fs = require('fs');

console.log('Loading addresses…');
const raw = JSON.parse(fs.readFileSync('melbourne_addresses.json', 'utf8'));
const elements = raw.elements || [];
console.log(`  ${elements.length} raw address nodes`);

const addresses = [];
const seen = new Set();

for (const el of elements) {
  if (!el.tags) continue;
  const num    = (el.tags['addr:housenumber'] || '').trim();
  const street = (el.tags['addr:street'] || '').trim();
  const suburb = (el.tags['addr:suburb'] || el.tags['addr:city'] || '').trim();
  const post   = (el.tags['addr:postcode'] || '').trim();

  if (!num || !street) continue;

  const display = suburb
    ? `${num} ${street}, ${suburb}${post ? ' ' + post : ''}`
    : `${num} ${street}${post ? ', ' + post : ''}`;

  const key = display.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);

  // Compact format: [display, lat, lng]
  addresses.push([display, +(el.lat.toFixed(5)), +(el.lon.toFixed(5))]);
}

console.log(`  ${addresses.length} unique addresses`);
addresses.sort((a, b) => a[0].localeCompare(b[0]));

const output = JSON.stringify(addresses);
fs.writeFileSync('addresses.json', output);
const sizeMB = (Buffer.byteLength(output) / 1024 / 1024).toFixed(1);
console.log(`  → addresses.json: ${sizeMB} MB`);

// Stats
const suburbs = new Set(addresses.map(a => {
  const parts = a[0].split(', ');
  return parts[1] || '';
}).filter(Boolean));
console.log(`  Suburbs: ${suburbs.size}`);
