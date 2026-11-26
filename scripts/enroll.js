(function () {
  const pendingEnrollment = Symbol.for("cusis-auto.pendingEnrollment");
  if (window[pendingEnrollment]) {
    console.log("Enrollment is already scheduled in this tab.");
    return;
  }

  const cartPage = "SSR_SHOP_CART_FL";
  const cartUrl =
    "https://cusis.cuhk.edu.hk/psc/CSPRD_newwin/EMPLOYEE/SA/c/SSR_STUDENT_FL.SSR_SHOP_CART_FL.GBL?Page=SSR_SHOP_CART_FL";
  const checkboxSelector = ".ps-checkbox";
  const enrollButtonId = "DERIVED_SSR_FL_SSR_ENROLL_FL";
  const hktOffsetMs = 8 * 60 * 60 * 1000;
  const clockBufferMs = 3; // The local and CUSIS clocks share the HKO time source.
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
      logMessage("You stay on the current page. The script exits.");
    }
    return;
  }

  const input = window.prompt(
    "Enter the registration time in Hong Kong (UTC+08:00), e.g. 2026-08-10 10:00:00",
    formatHkt(Date.now() + 120_000).slice(0, 19)
  );
  if (input === null) {
    logMessage("Enrollment canceled.");
    return;
  }

  const registrationTime = input.trim();
  const hasDateFormat = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(registrationTime);
  const openingMs = hasDateFormat ? Date.parse(registrationTime.replace(" ", "T") + "+08:00") : NaN;
  if (!Number.isFinite(openingMs) || formatHkt(openingMs).slice(0, 19) !== registrationTime) {
    logMessage("Invalid registration time. Enter a Hong Kong date and time as YYYY-MM-DD HH:MM:SS.");
    return;
  }
  if (document.hidden) {
    logMessage("Keep the Shopping Cart tab visible and run the script again.");
    return;
  }

  // Anchor before cart preparation, which can span asynchronous page updates.
  const sampleStart = performance.now();
  const wallNow = Date.now();
  const sampleEnd = performance.now();
  if (openingMs <= wallNow) {
    logMessage("The registration time has already passed.");
    return;
  }

  const targetMs = openingMs + clockBufferMs;
  const deadline = (sampleStart + sampleEnd) / 2 + (targetMs - wallNow);
  let timer;
  let cartReady = false;
  let openedDetails = false;
  const attemptedSelection = new Set();
  const observer = new MutationObserver(prepareCart);

  function finish() {
    clearTimeout(timer);
    observer.disconnect();
    document.removeEventListener("change", onSelectionChange);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    window.navigation?.removeEventListener("currententrychange", onNavigation);
    delete window[pendingEnrollment];
  }

  function cancel(message) {
    finish();
    logMessage(message);
  }

  function onVisibilityChange() {
    if (document.hidden) cancel("Enrollment canceled because the Shopping Cart tab was hidden.");
  }

  function onPageHide() {
    cancel("Enrollment canceled because the Shopping Cart page was left.");
  }

  function onNavigation() {
    if (window.location.href !== initialUrl) onPageHide();
  }

  function onSelectionChange(event) {
    if (event.target.matches?.(checkboxSelector)) queueMicrotask(prepareCart);
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
      observer.disconnect();
      document.removeEventListener("change", onSelectionChange);
      logMessage(`Scheduled to click Enroll at ${formatHkt(targetMs)} HKT.`);
    } catch (error) {
      cancel("Cannot prepare the Shopping Cart: " + error.message);
    }
  }

  function scheduleTimer() {
    const delay = Math.ceil(deadline - performance.now());
    timer = setTimeout(clickWhenDue, Math.min(maxTimeoutMs, Math.max(0, delay)));
  }

  function clickWhenDue() {
    if (performance.now() < deadline) {
      scheduleTimer();
      return;
    }
    if (document.hidden || window.location.href !== initialUrl) {
      cancel("Enrollment canceled because the Shopping Cart is no longer active.");
      return;
    }
    const enrollButton = document.getElementById(enrollButtonId);
    const hasSelection = Array.from(document.querySelectorAll(`${checkboxSelector}:checked`)).some(isEnabled);
    if (!cartReady || !hasSelection || !isEnabled(enrollButton)) {
      cancel("The Shopping Cart was not ready at the scheduled time. Check the courses and Enroll button.");
      return;
    }

    finish();
    const clickedAt = Date.now();
    if (clickedAt < targetMs) {
      logMessage("The system clock moved backward. Check the clock and schedule enrollment again.");
      return;
    }
    try {
      enrollButton.click();
    } catch (error) {
      logMessage("Cannot click the Enroll button: " + error.message);
      return;
    }
    logMessage(
      `The script clicks the Enroll button. ${formatHkt(clickedAt)} HKT ` +
      `(${clickedAt - openingMs} ms after opening, ${clickedAt - targetMs} ms after scheduled time).`
    );
  }

  window[pendingEnrollment] = finish;
  document.addEventListener("change", onSelectionChange);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  window.navigation?.addEventListener("currententrychange", onNavigation);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled", "checked", "class", "id"],
  });
  logMessage("Preparing the Shopping Cart.");
  scheduleTimer();
  prepareCart();
})();
