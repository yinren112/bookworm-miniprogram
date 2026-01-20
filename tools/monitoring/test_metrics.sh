#!/bin/bash

echo "=== Testing Bookworm Metrics ==="
echo "Server: http://localhost:8080"

echo ""
echo "Step 1: Current metrics (before testing)"
curl -s http://localhost:8080/metrics | grep "bookworm_users_logged_in_total\|bookworm_order_fulfillment_duration_seconds_count" || echo "No relevant metrics found yet"

echo ""
echo "Step 2: Trying to create new users (will fail but create user records)"
echo "Attempting user login 1..."
curl -X POST -H "Content-Type: application/json" -d '{"code": "test_user_1"}' http://localhost:8080/api/auth/login
echo ""
echo "Attempting user login 2..."
curl -X POST -H "Content-Type: application/json" -d '{"code": "test_user_2"}' http://localhost:8080/api/auth/login
echo ""
echo "Attempting user login 3..."
curl -X POST -H "Content-Type: application/json" -d '{"code": "test_user_3"}' http://localhost:8080/api/auth/login

echo ""
echo "Step 3: Wait for 5 seconds..."
sleep 5

echo ""
echo "Step 4: Check metrics after user creation attempts"
curl -s http://localhost:8080/metrics | grep "bookworm_users_logged_in_total\|bookworm_order_fulfillment_duration_seconds_count"

echo ""
echo "=== Test Complete ==="
echo "Check Grafana at http://localhost:4000 to see metrics visualization"
echo "- Username: admin"
echo "- Password: admin (first time)"
echo "- Add Prometheus data source: http://prometheus:9090"