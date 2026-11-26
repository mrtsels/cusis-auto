(function () {
  const pendingEnrollment = Symbol.for("cusis-auto.pendingEnrollment");
  const pendingResponse = Symbol.for("cusis-auto.pendingResponse");
  if (window[pendingEnrollment]) {
    console.log("Already scheduled in this tab.");
    return;
  }

  const cartPage = "SSR_SHOP_CART_FL";
  const cartUrl =
    "https://cusis.cuhk.edu.hk/psc/CSPRD_newwin/EMPLOYEE/SA/c/SSR_STUDENT_FL.SSR_SHOP_CART_FL.GBL?Page=SSR_SHOP_CART_FL";
  const checkboxSelector = ".ps-checkbox";
  const enrollButtonId = "DERIVED_SSR_FL_SSR_ENROLL_FL";
  const hktOffsetMs = 8 * 60 * 60 * 1000;
  const clockBufferMs = 1; // The local and CUSIS clocks share the HKO time source.
  const preflightLeadMs = 100;
  const responseWaitMs = 10_000;
  const maxTimeoutMs = 2_147_483_647;

  // ===== Log overlay: fixed at the bottom of the screen =====
  let overlay = document.getElementById("log-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.bottom = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.maxHeight = "30vh";
    overlay.style.overflowY = "auto"; // Allow scrolling if the content exceeds max height
    overlay.style.backgroundColor = "rgba(128, 128, 128, 0.7)";
    overlay.style.color = "#fff";
    overlay.style.fontSize = "16px";
    overlay.style.padding = "5px";
    overlay.style.zIndex = "1000";
    overlay.id = "log-overlay";
    document.body.appendChild(overlay);
  }
  overlay.style.textAlign = "center"; // Apply on every run, even when reusing the overlay

  // Display a message on the overlay. Show only the latest line.
  function logMessage(message) {
    console.log(message);
    showMessage(message);
  }

  function showMessage(message) {
    overlay.textContent = message;
    overlay.style.display = "block";
  }

  function formatHkt(epochMs) {
    return new Date(epochMs + hktOffsetMs).toISOString().slice(0, -1).replace("T", " ");
  }

  function isEnabled(element) {
    return element?.isConnected && !element.matches(':disabled, [disabled], [aria-disabled="true"]');
  }

  const initialUrl = window.location.href;

  function parseUrl(url) {
    try {
      return new URL(url, document.baseURI || initialUrl);
    } catch {
      return null;
    }
  }

  const isSpaCart =
    initialUrl.includes("NUI_FRAMEWORK") &&
    (document.title.includes("Shopping Cart") ||
      document.querySelector(checkboxSelector) ||
      document.getElementById(enrollButtonId));

  if (!initialUrl.includes(cartPage) && !isSpaCart) {
    const userConfirm = window.confirm(
      "You are not on the CUHK Shopping Cart page. Do you want to be redirected?"
    );
    if (userConfirm) {
      window.location.href = cartUrl;
    } else {
      logMessage("Canceled.");
    }
    return;
  }

  const input = window.prompt(
    "Enter the registration time in Hong Kong (UTC+08:00), e.g. 2026-08-10 10:00:00",
    formatHkt(Date.now() + 120_000).slice(0, 19)
  );
  if (input === null) {
    logMessage("Canceled.");
    return;
  }

  const registrationTime = input.trim();
  const hasDateFormat = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(registrationTime);
  const openingMs = hasDateFormat ? Date.parse(registrationTime.replace(" ", "T") + "+08:00") : NaN;
  if (!Number.isFinite(openingMs) || formatHkt(openingMs).slice(0, 19) !== registrationTime) {
    logMessage("Invalid time. Use HKT YYYY-MM-DD HH:MM:SS.");
    return;
  }
  if (document.hidden) {
    logMessage("Show the Shopping Cart tab and rerun.");
    return;
  }

  // Anchor before cart preparation, which can span asynchronous page updates.
  const sampleStart = performance.now();
  const wallNow = Date.now();
  const sampleEnd = performance.now();
  if (openingMs <= wallNow) {
    logMessage("Registration time has passed.");
    return;
  }

  const targetMs = openingMs + clockBufferMs;
  const deadline = (sampleStart + sampleEnd) / 2 + (targetMs - wallNow);
  const preflightDeadline = deadline - preflightLeadMs;
  let timer;
  let cartReady = false;
  let openedDetails = false;
  let preflightStarted = false;
  let preparedButton = null;
  let preparedSelection = [];
  let submission;
  let clickStarted = false;
  let responseWatch;
  const attemptedSelection = new Set();
  const observer = new MutationObserver(onCartChange);

  function stopWatchingCart() {
    observer.disconnect();
    document.removeEventListener("change", onSelectionChange);
  }

  function finish() {
    clearTimeout(timer);
    stopWatchingCart();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    window.navigation?.removeEventListener("currententrychange", onNavigation);
    if (!clickStarted) responseWatch?.stop();
    delete window[pendingEnrollment];
  }

  function cancel(message) {
    if (clickStarted || window[pendingEnrollment] !== finish) return;
    finish();
    logMessage(message);
  }

  function onVisibilityChange() {
    if (document.hidden) cancel("Canceled (cart tab hidden).");
  }

  function onPageHide() {
    cancel("Canceled (left cart).");
  }

  function onNavigation() {
    if (window.location.href !== initialUrl) onPageHide();
  }

  function onSelectionChange(event) {
    if (event.target.matches?.(checkboxSelector)) queueMicrotask(onCartChange);
  }

  function watchCart() {
    document.addEventListener("change", onSelectionChange);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-disabled", "checked", "class", "id"],
    });
  }

  function onCartChange() {
    if (window[pendingEnrollment] !== finish || clickStarted) return;
    prepareCart();
    if (!preflightStarted || window[pendingEnrollment] !== finish) return;

    // Recheck on changes during the last 100 ms. The click timer uses these references.
    const button = document.getElementById(enrollButtonId);
    preparedSelection = Array.from(document.querySelectorAll(`${checkboxSelector}:checked`)).filter(isEnabled);
    preparedButton = cartReady && preparedSelection.length > 0 && isEnabled(button) ? button : null;
    const form = preparedButton?.form ?? preparedButton?.closest?.("form");
    submission = parseUrl(preparedButton?.getAttribute?.("formaction") || form?.action || initialUrl);
  }

  function prepareCart() {
    if (cartReady || window[pendingEnrollment] !== finish) return;

    try {
      const checkboxes = document.querySelectorAll(checkboxSelector);
      if (checkboxes.length === 0 && !openedDetails) {
        const details = document.getElementById("DERIVED_REGFRM1_DETAILS_LINK");
        if (isEnabled(details)) {
          openedDetails = true;
          details.click();
        }
        return;
      }

      for (const checkbox of checkboxes) {
        // A replacement control can appear before the cart acknowledges the selection.
        const selectionKey = checkbox.id || checkbox;
        if (isEnabled(checkbox) && !checkbox.checked && !attemptedSelection.has(selectionKey)) {
          attemptedSelection.add(selectionKey);
          checkbox.click();
          if (window[pendingEnrollment] !== finish) return;
        }
      }

      // Selecting courses can rerender the cart or enable the button.
      const selectable = Array.from(document.querySelectorAll(checkboxSelector)).filter(isEnabled);
      const allSelected = selectable.length > 0 && selectable.every((checkbox) => checkbox.checked);
      if (!allSelected || !isEnabled(document.getElementById(enrollButtonId))) return;

      cartReady = true;
      if (!preflightStarted) stopWatchingCart();
      logMessage(`Scheduled ${formatHkt(targetMs)} HKT`);
    } catch (error) {
      cancel("Cart setup failed. " + error.message);
    }
  }

  function scheduleAt(when, callback) {
    const delay = Math.ceil(when - performance.now());
    timer = setTimeout(callback, Math.min(maxTimeoutMs, Math.max(0, delay)));
  }

  function watchResponseDate() {
    window[pendingResponse]?.();
    const XMLHttpRequestClass = window.XMLHttpRequest;
    const xhr = XMLHttpRequestClass?.prototype;
    const open = xhr?.open;
    const fetch = window.fetch;
    if (typeof open !== "function" && typeof fetch !== "function") return;

    const origin = new URL(initialUrl).origin;
    let stopListening;
    let timeout;
    let clickedMessage;
    let dateMs;
    let requestMatched = false;
    let done = false;

    function restoreRequests() {
      if (xhr?.open === watchOpen) xhr.open = open;
      if (window.fetch === watchFetch) window.fetch = fetch;
    }

    function publish() {
      if (!clickedMessage || !done) return;
      const serverTime = Number.isFinite(dateMs) ? `${formatHkt(dateMs).slice(0, -4)} HKT` : "n/a";
      const message = `${clickedMessage} | server ${serverTime}`;
      if (overlay.textContent === clickedMessage) logMessage(message);
      else console.log(message);
    }

    function finishResponse(header) {
      if (done) return;
      done = true;
      restoreRequests();
      stopListening?.();
      clearTimeout(timeout);
      window.removeEventListener("pagehide", stop);
      if (window[pendingResponse] === stop) delete window[pendingResponse];
      dateMs = Date.parse(header);
      publish();
    }

    function stop() {
      finishResponse(null);
    }

    function matchSubmission(method, url) {
      if (!clickStarted || requestMatched || done || submission?.origin !== origin) return false;
      if (typeof method !== "string" || method.toUpperCase() !== "POST") return false;
      const destination = parseUrl(url);
      if (destination?.origin !== origin || destination.pathname !== submission.pathname) return false;
      requestMatched = true;
      restoreRequests();
      return true;
    }

    function watchOpen(...args) {
      const result = Reflect.apply(open, this, args);
      if (matchSubmission(args[0], args[1])) {
        const request = this;
        function onResponse() {
          if (request.readyState < XMLHttpRequestClass.HEADERS_RECEIVED) return;
          const header = parseUrl(request.responseURL)?.origin === origin ? request.getResponseHeader("Date") : null;
          finishResponse(header);
        }
        request.addEventListener("readystatechange", onResponse);
        stopListening = () => request.removeEventListener("readystatechange", onResponse);
      }
      return result;
    }

    function watchFetch(...args) {
      const result = Reflect.apply(fetch, this, args);
      const [input, options] = args;
      if (matchSubmission(options?.method ?? input?.method, input?.url ?? input)) {
        result.then((response) => {
          const header = parseUrl(response.url)?.origin === origin ? response.headers.get("Date") : null;
          finishResponse(header);
        }, stop);
      }
      return result;
    }

    window[pendingResponse] = stop;
    try {
      if (typeof open === "function") xhr.open = watchOpen;
      if (typeof fetch === "function") window.fetch = watchFetch;
      window.addEventListener("pagehide", stop, { once: true });
    } catch {
      stop();
    }
    return {
      stop,
      logWhenReady(message) {
        clickedMessage = message;
        showMessage(message);
        if (done) publish();
        else timeout = setTimeout(stop, responseWaitMs);
      },
    };
  }

  function preflightWhenDue() {
    if (performance.now() < preflightDeadline) {
      scheduleAt(preflightDeadline, preflightWhenDue);
      return;
    }
    preflightStarted = true;
    watchCart();
    onCartChange();
    if (window[pendingEnrollment] !== finish) return;
    responseWatch = watchResponseDate();
    scheduleAt(deadline, clickWhenDue);
  }

  function clickWhenDue() {
    const callbackAt = performance.now();
    if (callbackAt < deadline) {
      scheduleAt(deadline, clickWhenDue);
      return;
    }
    if (document.hidden || window.location.href !== initialUrl) {
      cancel("Canceled (cart inactive).");
      return;
    }
    // The checked property can change without a DOM mutation or a change event.
    if (!preparedButton?.isConnected || !preparedSelection.some((checkbox) => checkbox.isConnected && checkbox.checked)) {
      cancel("Canceled. Check course selection and Enroll.");
      return;
    }

    const clickedAt = Date.now();
    if (clickedAt < targetMs) {
      cancel("Clock moved backward. Check time and rerun.");
      return;
    }
    clickStarted = true;
    const clickStart = performance.now();
    try {
      preparedButton.click();
    } catch (error) {
      responseWatch?.stop();
      logMessage("Enroll click failed. " + error.message);
      return;
    } finally {
      finish();
    }
    const timerDelay = (callbackAt - deadline).toFixed(2);
    const callbackToClick = (clickStart - callbackAt).toFixed(2);
    const message = `Clicked ${formatHkt(clickedAt)} HKT | open +${clickedAt - openingMs} ms | ` +
      `plan +${clickedAt - targetMs} ms | timer +${timerDelay} ms | to click ${callbackToClick} ms`;
    if (responseWatch) responseWatch.logWhenReady(message);
    else logMessage(message);
  }

  window[pendingEnrollment] = finish;
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  window.navigation?.addEventListener("currententrychange", onNavigation);
  watchCart();
  logMessage("Preparing cart.");
  prepareCart();
  if (window[pendingEnrollment] === finish) preflightWhenDue();
})();
