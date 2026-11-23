// stress_test.mjs — Real Concurrency & Adversarial Gate Benchmark for CampusHub
// Run with: node stress_test.mjs

const BASE_URL = "https://campus-ticketing-z8bd.onrender.com/api"; // <-- REPLACE with your Render or http://localhost:5000/api URL
const ORGANIZER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhZmJlYzE5MjU5NTFhMTM2MDVjOGI4YSIsInJvbGUiOiJhZG1pbiIsIm5hbWUiOiJEZWFuIEFkbWluIiwiaWF0IjoxNzk1MzUxMTkwLCJleHAiOjE3OTU5NTU5OTB9.hu3Ru612Wpd_qu-Dta_ZORfdTTpO2ozaMDkdc6IeNzg";      // <-- REPLACE with a valid Organizer/Admin JWT
const EVENT_CAPACITY = 40;


const headers = (token) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function api(path, method = "GET", body = null, token = ORGANIZER_TOKEN) {
  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: headers(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = performance.now() - t0;
  const rawText = await res.text();
  let data = {};
  try { data = JSON.parse(rawText); } catch { data = { rawText }; }
  return { status: res.status, ms, data };
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function extractId(payload) {
  return (
    payload?._id ||
    payload?.id ||
    payload?.event?._id ||
    payload?.event?.id ||
    payload?.data?._id ||
    payload?.data?.id ||
    payload?.data?.event?._id ||
    null
  );
}

async function run() {
  console.log("=== 1. Checking Resources & Creating Benchmark Event ===");
  const resList = await api("/resources");
  console.log("GET /resources -> HTTP", resList.status);
  const list = Array.isArray(resList.data)
    ? resList.data
    : resList.data?.resources || resList.data?.data || [];
  const resource = list[0];
  if (!resource) {
    console.log("Resources response:", JSON.stringify(resList.data).slice(0, 300));
    throw new Error("No resource returned. Verify BASE_URL (/api vs root) and ORGANIZER_TOKEN.");
  }

  const resourceId = extractId(resource);
  const start = new Date(Date.now() + 2 * 3600_000).toISOString();
  const end = new Date(Date.now() + 3 * 3600_000).toISOString();

  const evRes = await api("/events", "POST", {
    title: `Stress Benchmark Event (${Date.now()})`,
    clubName: "AI Research Club",
    description: "Automated concurrency benchmark",
    resource: resourceId,
    resourceId,
    startTime: start,
    endTime: end,
    capacity: EVENT_CAPACITY,
    maxSeats: EVENT_CAPACITY,
  });
  console.log("POST /events -> HTTP", evRes.status, "| Keys:", Object.keys(evRes.data || {}));
  const eventId = extractId(evRes.data);
  console.log("Target Event ID:", eventId, "| Capacity:", EVENT_CAPACITY);
  if (!eventId) {
    console.log("Event creation payload response:", JSON.stringify(evRes.data).slice(0, 400));
    throw new Error("Could not extract event ID from POST /events response.");
  }

  // Try approving if status endpoint exists
  const appRes = await api(`/events/${eventId}/status`, "PATCH", { status: "approved" });
  if (appRes.status !== 200 && appRes.status !== 201) {
    await api(`/events/${eventId}`, "PATCH", { status: "approved" });
  }

  const MAX_BURST = 250;
  console.log(`\n=== 2. Provisioning ${MAX_BURST} Test Student Tokens ===`);
  const studentTokens = [];
  for (let batch = 0; batch < MAX_BURST; batch += 25) {
    const chunk = Array.from({ length: 25 }, (_, i) => {
      const idx = batch + i;
      const email = `bench_${Date.now()}_${idx}@campus.edu`;
      return api("/auth/register", "POST", {
        name: `Bench Student ${idx}`,
        email,
        password: "Password@123",
        department: "AI",
      }, null);
    });
    const results = await Promise.all(chunk);
    for (const r of results) {
      const tok = r.data?.token || r.data?.data?.token || r.data?.accessToken;
      if (tok) studentTokens.push(tok);
    }
  }
  console.log(`Provisioned ${studentTokens.length} student tokens.`);

  console.log("\n=== 3. Running Concurrency Burst Tests (50, 100, 150, 250) ===");
  let last250 = null;
  for (const burstSize of [50, 100, 150, 250]) {
    const bStart = new Date(Date.now() + (burstSize * 12) * 3600_000).toISOString();
    const bEnd = new Date(Date.now() + (burstSize * 12 + 1) * 3600_000).toISOString();
    const bEv = await api("/events", "POST", {
      title: `Burst_${burstSize}_${Date.now()}`,
      clubName: "Benchmark Suite",
      description: "Burst test",
      resource: resourceId,
      resourceId,
      startTime: bStart,
      endTime: bEnd,
      capacity: EVENT_CAPACITY,
      maxSeats: EVENT_CAPACITY,
    });
    const bEventId = extractId(bEv.data);
    if (bEventId) {
      const a = await api(`/events/${bEventId}/status`, "PATCH", { status: "approved" });
      if (a.status >= 400) await api(`/events/${bEventId}`, "PATCH", { status: "approved" });
    }

    const slice = studentTokens.slice(0, Math.min(burstSize, studentTokens.length));
    const responses = await Promise.all(
      slice.map((tok) => api(`/tickets/claim/${bEventId}`, "POST", {}, tok))
    );

    const getTicket = (r) => r.data?.ticket || r.data?.data?.ticket || r.data?.data || null;
    const confirmedItems = responses.filter((r) => getTicket(r)?.status === "confirmed");
    const waitlistedItems = responses.filter((r) => getTicket(r)?.status === "waitlisted");
    const confirmed = confirmedItems.length;
    const waitlisted = waitlistedItems.length;
    const rejected = responses.filter((r) => r.status === 409).length;
    const lats = responses.map((r) => r.ms);
    const meanMs = (lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(1);
    const p95Ms = percentile(lats, 95).toFixed(1);
    const oversellPct = Math.max(0, ((confirmed - EVENT_CAPACITY) / EVENT_CAPACITY) * 100).toFixed(1);

    console.log(
      `Burst ${burstSize} Reqs -> Confirmed: ${confirmed}/${EVENT_CAPACITY} | Waitlisted: ${waitlisted} | Rejected(409): ${rejected} | Oversell: ${oversellPct}% | Mean: ${meanMs}ms | P95: ${p95Ms}ms`
    );

    if (burstSize === 250) {
      last250 = { bEventId, slice, responses, confirmedItems, waitlistedItems, getTicket };
    }
  }

  if (last250 && last250.confirmedItems.length > 0) {
    const { bEventId, slice, responses, confirmedItems, waitlistedItems, getTicket } = last250;
    console.log("\n=== 4. Measuring Gate HMAC Verification Latency ===");
    const verifyLats = [];
    const sample = confirmedItems.slice(0, 15);
    for (const item of sample) {
      const idx = responses.indexOf(item);
      const tkt = getTicket(item);
      const rot = await api(`/tickets/rotating/${tkt._id}`, "GET", null, slice[idx]);
      const qr = rot.data?.qrToken || rot.data?.token || tkt.qrToken;
      if (qr) {
        const ver = await api("/tickets/verify", "POST", { qrToken: qr, eventId: bEventId });
        verifyLats.push(ver.ms);
      }
    }
    if (verifyLats.length > 0) {
      console.log(
        `Gate Verify (${verifyLats.length} scans) -> Mean: ${(verifyLats.reduce((a, b) => a + b, 0) / verifyLats.length).toFixed(1)}ms | P95: ${percentile(verifyLats, 95).toFixed(1)}ms`
      );
    }

    console.log("\n=== 5. Running Adversarial Security Checks ===");
    const firstTkt = getTicket(confirmedItems[0]);
    const validQr = firstTkt?.qrToken || "";
    if (validQr) {
      const forgedQr = validQr.slice(0, -1) + (validQr.endsWith("a") ? "b" : "a");
      const parts = validQr.split(":");
      if (parts.length >= 4) parts[3] = String(Number(parts[3]) - 5);
      const expiredQr = parts.join(":");

      const a1 = await api("/tickets/verify", "POST", { qrToken: forgedQr, eventId: bEventId });
      const a2 = await api("/tickets/verify", "POST", { qrToken: expiredQr, eventId: bEventId });
      const a3 = await api("/tickets/verify", "POST", { qrToken: validQr, eventId: bEventId });
      const a4 = await api("/tickets/verify", "POST", { qrToken: validQr, eventId: eventId });
      const waitTkt = waitlistedItems[0] ? getTicket(waitlistedItems[0]) : null;
      const a5 = waitTkt?.qrToken
        ? await api("/tickets/verify", "POST", { qrToken: waitTkt.qrToken, eventId: bEventId })
        : { status: "N/A", data: {} };

      console.log(`1. Forged Signature  -> HTTP ${a1.status} (${a1.data?.code || a1.data?.message || ""})`);
      console.log(`2. Stale (>60s) QR   -> HTTP ${a2.status} (${a2.data?.code || a2.data?.message || ""})`);
      console.log(`3. Replay Used Pass  -> HTTP ${a3.status} (${a3.data?.code || a3.data?.message || ""})`);
      console.log(`4. Wrong Event Scan  -> HTTP ${a4.status} (${a4.data?.code || a4.data?.message || ""})`);
      console.log(`5. Waitlisted Pass   -> HTTP ${a5.status} (${a5.data?.code || a5.data?.message || ""})`);
    }
  } else {
    console.log("\nSkipping Steps 4–5 because 0 confirmed tickets were created in Step 3.");
  }
}

run().catch((err) => console.error("Benchmark error:", err));