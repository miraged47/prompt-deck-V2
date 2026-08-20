/* ============================================================
   Prompt Deck — desktop bridge
   Copyright (c) 2026 Mirac Cavdur. All rights reserved.

   Connects the original Prompt Deck UI to the Rust shell:
     • AI assistant requests go through Rust (no browser CORS wall)
     • Export downloads open a native "Save as…" dialog
     • Clipboard falls back to the native clipboard if the webview refuses
     • Update checking, download progress and install, in the app's own style

   Loaded with `defer`, and a no-op when index.html is opened in a plain
   browser — the web build keeps working exactly as before.
   ============================================================ */
(function () {
  "use strict";

  var T = window.__TAURI__;
  if (!T || !T.core || typeof T.core.invoke !== "function") return;

  var invoke = T.core.invoke;
  var listen = T.event && T.event.listen;
  var origFetch = window.fetch ? window.fetch.bind(window) : null;

  /* ---------- 1. AI assistant: route api.anthropic.com through Rust ---------- */
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url ? input.url : "";
      if (url.indexOf("https://api.anthropic.com/") !== 0) return origFetch(input, init);

      var opts = init || {};
      var headers = new Headers((opts.headers || (input && input.headers)) || {});
      var apiKey = headers.get("x-api-key") || "";
      var body;
      try {
        body = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body || {};
      } catch (e) {
        body = {};
      }

      return invoke("anthropic_messages", { apiKey: apiKey, body: body }).then(
        function (json) {
          return new Response(JSON.stringify(json), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        },
        function (err) {
          var msg = String(err && err.message ? err.message : err);
          if (msg.indexOf("missing-api-key") >= 0) msg = "No API key set.";
          return new Response(JSON.stringify({ error: { message: msg } }), {
            status: 502,
            headers: { "content-type": "application/json" }
          });
        }
      );
    };
  }

  /* ---------- 2. Exports: blob download -> native save dialog ---------- */
  function toBase64(url) {
    return origFetch(url)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var fr = new FileReader();
          fr.onload = function () {
            var s = String(fr.result);
            resolve(s.slice(s.indexOf(",") + 1));
          };
          fr.onerror = function () { reject(fr.error); };
          fr.readAsDataURL(blob);
        });
      });
  }

  document.addEventListener(
    "click",
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[download]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (!/^(blob:|data:)/.test(href)) return;

      e.preventDefault();
      e.stopPropagation();
      toBase64(href)
        .then(function (b64) {
          return invoke("save_file", {
            defaultName: a.getAttribute("download") || "prompt-deck-export",
            dataBase64: b64
          });
        })
        .then(function (path) {
          if (path) toast("Saved · " + path.split(/[\\/]/).pop());
        })
        .catch(function (err) { toast("Save failed · " + err, true); });
    },
    true
  );

  /* ---------- 3. Clipboard fallback ---------- */
  (function () {
    var native =
      navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText.bind(navigator.clipboard)
        : null;

    function writeText(text) {
      var viaPlugin = function () {
        return invoke("plugin:clipboard-manager|write_text", {
          data: { plainText: { label: null, text: String(text) } }
        });
      };
      if (!native) return viaPlugin();
      return native(text).catch(viaPlugin);
    }

    try {
      if (navigator.clipboard) {
        Object.defineProperty(navigator.clipboard, "writeText", {
          value: writeText, configurable: true, writable: true
        });
      } else {
        Object.defineProperty(navigator, "clipboard", {
          value: { writeText: writeText }, configurable: true
        });
      }
    } catch (e) { /* keep whatever the webview gives us */ }
  })();

  /* ---------- 4. Styles for the desktop-only bits ---------- */
  var css = document.createElement("style");
  css.textContent = [
    ".pd-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(14px);z-index:99999;",
    "background:var(--panel,#fff);color:var(--ink,#0f1f2e);border:1px solid var(--line,#c9d9ec);border-radius:11px;",
    "padding:9px 15px;font:500 12.5px/1.3 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(40,70,105,.18);",
    "opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s cubic-bezier(.22,1,.36,1);max-width:min(560px,86vw)}",
    ".pd-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}",
    ".pd-toast.err{border-color:var(--red,#d3593f);color:var(--red,#d3593f)}",

    ".pd-upd{position:fixed;right:20px;bottom:20px;z-index:99998;width:322px;",
    "background:var(--panel,#fff);border:1px solid var(--line,#c9d9ec);border-radius:14px;padding:14px 15px 13px;",
    "box-shadow:0 16px 44px rgba(40,70,105,.22);font-family:Inter,system-ui,sans-serif;color:var(--ink,#0f1f2e);",
    "opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;",
    "transition:opacity .24s ease,transform .24s cubic-bezier(.22,1,.36,1)}",
    ".pd-upd.on{opacity:1;transform:none;pointer-events:auto}",
    ".pd-upd-h{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.7px;",
    "text-transform:uppercase;color:var(--steel,#4a6fa5);margin-bottom:7px}",
    ".pd-upd-h .dot{width:7px;height:7px;border-radius:50%;background:var(--steel,#4a6fa5);flex:none}",
    ".pd-upd-t{font-size:13.5px;font-weight:700;margin-bottom:3px}",
    ".pd-upd-s{font-size:11.5px;line-height:1.45;color:var(--mute,#6a90ae);max-height:76px;overflow:auto;white-space:pre-wrap}",
    ".pd-upd-row{display:flex;gap:8px;margin-top:11px}",
    ".pd-upd-row button{flex:1;font:700 12px/1 Inter,system-ui,sans-serif;padding:9px 10px;border-radius:9px;cursor:pointer;",
    "border:1px solid var(--line2,#adc7e2);background:var(--panel2,#dce8f5);color:var(--ink2,#2d5270);transition:.14s}",
    ".pd-upd-row button.primary{background:var(--steel,#4a6fa5);border-color:var(--steel,#4a6fa5);color:#fff}",
    ".pd-upd-row button:hover{filter:brightness(1.06)}",
    ".pd-upd-row button:active{transform:scale(.97)}",
    ".pd-upd-bar{height:5px;border-radius:3px;background:var(--panel3,#c8ddf0);overflow:hidden;margin-top:11px}",
    ".pd-upd-bar i{display:block;height:100%;width:0;background:var(--steel,#4a6fa5);border-radius:3px;transition:width .18s linear}",

    ".pd-desk{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;",
    "border:1px solid var(--line,#c9d9ec);border-radius:11px;padding:11px 13px;background:var(--bg2,#e4edf7)}",
    ".pd-desk .meta{font:500 11.5px/1.5 Inter,system-ui,sans-serif;color:var(--mute,#6a90ae)}",
    ".pd-desk .meta b{color:var(--ink,#0f1f2e);font-weight:800}",
    ".pd-desk button{font:700 11.5px/1 Inter,system-ui,sans-serif;padding:8px 13px;border-radius:9px;cursor:pointer;",
    "border:1px solid var(--line2,#adc7e2);background:var(--panel,#fff);color:var(--ink2,#2d5270);transition:.14s}",
    ".pd-desk button:hover{border-color:var(--steel,#4a6fa5);color:var(--steel,#4a6fa5)}",
    ".pd-desk button:disabled{opacity:.55;cursor:default}",
    "@media (prefers-reduced-motion:reduce){.pd-toast,.pd-upd{transition:none}}"
  ].join("");
  document.head.appendChild(css);

  /* ---------- 5. Toast ---------- */
  var toastEl = null, toastTimer = null;
  function toast(msg, isErr) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "pd-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.toggle("err", !!isErr);
    requestAnimationFrame(function () { toastEl.classList.add("on"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, 4200);
  }

  /* ---------- 6. Update panel ---------- */
  var pill = null, pillBar = null, pillTitle = null, pillSub = null, pillRow = null;
  function buildPill() {
    if (pill) return;
    pill = document.createElement("div");
    pill.className = "pd-upd";
    pill.innerHTML =
      '<div class="pd-upd-h"><span class="dot"></span><span>Update</span></div>' +
      '<div class="pd-upd-t"></div><div class="pd-upd-s"></div>' +
      '<div class="pd-upd-bar" hidden><i></i></div>' +
      '<div class="pd-upd-row"></div>';
    document.body.appendChild(pill);
    pillTitle = pill.querySelector(".pd-upd-t");
    pillSub = pill.querySelector(".pd-upd-s");
    pillBar = pill.querySelector(".pd-upd-bar");
    pillRow = pill.querySelector(".pd-upd-row");
  }
  function showPill(title, sub, buttons, percent) {
    buildPill();
    pillTitle.textContent = title;
    pillSub.textContent = sub || "";
    pillSub.style.display = sub ? "" : "none";
    pillRow.innerHTML = "";
    (buttons || []).forEach(function (b) {
      var el = document.createElement("button");
      el.textContent = b.label;
      if (b.primary) el.className = "primary";
      el.addEventListener("click", b.onClick);
      pillRow.appendChild(el);
    });
    pillRow.style.display = buttons && buttons.length ? "" : "none";
    if (typeof percent === "number") {
      pillBar.hidden = false;
      pillBar.firstChild.style.width = Math.max(0, Math.min(100, percent)) + "%";
    } else {
      pillBar.hidden = true;
    }
    requestAnimationFrame(function () { pill.classList.add("on"); });
  }
  function hidePill() { if (pill) pill.classList.remove("on"); }

  // Release bodies carry install instructions below a "---" rule; the update
  // card only wants the part above it — what actually changed.
  function cleanNotes(text) {
    if (!text) return "";
    return String(text).split(/\n-{3,}[ \t]*\n/)[0].trim();
  }

  var checkBtn = null, checkMsg = null;
  function setCheckState(text, busy) {
    if (checkMsg) checkMsg.textContent = text || "";
    if (checkBtn) checkBtn.disabled = !!busy;
  }

  if (listen) {
    listen("pd://update", function (ev) {
      var p = ev.payload || {};
      // Mirrored into the Rust log; only printed when running with PD_DIAG=1.
      invoke("diag", { report: { update: p } }).catch(function () {});
      if (p.state === "checking") {
        setCheckState("Checking…", true);
        if (p.manual) showPill("Checking for updates…", "", []);
      } else if (p.state === "available") {
        setCheckState("Version " + p.version + " available", false);
        showPill("Prompt Deck " + p.version + " is available", cleanNotes(p.notes), [
          { label: "Later", onClick: hidePill },
          {
            label: "Install & restart", primary: true,
            onClick: function () {
              invoke("install_update").catch(function (e) { toast("Update failed · " + e, true); });
            }
          }
        ]);
      } else if (p.state === "none") {
        setCheckState("You're on the latest version", false);
        if (p.manual) {
          showPill("You're up to date", "", []);
          setTimeout(hidePill, 2600);
        }
      } else if (p.state === "downloading") {
        setCheckState("Downloading…", true);
        showPill(
          "Downloading update",
          typeof p.percent === "number" ? Math.round(p.percent) + "%" : "",
          [], typeof p.percent === "number" ? p.percent : 0
        );
      } else if (p.state === "installing") {
        setCheckState("Installing…", true);
        showPill("Installing — Prompt Deck will restart", "", [], 100);
      } else if (p.state === "error") {
        setCheckState(p.message || "Update check failed", false);
        if (p.manual) {
          showPill("Update check failed", p.message || "", [{ label: "Close", onClick: hidePill }]);
        }
      }
    });
  }

  /* ---------- 7. Wire into the app's own chrome ---------- */
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(function () {
    invoke("frontend_ready").catch(function () {});

    invoke("app_version")
      .then(function (v) {
        var badge = document.getElementById("verBadge");
        if (badge) badge.textContent = "v" + v;
        var head = document.querySelector("#clModal .fs-modal-head h2 span");
        if (head) head.textContent = "v" + v;

        var body = document.querySelector("#clModal .cl-body");
        if (!body) return;
        var sec = document.createElement("div");
        sec.className = "cl-sec";
        sec.textContent = "Desktop app";
        var row = document.createElement("div");
        row.className = "pd-desk";
        row.innerHTML =
          '<div class="meta">Version <b>' + v + "</b><br><span id=\"pdCheckMsg\">Updates are downloaded from GitHub and signature-checked.</span></div>";
        checkBtn = document.createElement("button");
        checkBtn.textContent = "Check for updates";
        checkBtn.addEventListener("click", function () {
          setCheckState("Checking…", true);
          invoke("check_for_update").catch(function (e) { setCheckState(String(e), false); });
        });
        row.appendChild(checkBtn);
        body.appendChild(sec);
        body.appendChild(row);
        checkMsg = row.querySelector("#pdCheckMsg");
      })
      .catch(function () {});

    // Support diagnostics: run the app with PD_DIAG=1 to print this to stdout.
    setTimeout(function () {
      var report = {
        inlineScriptRan: typeof window.availableWordsSet === "function",
        localStorage: (function () {
          try { localStorage.setItem("_pdchk", "1"); localStorage.removeItem("_pdchk"); return true; }
          catch (e) { return false; }
        })(),
        fontsLoaded: !!(document.fonts && document.fonts.check && document.fonts.check("12px Inter")),
        clipboard: !!(navigator.clipboard && navigator.clipboard.writeText),
        secureContext: window.isSecureContext === true,
        chips: document.querySelectorAll(".chip, [data-kw]").length,
        userAgentPlatform: navigator.platform
      };
      invoke("diag", { report: report }).catch(function () {});
    }, 1500);
  });

  /* Escape closes the update pill, like the app's other overlays. */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hidePill();
  });

  window.promptDeck = {
    checkForUpdates: function () { return invoke("check_for_update"); },
    version: function () { return invoke("app_version"); }
  };
})();
