// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// --- Custom Metrics ---
const orderCreationErrors = new Counter('order_creation_errors');
const inventoryFetchErrors = new Counter('inventory_fetch_errors');
const expectedConflictErrors = new Rate('expected_conflict_errors'); // Rate of 409 responses

// --- Configuration ---
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8081'; // Targeting a known good instance
const AUTH_TOKEN = __ENV.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  throw new Error('AUTH_TOKEN env var is required for load-test.js');
}

const authHeaders = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json',
};

export const options = {
  stages: [
    { duration: '20s', target: 10 }, // Shorter, more focused test
    { duration: '30s', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    // Only count actual failures (5xx, timeouts, network errors) - not 409 conflicts
    'http_req_failed{name:CreateOrder}': ['rate<0.01'], // Less than 1% real failures
    // Track conflict rate separately
    'expected_conflict_errors': ['rate>=0'], // Just monitor, don't fail
  },
};

export default function () {
  const inventoryRes = http.get(`${BASE_URL}/api/inventory/available?limit=100`, { headers: authHeaders });
  if (inventoryRes.status !== 200) {
    inventoryFetchErrors.add(1);
    return;
  }

  const inventoryData = inventoryRes.json();
  const items = inventoryData.data;
  if (!items || items.length === 0) return;

  const randomItem = items[Math.floor(Math.random() * items.length)];

  const createOrderPayload = JSON.stringify({
    inventoryItemIds: [randomItem.id],
  });

  const orderRes = http.post(`${BASE_URL}/api/orders/create`, createOrderPayload, {
    headers: authHeaders,
    tags: { name: 'CreateOrder' }, // Tag for threshold filtering
    // Tell k6 that 409 is an expected response, not a failure
    responseCallback: http.expectedStatuses(201, 409),
  });

  const isSuccessful = check(orderRes, {
    'order creation successful (201)': (r) => r.status === 201,
    'expected conflict (409)': (r) => r.status === 409,
  });

  if (orderRes.status === 409) {
    expectedConflictErrors.add(1);
  }

  if (!isSuccessful) {
    orderCreationErrors.add(1);
    if (__ITER < 5) {
      console.error(`Order creation failed! Status: ${orderRes.status}, Body: ${orderRes.body}`);
    }
  }

  sleep(1);
}