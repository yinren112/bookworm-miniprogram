// scripts/generate-load-test-tokens.ts
// Generates temporary JWT tokens for load testing
// Linus式原则：Never hardcode credentials, always generate them dynamically

import { createSigner } from 'fast-jwt';
import * as fs from 'fs';
import * as path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-for-dev';
const OUTPUT_FILE = path.join(__dirname, '../../.env.load-test');

interface TokenPayload {
  userId: number;
  openid: string;
}

async function generateTokens() {
  const signer = createSigner({ key: JWT_SECRET, expiresIn: '7d' });

  // Generate USER token
  const userPayload: TokenPayload = {
    userId: 999991, // Use high ID to avoid conflicts with real users
    openid: 'loadtest-user-' + Date.now(),
  };
  const userToken = await signer(userPayload);

  // Generate STAFF token
  const staffPayload: TokenPayload = {
    userId: 999992, // Use high ID to avoid conflicts with real users
    openid: 'loadtest-staff-' + Date.now(),
  };
  const staffToken = await signer(staffPayload);

  // Write to .env.load-test file
  const envContent = `# Auto-generated tokens for load testing
# Generated at: ${new Date().toISOString()}
# SECURITY: These tokens are temporary and should NEVER be committed to Git
# WARNING: Regenerate before each load test run

AUTH_TOKEN=${userToken}
STAFF_TOKEN=${staffToken}
TEST_USER_ID=999991
`;

  fs.writeFileSync(OUTPUT_FILE, envContent, 'utf-8');

  console.log('✅ Load test tokens generated successfully');
  console.log(`📁 Tokens saved to: ${OUTPUT_FILE}`);
  console.log('');
  console.log('⚠️  SECURITY REMINDER:');
  console.log('   - These tokens are valid for 7 days');
  console.log('   - Never commit .env.load-test to version control');
  console.log('   - Regenerate tokens before each load test run');
  console.log('');
  console.log('📋 Usage:');
  console.log('   PowerShell:');
  console.log('     Get-Content .env.load-test | ForEach-Object { if ($_ -match "^([^#].*)=(.*)$") { [Environment]::SetEnvironmentVariable($matches[1], $matches[2]) } }');
  console.log('   Then run: .\\scripts\\run-load-tests.ps1');
}

generateTokens().catch((error) => {
  console.error('Failed to generate tokens:', error);
  process.exit(1);
});
