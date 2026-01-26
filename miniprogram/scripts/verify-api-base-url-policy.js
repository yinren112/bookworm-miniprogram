const { enforceApiBaseUrlPolicy } = require('../utils/url');

function expectThrow(fn, label) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) {
    throw new Error(`${label} expected throw`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${expected} but got ${actual}`);
  }
}

function run() {
  assertEqual(
    enforceApiBaseUrlPolicy('http://localhost:8080/api', { envVersion: 'develop', platform: 'devtools' }),
    'http://localhost:8080/api',
    'develop-devtools-allows-http',
  );

  expectThrow(
    () => enforceApiBaseUrlPolicy('http://api.example.com/api', { envVersion: 'trial', platform: '' }),
    'trial-rejects-http',
  );

  expectThrow(
    () => enforceApiBaseUrlPolicy('http://api.example.com/api', { envVersion: 'release', platform: '' }),
    'release-rejects-http',
  );

  assertEqual(
    enforceApiBaseUrlPolicy('https://api.example.com/api', { envVersion: 'trial', platform: '' }),
    'https://api.example.com/api',
    'trial-allows-https',
  );
}

run();
process.stdout.write('OK\n');

