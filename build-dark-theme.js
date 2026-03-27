/**
 * build-dark-theme.js — Transform the Ghibli map style into a dark theme
 * Run: node build-dark-theme.js
 */
const fs = require('fs');

const style = JSON.parse(fs.readFileSync('public/styles/maplibre-style.json', 'utf8'));

style.name = 'Transit-Live Melbourne — Dark Edition';
style.sprite = 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark';

// Color mapping: light → dark
const colorMap = {
  // Backgrounds and land
  '#dceccf': '#1a1a2e',   // background (pastel green → deep navy)
  '#b5d99c': '#1e1e32',   // earth
  '#f5f5dc': '#1a1a2e',   // beige
  '#eef3e5': '#1e1e32',   // light green land

  // Water
  '#a4c9e0': '#0d1b2a',   // water → deep dark blue
  '#c0dae8': '#0d1b2a',
  '#b0d4e8': '#0d1b2a',

  // Roads
  '#ffffff': '#2a2a44',    // white roads → dark grey-blue
  '#f0f0f0': '#252540',
  '#e8e8e8': '#222238',
  '#faf5e8': '#252540',    // warm white
  '#f5efe0': '#222238',
  '#f8f4ec': '#2a2a44',

  // Buildings
  '#dcd8c8': '#1e1e35',
  '#d8d4c4': '#1c1c30',
  '#e0dcd0': '#202038',

  // Parks
  '#c8e6b4': '#142214',   // parks → dark green
  '#d4ecc0': '#162416',
  '#cce8b8': '#152515',

  // Labels
  '#333333': '#e0e0e0',   // dark text → light text
  '#555555': '#b0b0c0',
  '#666666': '#9090a0',
  '#444444': '#c8c8d8',

  // Boundaries
  '#cccccc': '#333350',
  '#999999': '#444466',
};

function transformColor(color) {
  if (!color || typeof color !== 'string') return color;
  const upper = color.toUpperCase();
  for (const [from, to] of Object.entries(colorMap)) {
    if (upper === from.toUpperCase()) return to;
  }
  // Generic light→dark transformation for unmapped colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const brightness = (r + g + b) / 3;
      // Invert bright colors to dark, keep already-dark colors
      if (brightness > 180) {
        const nr = Math.max(0, Math.round(255 - r) * 0.25 + 20);
        const ng = Math.max(0, Math.round(255 - g) * 0.25 + 20);
        const nb = Math.max(0, Math.round(255 - b) * 0.25 + 40);
        return '#' + [nr, ng, nb].map(c => c.toString(16).padStart(2, '0')).join('');
      }
    }
  }
  return color;
}

function transformValue(val) {
  if (typeof val === 'string') return transformColor(val);
  if (Array.isArray(val)) return val.map(transformValue);
  if (typeof val === 'object' && val !== null) {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = transformValue(v);
    }
    return out;
  }
  return val;
}

// Transform all layers
for (const layer of style.layers) {
  if (layer.paint) layer.paint = transformValue(layer.paint);
  // Make text lighter
  if (layer.type === 'symbol' && layer.paint) {
    if (layer.paint['text-color']) {
      const tc = layer.paint['text-color'];
      if (typeof tc === 'string' && !tc.includes('rgba')) {
        layer.paint['text-color'] = '#d0d0e0';
      }
    }
    if (layer.paint['text-halo-color']) {
      layer.paint['text-halo-color'] = 'rgba(20,20,40,0.8)';
    }
  }
}

fs.writeFileSync('public/styles/maplibre-dark.json', JSON.stringify(style, null, 2));
console.log('✓ Dark theme written to public/styles/maplibre-dark.json');
