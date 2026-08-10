(function () {
  // ===== Log overlay: fixed at the bottom of the screen =====
  // Shared with enroll.js (same id) so running both scripts does not stack two overlays
  let overlay = document.getElementById("log-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.bottom = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.maxHeight = "30vh";
    overlay.style.overflowY = "auto";
    overlay.style.backgroundColor = "rgba(128, 128, 128, 0.7)";
    overlay.style.color = "#fff";
    overlay.style.fontSize = "16px";
    overlay.style.padding = "5px";
    overlay.style.zIndex = "1000";
    overlay.id = "log-overlay";
    document.body.appendChild(overlay);
  }
  overlay.style.textAlign = "center"; // Apply on every run, even when reusing the overlay

  function logMessage(message) {
    console.log(message);
    overlay.innerText = message; // Show only the latest line
    overlay.style.display = "block";
    overlay.scrollTop = overlay.scrollHeight;
  }

  // ===== URL check: leave the page if it is not the cart page =====
  const CART_URL =
    "https://cusis.cuhk.edu.hk/psc/CSPRD_newwin/EMPLOYEE/SA/c/SSR_STUDENT_FL.SSR_SHOP_CART_FL.GBL?Page=SSR_SHOP_CART_FL";
  if (
    window.location.href.indexOf("SSR_SHOP_CART_FL") === -1 &&
    window.location.href.indexOf("SSR_MD_SP_FL") === -1 &&
    document.title.indexOf("Shopping Cart") === -1
  ) {
    if (window.confirm("You are not on the Shopping Cart page. Do you want to go there?")) {
      window.location.href = CART_URL;
    } else {
      logMessage("You stay on the current page. The script exits.");
    }
    return;
  }

  // ===== Main flow: select all courses, then click Validate =====
  const run = () => {
    const cbs = document.querySelectorAll(".ps-checkbox");
    if (cbs.length === 0) {
      // The cart list page has no checkbox. Click Details first, then poll for checkboxes.
      const details = document.querySelector("#DERIVED_REGFRM1_DETAILS_LINK");
      if (details) {
        logMessage("No course checkbox found. The script clicks the Details link.");
        try {
          details.click();
        } catch (e) {
          logMessage("Cannot click the Details link: " + e.message);
        }
        // Poll every 300 ms, up to 5 s (measured detail page load < 1.5 s)
        let tries = 0;
        const poll = setInterval(() => {
          tries++;
          const c = document.querySelectorAll(".ps-checkbox").length;
          if (c > 0 || tries >= 17) {
            clearInterval(poll);
            if (c > 0) run();
            else logMessage("Timeout: the detail page shows no course checkbox.");
          }
        }, 300);
        return;
      }
      logMessage("The cart is empty or the page structure changed. No course checkbox found.");
      return;
    }

    let newlyChecked = 0;
    cbs.forEach((cb) => {
      if (!cb.checked) {
        cb.click();
        newlyChecked++;
      }
    });
    logMessage(
      "Selected " + cbs.length + " course(s). Newly selected: " + newlyChecked + "."
    );

    // Measured: select-to-click takes 2 ms. Keep 200 ms margin for DOM reflow.
    setTimeout(() => {
      const btn = document.querySelector("#DERIVED_SSR_FL_SSR_VALIDATE_FL");
      if (!btn) {
        logMessage("Error: Validate button not found. Open the course detail page first.");
        return;
      }
      try {
        btn.click();
        logMessage("The script clicks the Validate button. The page returns the result.");
      } catch (e) {
        logMessage("Cannot click the Validate button: " + e.message);
      }
    }, 200);
  };

  run();
})();
