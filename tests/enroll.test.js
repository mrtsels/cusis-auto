const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../scripts/enroll.js"), "utf8");
const opening = "2026-11-26 10:00:00";
const openingMs = Date.parse("2026-11-26T10:00:00+08:00");
const bufferMs = 1;
const preflightMs = bufferMs - 100;
const classic = "http://localhost/SSR_SHOP_CART_FL";
const spa = "http://localhost/NUI_FRAMEWORK";
const pendingKey = Symbol.for("cusis-auto.pendingEnrollment");

function fixture({ input = opening, url = classic, hasCart = true } = {}) {
  const state = { now: -500, clockShift: 0, prompts: 0, detailsClicks: 0, enrollClicks: [] };
  const messages = [];
  const work = [];
  const overlay = { style: {}, textContent: "" };
  const checkbox = {
    isConnected: true,
    checked: false,
    matches: () => false,
    click() { this.checked = true; },
  };
  const enroll = {
    isConnected: true,
    disabled: false,
    matches() { return this.disabled; },
    click() { work.push("click"); state.enrollClicks.push(state.now); },
  };
  const details = {
    isConnected: !hasCart,
    matches: () => false,
    click() { state.detailsClicks++; },
  };
  let courses = hasCart ? [checkbox] : [];
  const document = Object.assign(new EventTarget(), {
    title: "Shopping Cart",
    body: {},
    hidden: false,
    querySelector: () => courses[0] ?? null,
    querySelectorAll(selector) {
      work.push("query");
      return selector.endsWith(":checked") ? courses.filter((course) => course.checked) : courses;
    },
    getElementById(id) {
      work.push("lookup");
      return ({
        "log-overlay": overlay,
        DERIVED_SSR_FL_SSR_ENROLL_FL: enroll,
        DERIVED_REGFRM1_DETAILS_LINK: details,
      })[id] ?? null;
    },
  });
  const window = Object.assign(new EventTarget(), {
    location: { href: url },
    navigation: new EventTarget(),
    prompt() { state.prompts++; return input; },
  });
  class Clock extends Date {
    static now() { return openingMs + state.now + state.clockShift; }
  }
  const timers = new Map();
  let nextTimer = 0;
  const observers = new Set();
  const context = vm.createContext({
    window,
    document,
    Date: Clock,
    console: { log: (message) => messages.push(message) },
    queueMicrotask,
    performance: { now: () => 10_000 + state.now },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { observers.add(this.callback); }
      disconnect() { work.push("cleanup"); observers.delete(this.callback); }
    },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: state.now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });

  return {
    state, document, window, overlay, checkbox, enroll, timers, observers, messages, work,
    start() { vm.runInContext(source, context); },
    advanceTo(time) {
      state.now = time;
      while (timers.size > 0) {
        const [id, next] = Array.from(timers).sort((a, b) => a[1].at - b[1].at)[0];
        if (next.at > state.now) break;
        timers.delete(id);
        next.callback();
      }
    },
    fireTimerEarly(time) {
      state.now = time;
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.callback();
    },
    renderCart(course = checkbox) {
      courses = [course];
      for (const callback of [...observers]) callback();
    },
  };
}

test("classic and SPA carts are ready immediately and click once at the HKT target", () => {
  for (const url of [classic, spa]) {
    const page = fixture({ url });
    page.start();
    assert.equal(page.checkbox.checked, true);
    assert.match(page.overlay.textContent, /10:00:00\.001 HKT/);
    page.advanceTo(bufferMs - 1);
    assert.deepEqual(page.state.enrollClicks, []);
    page.advanceTo(bufferMs);
    page.advanceTo(500);
    assert.deepEqual(page.state.enrollClicks, [bufferMs]);
    assert.equal(page.window[pendingKey], undefined);
  }
});

test("cancel, bad input, impossible calendar dates and past times do not act on the cart", () => {
  for (const input of [null, "", "bad", "2027-02-29 10:00:00", "2026-11-26 09:59:59"]) {
    const page = fixture({ input, hasCart: false });
    page.start();
    page.advanceTo(500);
    assert.equal(page.state.detailsClicks, 0, String(input));
    assert.deepEqual(page.state.enrollClicks, [], String(input));
    assert.equal(page.timers.size, 0, String(input));
  }
});

test("repeated injection and a late timer cause one immediate click when the callback runs", () => {
  const page = fixture();
  page.start();
  page.start();
  assert.equal(page.state.prompts, 1);
  assert.equal(page.timers.size, 1);
  page.advanceTo(preflightMs);
  page.advanceTo(250);
  assert.deepEqual(page.state.enrollClicks, [250]);
  assert.equal(page.timers.size, 0);
  assert.equal(page.messages.at(-1),
    "Clicked 2026-11-26 10:00:00.250 HKT | open +250 ms | plan +249 ms | timer +249.00 ms | to click 0.00 ms");
});

test("the last cart scan is 100 ms early and there is no lookup or cleanup before the final click", () => {
  const page = fixture();
  page.start();
  page.work.length = 0;
  page.advanceTo(preflightMs - 1);
  assert.deepEqual(page.work, []);
  page.advanceTo(preflightMs);
  assert.deepEqual(page.work, ["lookup", "query"]);
  page.work.length = 0;
  page.advanceTo(bufferMs);
  assert.deepEqual(page.work, ["click", "cleanup"]);
});

test("the cart can finish preparing between preflight and the click", () => {
  const page = fixture({ hasCart: false });
  page.enroll.disabled = true;
  page.start();
  page.advanceTo(preflightMs);
  page.advanceTo(-50);
  page.enroll.disabled = false;
  page.renderCart();
  page.advanceTo(bufferMs);
  assert.deepEqual(page.state.enrollClicks, [bufferMs]);
});

test("the overlay and console share one log with the time captured before the click handler", () => {
  const page = fixture();
  const click = page.enroll.click;
  page.enroll.click = () => {
    click();
    page.state.now += 100;
  };
  page.start();
  assert.equal(page.overlay.textContent, "Scheduled 2026-11-26 10:00:00.001 HKT");
  const messageCount = page.messages.length;
  page.advanceTo(7);
  assert.deepEqual(page.state.enrollClicks, [7]);
  assert.equal(
    page.overlay.textContent,
    "Clicked 2026-11-26 10:00:00.007 HKT | open +7 ms | plan +6 ms | timer +6.00 ms | to click 0.00 ms"
  );
  assert.deepEqual(page.messages.slice(messageCount), [page.overlay.textContent]);
});

test("legacy Details opens once and later cart mutations finish preparation", () => {
  const page = fixture({ hasCart: false });
  page.enroll.disabled = true;
  page.start();
  assert.equal(page.state.detailsClicks, 1);
  page.renderCart();
  assert.equal(page.checkbox.checked, true);
  assert.match(page.overlay.textContent, /Preparing/);
  page.enroll.disabled = false;
  page.renderCart();
  assert.match(page.overlay.textContent, /Scheduled/);
  assert.equal(page.observers.size, 0);
  page.advanceTo(bufferMs);
  assert.deepEqual(page.state.enrollClicks, [bufferMs]);
});

test("a rerender before selection completes does not click the same course twice", () => {
  const page = fixture();
  let selectionClicks = 0;
  page.checkbox.id = "first-course";
  page.checkbox.click = () => { selectionClicks++; };
  page.start();
  const replacement = { ...page.checkbox };
  page.renderCart(replacement);
  assert.equal(selectionClicks, 1);
  replacement.checked = true;
  page.renderCart(replacement);
  page.advanceTo(bufferMs);
  assert.deepEqual(page.state.enrollClicks, [bufferMs]);
});

test("losing visibility, leaving the page or changing SPA routes cancels the task", () => {
  const signals = [
    (page) => {
      page.document.hidden = true;
      page.document.dispatchEvent(new Event("visibilitychange"));
      page.document.hidden = false;
    },
    (page) => page.window.dispatchEvent(new Event("pagehide")),
    (page) => {
      page.window.location.href += "#other-view";
      page.window.navigation.dispatchEvent(new Event("currententrychange"));
    },
  ];
  for (const signal of signals) {
    const page = fixture({ url: spa });
    page.start();
    page.advanceTo(preflightMs);
    signal(page);
    page.advanceTo(500);
    assert.deepEqual(page.state.enrollClicks, []);
    assert.equal(page.window[pendingKey], undefined);
    assert.match(page.overlay.textContent, /^Canceled\b/);
  }
});

test("an early callback and forward clock jump are still gated by the original deadline", () => {
  const page = fixture();
  page.start();
  page.advanceTo(preflightMs);
  page.state.clockShift = 350;
  page.fireTimerEarly(bufferMs - 1);
  assert.deepEqual(page.state.enrollClicks, []);
  page.advanceTo(bufferMs);
  assert.deepEqual(page.state.enrollClicks, [bufferMs]);
});

test("a local clock fast by the buffer still clicks at opening", () => {
  const page = fixture();
  page.state.clockShift = bufferMs;
  page.start();
  page.advanceTo(-1);
  assert.deepEqual(page.state.enrollClicks, []);
  page.advanceTo(0);
  assert.deepEqual(page.state.enrollClicks, [0]);
});

test("a backward clock jump or stale cart state after preflight blocks the click", () => {
  const changes = [
    (page) => { page.state.clockShift = -350; },
    (page) => { page.enroll.disabled = true; page.renderCart(); },
    (page) => { page.enroll.isConnected = false; },
    (page) => { page.checkbox.checked = false; },
  ];
  for (const change of changes) {
    const page = fixture();
    page.start();
    page.advanceTo(preflightMs);
    change(page);
    page.advanceTo(bufferMs);
    page.advanceTo(500);
    assert.deepEqual(page.state.enrollClicks, []);
    assert.equal(page.window[pendingKey], undefined);
  }
});
