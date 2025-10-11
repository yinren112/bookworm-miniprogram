// load-test-v2.js
// Targets the new, single-step sell order creation endpoint.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// --- Metrics ---
const sellOrderErrors = new Counter('sell_order_errors');
const sellOrderSuccessRate = new Rate('sell_order_success_rate');

// --- Configuration ---
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8081'; // Target a known good instance
const STAFF_TOKEN = __ENV.STAFF_TOKEN;
const TEST_USER_ID = Number(__ENV.TEST_USER_ID || 1); // The ID of the user we are creating sell orders for (must exist beforehand)

if (!STAFF_TOKEN) {
  throw new Error('STAFF_TOKEN env var is required for load-test-v2.js');
}

const authHeaders = {
  Authorization: 'Bearer ' + STAFF_TOKEN,
  'Content-Type': 'application/json',
};

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_failed{status:500}': ['rate<=0'], // No 500 errors allowed
    'http_req_duration{scenario:create_sell_order}': ['p(95)<1000'], // Sell orders should be fast
    // Linus式财务操作：失败率应该接近于零
    // 1% failure rate means 1 out of 100 financial transactions is lost - unacceptable
    // For financial operations, we demand 99.9% success rate (0.1% allowed failure)
    // This allows for rare transient errors (network hiccups) but catches real bugs
    'sell_order_success_rate': ['rate>0.999'], // Max 0.1% failure rate for financial ops
  },
};

export default function () {
  // Each virtual user simulates an operator creating a sell order.
  const payload = JSON.stringify({
    userId: TEST_USER_ID,
    totalWeightKg: Math.random() * 10 + 1, // Random weight between 1 and 11 kg
    unitPrice: 200, // 2.00 yuan/kg in cents
    settlementType: Math.random() > 0.5 ? 'CASH' : 'VOUCHER',
    notes: 'k6 iteration ' + __ITER,
  });

  const res = http.post(BASE_URL + '/api/sell-orders', payload, {
    headers: authHeaders,
    tags: { scenario: 'create_sell_order' },
  });

  const isSuccessful = check(res, {
    'sell order creation successful': (r) => r.status === 201,
  });

  sellOrderSuccessRate.add(isSuccessful);

  if (!isSuccessful) {
    sellOrderErrors.add(1);
    if (__ITER < 5) {
      console.error('Sell order creation failed! Status: ' + res.status + ', Body: ' + res.body);
    }
  }

  sleep(2); // Operators need some time between transactions
}