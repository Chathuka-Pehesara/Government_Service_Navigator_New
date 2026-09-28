// k6 load test for the citizen applications list (docs/performance-and-redis.md, section 8.4).
// Run against a Neon *branch*, never the production database:
//   k6 run -e API_BASE=http://localhost:5119 -e CITIZEN_TOKEN=eyJ... load/my-applications.js
// Every virtual user shares one token, so the per-user rate limit applies to all of them together:
// start the API with RATE_LIMIT_PER_MINUTE=100000 for the test run.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 200 },
    { duration: '3m', target: 1000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE = __ENV.API_BASE || 'http://localhost:5119';
const TOKEN = __ENV.CITIZEN_TOKEN;

export default function () {
  const res = http.get(`${BASE}/api/verification/my-applications`, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Accept-Encoding': 'br, gzip' },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(30); // matches the app's 30 s fallback poll
}
