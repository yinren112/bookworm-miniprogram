const { resolveContentWithFallback } = require('../utils/content-resolver');

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${expected} but got ${actual}`);
  }
}

async function expectReject(promise, label) {
  let rejected = false;
  try {
    await promise;
  } catch (e) {
    rejected = true;
  }
  if (!rejected) {
    throw new Error(`${label} expected reject`);
  }
}

async function run() {
  const localTerms = await resolveContentWithFallback(
    'terms-of-service',
    async () => {
      const err = new Error('mock 404');
      err.statusCode = 404;
      throw err;
    }
  );
  assertEqual(localTerms.source, 'local', 'terms-source');

  const localPrivacy = await resolveContentWithFallback(
    'privacy-policy',
    async () => {
      const err = new Error('mock 500');
      err.statusCode = 500;
      throw err;
    }
  );
  assertEqual(localPrivacy.source, 'local', 'privacy-source');

  await expectReject(
    resolveContentWithFallback('unknown-slug', async () => {
      throw new Error('mock fail');
    }),
    'unknown-no-fallback',
  );
}

run()
  .then(() => process.stdout.write('OK\n'))
  .catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
    process.exit(1);
  });

