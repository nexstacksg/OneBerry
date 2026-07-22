import { execFileSync } from 'node:child_process';
import path from 'node:path';

describe('layout engine', () => {
  test('passes TypeScript engine unit tests', () => {
    const testFile = path.resolve(process.cwd(), 'tests/layout-engine-node-test.mjs');
    expect(() => {
      execFileSync(process.execPath, ['--experimental-strip-types', testFile], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });
    }).not.toThrow();
  });
});
