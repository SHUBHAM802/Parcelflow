/**
 * ParcelFlow End-to-End Pipeline Verification Script
 * Validates the complete physical conveyor + optical QR + robotic sorting flow.
 * Run with: node scripts/e2e-happy-path.cjs
 */

require('dotenv').config();
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DEVICE_TOKEN = process.env.DEVICE_TOKEN || 'deadbeefcafebabedeadbeefcafebabedeadbeefcafebabe1234567890abcdef';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : {};
            resolve({ status: res.statusCode, body: parsed, raw });
          } catch {
            resolve({ status: res.statusCode, body: null, raw });
          }
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runE2E() {
  console.log('\n======================================================');
  console.log('  PARCELFLOW — AUTOMATED E2E PIPELINE VERIFICATION   ');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;
  let operatorToken = '';

  function logStep(stepNum, name, success, detail = '') {
    if (success) {
      passed++;
      console.log(`  [PASS] Step ${stepNum}: ${name} ${detail ? `(${detail})` : ''}`);
    } else {
      failed++;
      console.log(`  [FAIL] Step ${stepNum}: ${name} — ${detail}`);
    }
  }

  try {
    // Step 1: Health check
    const health = await request('GET', '/api/health');
    logStep(1, 'Backend Health Check', health.status === 200, `Mode: ${health.body?.mode || 'simulator'}`);

    // Step 2: Operator Login
    const loginRes = await request('POST', '/api/auth/login', {
      email: 'operator@parcelflow.com',
      password: 'demo123'
    });
    operatorToken = loginRes.body?.token;
    logStep(2, 'Operator Authentication', loginRes.status === 200 && !!operatorToken, 'Token obtained');

    const authHeader = { Authorization: `Bearer ${operatorToken}` };

    // Step 3: Create Demo Packed Order
    const demoRes = await request('POST', '/api/operator/demo-order', {}, authHeader);
    const orderId = demoRes.body?.orderId;
    const parcelId = demoRes.body?.parcel?.id;
    const labelPayload = demoRes.body?.labelPayload;
    const binLabel = demoRes.body?.bin?.label;
    logStep(3, 'Generate Demo Order & Label', demoRes.status === 200 && !!labelPayload, `${orderId} -> ${parcelId}`);

    // Step 4: Record Label Printed
    const printRes = await request('POST', '/api/warehouse/labels/printed', { parcelId }, authHeader);
    logStep(4, 'Confirm Label Print Recorded', printRes.status === 200, parcelId);

    // Step 5: Camera Scans QR Code
    const scanRes = await request('POST', '/api/operator/scan', {
      payload: labelPayload,
      source: 'browser_camera',
      decodeMs: 35
    }, authHeader);
    logStep(5, 'Optical QR Scan Validation', scanRes.body?.result === 'ACCEPTED', `Routing: ${scanRes.body?.bin?.label || binLabel}`);

    // Step 6: Conveyor Movement & IR2 Detection at Pick Point
    const irRes = await request('POST', '/api/hardware/ir-event', {
      deviceId: 'conveyor-esp32',
      sensorId: 'IR2',
      state: 'TRIGGERED',
      seq: Date.now() % 100000,
      ts: Date.now()
    }, { 'X-Device-Token': DEVICE_TOKEN });
    logStep(6, 'IR2 Break-Beam Sensor Actuation', irRes.body?.success === true, 'Matched to parcel');

    // Step 7: Robotic Arm Fetches Released Command
    const cmdRes = await request('GET', '/api/hardware/commands/next?deviceId=arm-esp32', null, { 'X-Device-Token': DEVICE_TOKEN });
    const cmdId = cmdRes.body?.commandId;
    logStep(7, 'Robotic Arm Command Dispatch', cmdRes.status === 200 && !!cmdId, `Command ID: ${cmdId?.slice(0, 8)}...`);

    // Step 8: Arm Sends ACK
    const ackRes = await request('POST', `/api/hardware/commands/${cmdId}/ack`, {}, { 'X-Device-Token': DEVICE_TOKEN });
    logStep(8, 'ESP32 Command Acknowledgment (ACK)', ackRes.body?.success === true, 'State -> SORTING');

    // Step 9: Arm Actuates & Sends COMPLETE
    const completeRes = await request('POST', `/api/hardware/commands/${cmdId}/complete`, {
      result: 'OK',
      durationMs: 1950
    }, { 'X-Device-Token': DEVICE_TOKEN });
    logStep(9, 'Servo Placement Complete (DONE)', completeRes.body?.success === true, 'Duration: 1950ms');

    // Step 10: Verify Pipeline State Snapshot
    const snapRes = await request('GET', '/api/operator/pipeline/state', null, authHeader);
    const sortedBin = snapRes.body?.bins?.find(b => b.label === binLabel);
    logStep(10, 'Verify Final Database State & Bin Increments', snapRes.status === 200 && sortedBin?.parcel_count > 0, `Bin count: ${sortedBin?.parcel_count}`);

    console.log('\n------------------------------------------------------');
    console.log(`  E2E Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('------------------------------------------------------\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n[FATAL] E2E Execution failed:', err.message);
    process.exit(1);
  }
}

runE2E();
