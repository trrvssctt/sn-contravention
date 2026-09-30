/** Dev : nest build --watch → correction des chemins → (re)démarrage de l'API. */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
let server = null;

function restart() {
  require('child_process').execFileSync('node', [path.join(__dirname, 'fix-swagger-paths.js')]);
  if (server) server.kill();
  server = spawn('node', ['dist/main.js'], { cwd: root, stdio: 'inherit' });
}

const build = spawn('npx', ['nest', 'build', '--watch', '--preserveWatchOutput'], { cwd: root });
build.stdout.on('data', (d) => {
  const s = d.toString();
  process.stdout.write(s);
  if (/Found 0 errors/.test(s)) restart();
});
build.stderr.pipe(process.stderr);
process.on('SIGINT', () => {
  server?.kill();
  build.kill();
  process.exit(0);
});
