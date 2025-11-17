# Load Test Results (2025-11-16)

- **Scenario**: `health-smoke` (HTTP GET `/api/health`), 10 VU, 30s.
- **Environment**: local dev (`docker compose` Postgres + `node dist/src/index.js`).
- **Command**:
  ```
  BASE_URL=http://localhost:8080 VU=10 DURATION_SECONDS=30 node tools/load-testing/health-smoke.js
  ```
- **Metrics**:
  - Total requests: **41,421**
  - Failures: **0** (failure rate 0.0000)
  - Latency (ms): avg **7.23**, p50 **5.93**, p95 **10.87**
- **Notes**:
  - Targeted `/api/health` to validate stack readiness; no auth required.
  - For business endpoints (orders/payments), reuse k6 scripts with real JWT from `scripts/generate-load-test-tokens.ts` and stage databases.
