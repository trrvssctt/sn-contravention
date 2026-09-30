/**
 * Contournement d'un bug du plugin @nestjs/swagger : quand le chemin du projet contient
 * des caractères accentués (ex. « Téléchargements »), il émet des require() absolus vers src/.
 * On les réécrit en chemins relatifs vers dist/.
 */
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const src = path.join(__dirname, '..', 'src');
const re = /require\("([^"]+)"\)/g;

function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (p.endsWith('.js')) fix(p);
  }
}

function fix(file) {
  const code = fs.readFileSync(file, 'utf8');
  let changed = false;
  const out = code.replace(re, (m, raw) => {
    const target = JSON.parse(`"${raw}"`);
    if (!target.startsWith(src + path.sep)) return m;
    let rel = path.relative(path.dirname(file), path.join(dist, path.relative(src, target)));
    if (!rel.startsWith('.')) rel = './' + rel;
    changed = true;
    return `require("${rel.split(path.sep).join('/')}")`;
  });
  if (changed) fs.writeFileSync(file, out);
}

walk(dist);
