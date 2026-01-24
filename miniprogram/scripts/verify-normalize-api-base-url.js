const { normalizeApiBaseUrl } = require('../utils/url');

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${expected} but got ${actual}`);
  }
}

function run() {
  assertEqual(
    normalizeApiBaseUrl('192.168.0.2：8080'),
    'http://192.168.0.2:8080/api',
    'fullwidth-colon'
  );

  assertEqual(
    normalizeApiBaseUrl('http：//192.168.0.2：8080/'),
    'http://192.168.0.2:8080/api',
    'fullwidth-scheme-and-colon'
  );

  assertEqual(
    normalizeApiBaseUrl('`192.168.0.2:8080`'),
    'http://192.168.0.2:8080/api',
    'backticks-wrapped'
  );

  assertEqual(
    normalizeApiBaseUrl('`http://192.168.0.2:8080/api`'),
    'http://192.168.0.2:8080/api',
    'backticks-wrapped-full'
  );

  assertEqual(
    normalizeApiBaseUrl('https://api.example.com'),
    'https://api.example.com/api',
    'https-domain'
  );

  assertEqual(
    normalizeApiBaseUrl('https://api.example.com/api'),
    'https://api.example.com/api',
    'already-has-api'
  );
}

run();
process.stdout.write('OK\n');
