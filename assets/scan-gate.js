(function () {
  "use strict";

  const LOCK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<rect x="5" y="11" width="14" height="10" rx="2"/>' +
    '<path d="M8 11V8a4 4 0 0 1 8 0v3"/>' +
    "</svg>";

  function scanSlug() {
    const parts = window.location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }

  function storageKey(slug) {
    return "scan-unlock:" + slug;
  }

  function getStoredToken(slug) {
    try {
      return localStorage.getItem(storageKey(slug));
    } catch {
      return null;
    }
  }

  function setStoredToken(slug, token) {
    try {
      localStorage.setItem(storageKey(slug), token);
    } catch {
      /* ignore */
    }
  }

  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  function wrapSections(root) {
    const headings = [...root.querySelectorAll("h2")].filter((h2) => {
      const num = h2.querySelector(".num");
      if (!num) return false;
      const n = parseInt(num.textContent, 10);
      return n >= 1 && n <= 7;
    });

    headings.forEach((h2) => {
      const section = document.createElement("div");
      section.className = "scan-gate-section";
      h2.parentNode.insertBefore(section, h2);
      section.appendChild(h2);

      const body = document.createElement("div");
      body.className = "scan-gate-body scan-gate-locked";
      section.appendChild(body);

      const blur = document.createElement("div");
      blur.className = "scan-gate-blur";
      body.appendChild(blur);

      let sibling = section.nextSibling;
      while (sibling) {
        if (sibling.nodeType === 1 && sibling.tagName === "H2") break;
        const next = sibling.nextSibling;
        blur.appendChild(sibling);
        sibling = next;
      }

      const overlay = document.createElement("div");
      overlay.className = "scan-gate-overlay";
      overlay.setAttribute("role", "button");
      overlay.setAttribute("tabindex", "0");
      overlay.setAttribute("aria-label", "Unlock full report");
      overlay.innerHTML =
        '<span class="scan-gate-lock-btn">' +
        LOCK_SVG +
        '<span class="scan-gate-lock-label">Click to unlock</span>' +
        '<span class="scan-gate-lock-hint">Password or email code</span></span>';
      body.appendChild(overlay);
    });
  }

  function unlockPage(slug) {
    document.querySelectorAll(".scan-gate-body.scan-gate-locked").forEach((el) => {
      el.classList.remove("scan-gate-locked");
      el.querySelector(".scan-gate-overlay")?.remove();
    });
    document.dispatchEvent(new CustomEvent("scan-gate-unlocked", { detail: { slug } }));
  }

  function buildModal(slug) {
    const modal = document.createElement("div");
    modal.className = "scan-gate-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="scan-gate-modal-backdrop" data-close></div>' +
      '<div class="scan-gate-modal-panel" role="dialog" aria-labelledby="scan-gate-title">' +
      '<button type="button" class="scan-gate-close" data-close aria-label="Close">&times;</button>' +
      '<h3 id="scan-gate-title">Unlock full report</h3>' +
      '<p class="scan-gate-modal-sub">Enter the shared password or request a one-time code by email.</p>' +
      '<div class="scan-gate-tabs">' +
      '<button type="button" class="scan-gate-tab is-active" data-tab="password">Password</button>' +
      '<button type="button" class="scan-gate-tab" data-tab="email">Email code</button>' +
      "</div>" +
      '<div class="scan-gate-pane" data-pane="password">' +
      '<div class="scan-gate-field"><label for="scan-gate-password">Password</label>' +
      '<input id="scan-gate-password" type="password" autocomplete="current-password" /></div>' +
      '<div class="scan-gate-actions"><button type="button" class="btn btn-sm" data-submit-password>Unlock</button></div>' +
      "</div>" +
      '<div class="scan-gate-pane" data-pane="email" hidden>' +
      '<div class="scan-gate-field"><label for="scan-gate-email">Work email</label>' +
      '<input id="scan-gate-email" type="email" autocomplete="email" placeholder="you@company.com" /></div>' +
      '<div class="scan-gate-field" id="scan-gate-code-wrap" hidden>' +
      '<label for="scan-gate-code">6-digit code</label>' +
      '<input id="scan-gate-code" type="text" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" /></div>' +
      '<div class="scan-gate-actions">' +
      '<button type="button" class="btn btn-sm" data-send-otp>Send code</button>' +
      '<button type="button" class="btn btn-sm" data-submit-otp hidden>Verify &amp; unlock</button>' +
      "</div>" +
      "</div>" +
      '<p class="scan-gate-msg" aria-live="polite"></p>' +
      "</div>";
    document.body.appendChild(modal);

    const msg = modal.querySelector(".scan-gate-msg");
    const passwordInput = modal.querySelector("#scan-gate-password");
    const emailInput = modal.querySelector("#scan-gate-email");
    const codeInput = modal.querySelector("#scan-gate-code");
    const codeWrap = modal.querySelector("#scan-gate-code-wrap");
    const sendBtn = modal.querySelector("[data-send-otp]");
    const verifyBtn = modal.querySelector("[data-submit-otp]");

    function setMsg(text, type) {
      msg.textContent = text || "";
      msg.className = "scan-gate-msg" + (type ? " is-" + type : "");
    }

    function open() {
      modal.hidden = false;
      setMsg("");
      passwordInput.focus();
    }

    function close() {
      modal.hidden = true;
    }

    modal.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", close);
    });

    modal.querySelectorAll(".scan-gate-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const name = tab.getAttribute("data-tab");
        modal.querySelectorAll(".scan-gate-tab").forEach((t) => t.classList.toggle("is-active", t === tab));
        modal.querySelectorAll(".scan-gate-pane").forEach((pane) => {
          pane.hidden = pane.getAttribute("data-pane") !== name;
        });
        setMsg("");
      });
    });

    modal.querySelector("[data-submit-password]").addEventListener("click", async () => {
      setMsg("");
      try {
        const data = await apiPost("/api/scan-gate/verify", {
          slug,
          password: passwordInput.value,
        });
        setStoredToken(slug, data.token);
        unlockPage(slug);
        close();
      } catch (err) {
        setMsg(err.message, "error");
      }
    });

    sendBtn.addEventListener("click", async () => {
      setMsg("");
      const email = emailInput.value.trim();
      if (!email) {
        setMsg("Enter your email address.", "error");
        return;
      }
      sendBtn.disabled = true;
      try {
        await apiPost("/api/scan-gate/request-otp", { slug, email });
        codeWrap.hidden = false;
        verifyBtn.hidden = false;
        sendBtn.textContent = "Resend code";
        setMsg("Check your inbox for a 6-digit code from gaurav@revforgehq.com.", "success");
        codeInput.focus();
      } catch (err) {
        setMsg(err.message, "error");
      } finally {
        setTimeout(() => {
          sendBtn.disabled = false;
        }, 60000);
      }
    });

    verifyBtn.addEventListener("click", async () => {
      setMsg("");
      try {
        const data = await apiPost("/api/scan-gate/verify", {
          slug,
          email: emailInput.value.trim(),
          code: codeInput.value.trim(),
        });
        setStoredToken(slug, data.token);
        unlockPage(slug);
        close();
      } catch (err) {
        setMsg(err.message, "error");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) close();
    });

    return { open, close };
  }

  async function init() {
    const root = document.querySelector(".optavia-scan");
    if (!root) return;

    const slug = scanSlug();
    if (!slug) return;

    wrapSections(root);
    const modal = buildModal(slug);

    document.querySelectorAll(".scan-gate-overlay").forEach((overlay) => {
      const open = () => modal.open();
      overlay.addEventListener("click", open);
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });

    const token = getStoredToken(slug);
    if (token) {
      try {
        await apiPost("/api/scan-gate/verify", { slug, token });
        unlockPage(slug);
      } catch {
        try {
          localStorage.removeItem(storageKey(slug));
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
