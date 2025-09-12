// src/tests/integration-setup.ts
import { beforeAll, afterAll } from 'vitest';
import prisma from '../db';

beforeAll(async () => {
  // Logic to connect to your TEST database.
  // Make sure your DATABASE_URL in the test environment points to a test DB.
  console.log('Connecting to the test database...');
  await prisma.$connect();
});

afterAll(async () => {
  console.log('Disconnecting from the test database...');
  await prisma.$disconnect();
});