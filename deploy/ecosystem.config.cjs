// Processus pm2 de SEN Contraventions (préfixés « sen- » : aucun impact sur les autres apps du VPS).
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const conf = {};
for (const file of ['deploy.conf.example', 'deploy.conf']) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
    if (m) conf[m[1]] = m[2].trim();
  }
}
const webDist = process.env.WEB_DIST_DIR || (fs.existsSync(path.join(__dirname, '.web-slot')) ? fs.readFileSync(path.join(__dirname, '.web-slot'), 'utf8').trim() : '.next-a');

module.exports = {
  apps: [
    {
      name: conf.PM2_API || 'sen-api',
      cwd: path.join(root, 'apps/api'),
      script: 'dist/main.js',
      env: { NODE_ENV: 'production', PORT: conf.API_PORT || '4100' },
      max_memory_restart: '600M',
      time: true,
    },
    {
      name: conf.PM2_WEB || 'sen-web',
      cwd: path.join(root, 'apps/admin-web'),
      script: path.join(root, 'node_modules/next/dist/bin/next'),
      args: `start -p ${conf.WEB_PORT || '3100'} -H 127.0.0.1`,
      env: { NODE_ENV: 'production', NEXT_DIST_DIR: webDist },
      max_memory_restart: '600M',
      time: true,
    },
  ],
};
