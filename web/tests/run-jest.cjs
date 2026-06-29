#!/usr/bin/env node

const { spawnSync } = require('child_process');

process.env.TZ = process.env.TZ || 'America/New_York';

let jestBin;
try {
  jestBin = require.resolve('jest/bin/jest');
} catch (error) {
  console.error('Unable to find Jest. Run `npm install` in the web directory first.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [jestBin, '--config=jest.config.cjs', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
