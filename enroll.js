(function () {
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
    overlay.innerText = message;
    overlay.style.display = "block";
    overlay.scrollTop = overlay.scrollHeight;
  }

  // Format the current time as HH:MM:SS.mmm
  function getCurrentTime() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
      pad(now.getHours()) +
      ":" +
      pad(now.getMinutes()) +
      ":" +
      pad(now.getSeconds()) +
      "." +
      String(now.getMilliseconds()).padStart(3, "0")
    );
  }

  const targetUrl =
    "https://cusis.cuhk.edu.hk/psc/CSPRD_newwin/EMPLOYEE/SA/c/SSR_STUDENT_FL.SSR_SHOP_CART_FL.GBL?Page=SSR_SHOP_CART_FL";

  // URL check: support both CUSIS cart pages
  // 1) Classic page: URL contains SSR_SHOP_CART_FL
  // 2) SPA page (2026+): URL is NUI_FRAMEWORK and the cart component is rendered
  const isClassicCart =
    window.location.href.indexOf("SSR_STUDENT_FL.SSR_SHOP_CART_FL.GBL") !== -1 ||
    window.location.href.indexOf("SSR_SHOP_CART_FL") !== -1;
  const isSpaCart =
    window.location.href.indexOf("NUI_FRAMEWORK") !== -1 &&
    (document.querySelectorAll(".ps-checkbox").length > 0 ||
      document.querySelector("#DERIVED_SSR_FL_SSR_ENROLL_FL"));

  if (!isClassicCart && !isSpaCart) {
    const userConfirm = window.confirm(
      "You are not on the CUHK Shopping Cart page. Do you want to be redirected?"
    );
    if (userConfirm) {
      window.location.href = targetUrl;
    } else {
      logMessage("You stay on the current page. The script exits.");
      return; // Exit the script to prevent it from running
    }
  } else {
    // The 2026 CUSIS cart page has no Details link. The course list and buttons
    // are visible directly. Click the Details link only if it still exists.
    const detailsLink = document.querySelector("#DERIVED_REGFRM1_DETAILS_LINK");
    if (detailsLink) {
      try {
        detailsLink.click();
      } catch (e) {
        logMessage("Cannot click the Details link: " + e.message);
      }
    }

    const regtime = new Date(
      Date.parse(
        window.prompt(
          "Enter the registration time (for example, 2026-08-10 10:00:00)",
          new Date(Date.now() + 2 * 60 * 1000 + 8 * 60 * 60 * 1000)
            .toISOString()
            .replace(/T/, " ")
            .replace(/\..+/, "")
        )
      )
    );

    logMessage("The script starts.");

    setTimeout(() => {
      document.querySelectorAll(".ps-checkbox").forEach((checkbox) => {
        if (!checkbox.checked) checkbox.click();
      });

      const interval = setInterval(() => {
        const currentTime = getCurrentTime();
        if (regtime > new Date()) {
          logMessage(`Waiting for the registration time. Current time: ${currentTime}`);
        } else {
          setTimeout(() => {
            const enrollBtn = document.querySelector(
              "#DERIVED_SSR_FL_SSR_ENROLL_FL"
            );
            if (!enrollBtn) {
              logMessage("Error: Enroll button not found.");
              return;
            }
            try {
              enrollBtn.click();
              logMessage("The script clicks the Enroll button.");
            } catch (e) {
              logMessage("Cannot click the Enroll button: " + e.message);
            }
          }, 80); // Buffer after detection: covers the ~70 ms system clock offset
          clearInterval(interval);
        }
      }, 50); // Poll every 50 ms: detection lag is at most 50 ms
    }, 2000); // Wait for 2 seconds before starting
  }
})();
