// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// --- Custom Metrics ---
const orderCreationErrors = new Counter('order_creation_errors');
const inventoryFetchErrors = new Counter('inventory_fetch_errors');

// --- Configuration ---
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// --- Test Data ---
// In a real staging environment, you'd generate these tokens properly.
// For now, we'll create users on-the-fly using a test endpoint.
// Each VU will have its own user to simulate real concurrency.

// --- Main Test Logic ---
export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Ramp-up to 20 virtual users over 30s
    { duration: '1m', target: 20 },  // Stay at 20 VU for 1 minute
    { duration: '10s', target: 0 },   // Ramp-down
  ],
  thresholds: {
    'http_req_failed': ['rate<0.01'], // < 1% failed requests
    'http_req_duration': ['p(95)<800'], // 95% of requests must complete below 800ms
  },
};

export default function () {
  // Each VU gets a unique test user
  const uniqueOpenId = `load-test-user-${__VU}-${__ITER}`;

  // 1. Get auth token using test-login endpoint
  const authPayload = JSON.stringify({
    openId: uniqueOpenId,
    nickname: `Load Tester ${__VU}`,
    avatarUrl: 'https://example.com/avatar.png'
  });

  const authRes = http.post(`${BASE_URL}/api/auth/test-login`, authPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const authCheckPassed = check(authRes, {
    'auth successful': (r) => r.status === 200
  });

  if (!authCheckPassed) {
    console.error(`Auth failed: ${authRes.status} ${authRes.body}`);
    return;
  }

  const authData = authRes.json();
  const authToken = authData.token;
  const authHeaders = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };

  // 2. Browse available books
  const inventoryRes = http.get(`${BASE_URL}/api/inventory/available?limit=50`);
  const inventoryCheckPassed = check(inventoryRes, {
    'browse inventory successful': (r) => r.status === 200
  });

  if (!inventoryCheckPassed) {
    inventoryFetchErrors.add(1);
    console.error(`Inventory fetch failed: ${inventoryRes.status} ${inventoryRes.body}`);
    return;
  }

  const inventoryData = inventoryRes.json();
  const items = inventoryData.data;

  if (!items || items.length === 0) {
    console.log('No inventory items available, skipping order creation');
    return;
  }

  // 3. Get details of a random book
  const randomItem = items[Math.floor(Math.random() * items.length)];
  const itemDetailRes = http.get(`${BASE_URL}/api/inventory/item/${randomItem.id}`);
  check(itemDetailRes, {
    'item detail fetch successful': (r) => r.status === 200
  });

  // 4. Attempt to create an order
  const createOrderPayload = JSON.stringify({
    inventoryItemIds: [randomItem.id]
  });

  const orderRes = http.post(`${BASE_URL}/api/orders/create`, createOrderPayload, {
    headers: authHeaders,
  });

  const orderCheckPassed = check(orderRes, {
    'order creation attempted': (r) => r.status === 201 || r.status === 409,
  });

  if (!orderCheckPassed) {
    orderCreationErrors.add(1);
    console.error(`Unexpected order response: ${orderRes.status} ${orderRes.body}`);
  }

  sleep(1); // Think time between user actions
}

// Export a function to generate test summary
export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
  };
}
