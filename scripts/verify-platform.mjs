// End-to-end smoke test against the real, running API — no mocks.
// Exercises: two-student Shared Delivery matching, the 3-minute payment
// window's happy path, the restaurant dashboard's manual accept/prepare/
// ready steps, the simulated delivery hand-off, PairCode verification, and
// the admin dashboard. Run with the API already running: `npm run verify`.

const BASE = process.env.CAMPUS_BITES_API_URL || 'http://localhost:4000/api/v1';

let passCount = 0;
let failCount = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  \u2713 ${label}`);
    passCount++;
  } else {
    console.log(`  \u2717 ${label}`);
    failCount++;
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(email, password) {
  const { json } = await api('POST', '/auth/login', { body: { email, password } });
  return json.data;
}

/** Opens a real SSE connection and collects events into `received`, exactly
 * as a browser's EventSource would consume them — used to prove the push
 * mechanism itself works, not just that polling eventually catches up. */
function listenToEvents(token) {
  const received = [];
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE}/events?token=${encodeURIComponent(token)}`, {
        signal: controller.signal,
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (line) {
            try {
              received.push(JSON.parse(line.slice('data: '.length)));
            } catch {
              // ignore malformed frame
            }
          }
        }
      }
    } catch {
      // aborted on cleanup, or connection closed — not a test failure by itself
    }
  })();

  return { received, close: () => controller.abort() };
}

async function main() {
  console.log('\n== Thapar Bites platform verification ==\n');

  console.log('-- Auth --');
  const asha = await login('asha@thapar.edu', 'password123');
  const rohan = await login('rohan@thapar.edu', 'password123');
  const priya = await login('priya@thapar.edu', 'password123');
  const dhabaOwner = await login('owner@sharmadadhaba.com', 'password123');
  const admin = await login(process.env.SUPER_ADMIN_EMAIL ?? 'adityakumarkaushal07@gmail.com', process.env.SUPER_ADMIN_PASSWORD ?? 'Kaushal7');
  check('Asha (Sutlej) logs in', asha?.role === 'student');
  check('Rohan (Sutlej) logs in', rohan?.role === 'student');
  check('Priya (Beas) logs in', priya?.role === 'student');
  check('Restaurant owner logs in', dhabaOwner?.role === 'restaurant');
  check('Admin logs in', admin?.role === 'admin');

  console.log('\n-- Real-time events (SSE) --');
  const ashaEvents = listenToEvents(asha.accessToken);
  await sleep(300); // let the connection actually establish before anything happens

  console.log('\n-- Public restaurant browsing --');
  const restaurants = await api('GET', '/restaurants');
  check('Restaurant list is public and non-empty', restaurants.json?.data?.length > 0);
  const menu = await api('GET', '/restaurants/res_dhaba/menu');
  check('Menu loads for Sharma Da Dhaba', menu.json?.data?.items?.length > 0);
  const dalMakhaniPrice = menu.json.data.items.find((i) => i.id === 'itm_dal_makhani').price;

  console.log('\n-- Shared Delivery: two real students, same hostel --');
  // Both add one Dal Makhani (₹160) — below the ₹150 individual minimum? No,
  // 160 alone already clears it, so add just enough to sit in the shared
  // band (₹80–149) instead: one Butter Naan (₹45) + one Sweet Lassi (₹70) = ₹115.
  for (const student of [asha, rohan]) {
    await api('POST', '/cart/items', {
      token: student.accessToken,
      body: { menuItemId: 'itm_butter_naan', quantity: 1 },
    });
    await api('POST', '/cart/items', {
      token: student.accessToken,
      body: { menuItemId: 'itm_lassi', quantity: 1 },
    });
  }
  const ashaCart = await api('GET', '/cart', { token: asha.accessToken });
  check('Asha cart subtotal sits in the Shared Delivery band (₹115)', ashaCart.json?.data?.subtotal === 115);

  const ashaQueue = await api('POST', '/shared-delivery/queue', { token: asha.accessToken });
  const rohanQueue = await api('POST', '/shared-delivery/queue', { token: rohan.accessToken });
  check('Asha joins the Shared Delivery queue', ashaQueue.status === 201);
  check('Rohan joins the Shared Delivery queue', rohanQueue.status === 201);

  // Priya (different hostel) joins the queue too, to prove hostel isolation.
  await api('POST', '/cart/items', {
    token: priya.accessToken,
    body: { menuItemId: 'itm_butter_naan', quantity: 1 },
  });
  await api('POST', '/cart/items', {
    token: priya.accessToken,
    body: { menuItemId: 'itm_lassi', quantity: 1 },
  });
  const priyaQueue = await api('POST', '/shared-delivery/queue', { token: priya.accessToken });
  check('Priya (Beas) also joins the queue', priyaQueue.status === 201);

  console.log('  waiting for the matching engine tick (up to ~3s)...');
  await sleep(2800);

  const ashaMatch = await api('GET', '/shared-delivery/match', { token: asha.accessToken });
  const rohanMatch = await api('GET', '/shared-delivery/match', { token: rohan.accessToken });
  const priyaStatus = await api('GET', '/shared-delivery/status', { token: priya.accessToken });
  check('Asha was matched (FIFO, same restaurant+hostel)', ashaMatch.json?.data?.matchId != null);
  check('Rohan was matched to the same match as Asha', rohanMatch.json?.data?.matchId === ashaMatch.json?.data?.matchId);
  check(
    'Asha\u2019s live SSE connection actually received the match push (not just polling)',
    ashaEvents.received.some((e) => e.type === 'queue_status_changed'),
  );
  ashaEvents.close();
  check(
    "Priya (different hostel) is still waiting — matches never cross hostels",
    priyaStatus.json?.data?.status === 'waiting',
  );
  await api('DELETE', '/shared-delivery/queue', { token: priya.accessToken }); // clean up

  const ashaOrderId = ashaMatch.json.data.orderId;
  const rohanOrderId = rohanMatch.json.data.orderId;

  console.log('\n-- Payment window: both sides pay independently --');
  const ashaPaymentInit = await api('POST', '/payments', {
    token: asha.accessToken,
    body: { orderId: ashaOrderId, method: 'upi' },
  });
  const ashaVerify = await api('POST', '/payments/verify', {
    token: asha.accessToken,
    body: { paymentId: ashaPaymentInit.json.data.id },
  });
  check('Asha pays; order awaits her delivery partner', ashaVerify.json?.data?.orderStatus === 'awaiting_partner_payment');

  const rohanPaymentInit = await api('POST', '/payments', {
    token: rohan.accessToken,
    body: { orderId: rohanOrderId, method: 'wallet' },
  });
  const rohanVerify = await api('POST', '/payments/verify', {
    token: rohan.accessToken,
    body: { paymentId: rohanPaymentInit.json.data.id },
  });
  check('Rohan pays too; order finalizes to order_received', rohanVerify.json?.data?.orderStatus === 'order_received');

  const ashaOrderAfterBothPaid = await api('GET', `/orders/${ashaOrderId}`, { token: asha.accessToken });
  check(
    "Asha's order also flipped to order_received once both sides paid",
    ashaOrderAfterBothPaid.json?.data?.status === 'order_received',
  );
  // Note: pairCode isn't checked here — as of the PairCode reveal gate
  // (Ch. 10, sprint 2) it stays hidden until paircode_verification/
  // delivered/completed, so the "shared PairCode matches" check happens
  // later, once both students have opened it. See the handover section.

  console.log('\n-- Restaurant Dashboard: real manual accept/prepare/ready --');
  const incoming = await api('GET', '/restaurant/orders', { token: dhabaOwner.accessToken });
  check('Restaurant sees both incoming orders', incoming.json?.data?.length >= 2);

  await api('PATCH', `/restaurant/orders/${ashaOrderId}/accept`, { token: dhabaOwner.accessToken });
  await api('PATCH', `/restaurant/orders/${rohanOrderId}/accept`, { token: dhabaOwner.accessToken });
  await api('PATCH', `/restaurant/orders/${ashaOrderId}/preparing`, { token: dhabaOwner.accessToken });
  await api('PATCH', `/restaurant/orders/${rohanOrderId}/preparing`, { token: dhabaOwner.accessToken });
  const readyAsha = await api('PATCH', `/restaurant/orders/${ashaOrderId}/ready`, { token: dhabaOwner.accessToken });
  const readyRohan = await api('PATCH', `/restaurant/orders/${rohanOrderId}/ready`, { token: dhabaOwner.accessToken });
  check('Restaurant marks both orders ready for pickup', readyAsha.json?.data?.status === 'ready_for_pickup' && readyRohan.json?.data?.status === 'ready_for_pickup');

  console.log('  waiting for the fulfillment engine to simulate pickup + delivery (~13s)...');
  await sleep(13000);

  const ashaOrderNearDelivery = await api('GET', `/orders/${ashaOrderId}`, { token: asha.accessToken });
  check(
    "Asha's order auto-advanced to driver_arrived without a delivery-partner app",
    ashaOrderNearDelivery.json?.data?.status === 'driver_arrived',
  );

  console.log('\n-- PairCode verification at handover --');
  // "Student opens PairCode" (Ch. 10, sprint 2) — the code stays hidden
  // until each student explicitly reveals it, so both sides open theirs
  // before it can be compared or used to verify.
  const ashaReveal = await api('PATCH', `/delivery/${ashaOrderId}/reveal`, { token: asha.accessToken });
  const rohanReveal = await api('PATCH', `/delivery/${rohanOrderId}/reveal`, { token: rohan.accessToken });
  check(
    "Shared PairCode matches on both students' orders",
    ashaReveal.json?.data?.pairCode === rohanReveal.json?.data?.pairCode && !!ashaReveal.json?.data?.pairCode,
  );

  const wrongCode = await api('POST', `/delivery/${ashaOrderId}/verify`, {
    token: asha.accessToken,
    body: { pairCode: 'ZZZZZ' },
  });
  check('An incorrect PairCode is rejected (DELIVERY_001)', wrongCode.json?.error?.code === 'DELIVERY_001');

  const rightCode = ashaReveal.json.data.pairCode;
  const verifyResult = await api('POST', `/delivery/${ashaOrderId}/verify`, {
    token: asha.accessToken,
    body: { pairCode: rightCode },
  });
  check('The correct PairCode is accepted', verifyResult.json?.data?.verified === true);

  await sleep(1800);
  const finalOrder = await api('GET', `/orders/${ashaOrderId}`, { token: asha.accessToken });
  check("Order reaches 'completed'", finalOrder.json?.data?.status === 'completed');

  console.log('\n-- Notifications --');
  const notes = await api('GET', '/notifications', { token: asha.accessToken });
  check('Asha received notifications along the way', notes.json?.data?.length >= 3);

  console.log('\n-- Admin dashboard --');
  const dashboard = await api('GET', '/admin/dashboard', { token: admin.accessToken });
  check('Admin dashboard reports at least 2 completed/active orders', dashboard.json?.data?.totals?.orders >= 2);
  check('Admin dashboard reports GMV > 0', dashboard.json?.data?.totals?.gmv > 0);
  const auditLog = await api('GET', '/admin/audit', { token: admin.accessToken });
  check('Audit log is queryable', Array.isArray(auditLog.json?.data));

  console.log(`\n== Result: ${passCount} passed, ${failCount} failed ==\n`);
  if (failCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Verification script crashed:', err);
  process.exitCode = 1;
});
