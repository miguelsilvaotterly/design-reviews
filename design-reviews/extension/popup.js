// Popup logic: load reviews from the app, capture the active tab, POST to /api/capture, open the new screen.
const DEFAULT_APP = "https://design-reviews.vercel.app";
const $ = (id) => document.getElementById(id);

async function appUrl() {
  const { appUrl } = await chrome.storage.sync.get({ appUrl: DEFAULT_APP });
  return appUrl.replace(/\/+$/, "");
}

function show(id, on) {
  $(id).classList.toggle("hidden", !on);
}

async function init() {
  const base = await appUrl();
  $("opts").onclick = (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  };
  $("open-app").onclick = () => chrome.tabs.create({ url: `${base}/login` });

  let data;
  try {
    const res = await fetch(`${base}/api/capture`, { credentials: "include" });
    if (res.status === 401 || res.status === 403) {
      const j = await res.json().catch(() => ({}));
      $("signin-msg").textContent = j.error || "Sign in to Design reviews first.";
      show("signin", true);
      return;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    data = await res.json();
  } catch (e) {
    $("signin-msg").textContent = `Can't reach ${base}: ${e.message}`;
    show("signin", true);
    return;
  }

  $("who").textContent = data.email;
  const sel = $("review");
  const { lastReviewId } = await chrome.storage.sync.get({ lastReviewId: "" });
  for (const r of data.reviews) {
    const o = document.createElement("option");
    o.value = r.id;
    o.textContent = `${r.name} (${r.screens})`;
    if (r.id === lastReviewId) o.selected = true;
    sel.appendChild(o);
  }
  const plus = document.createElement("option");
  plus.value = "__new__";
  plus.textContent = "+ New review…";
  sel.appendChild(plus);
  if (!data.reviews.length) sel.value = "__new__";
  const syncNew = () => show("new-review-label", sel.value === "__new__");
  sel.onchange = syncNew;
  syncNew();
  show("form", true);

  $("form").onsubmit = async (e) => {
    e.preventDefault();
    const go = $("go");
    const msg = $("msg");
    msg.className = "msg";
    go.disabled = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab");
      if (/^(chrome|edge|about|chrome-extension):/.test(tab.url || "")) throw new Error("Can't capture browser pages.");
      msg.textContent = "Capturing…";
      const blob = $("fullpage").checked ? await captureFullPage(tab) : await captureVisible(tab);

      msg.textContent = "Uploading…";
      const fd = new FormData();
      fd.set("file", blob, "production.png");
      if (sel.value === "__new__") {
        const name = $("new-review").value.trim();
        if (!name) throw new Error("Give the new review a name.");
        fd.set("newReviewName", name);
      } else {
        fd.set("reviewId", sel.value);
        await chrome.storage.sync.set({ lastReviewId: sel.value });
      }
      fd.set("title", $("title").value.trim());
      fd.set("sourceUrl", tab.url || "");
      const res = await fetch(`${base}/api/capture`, { method: "POST", body: fd, credentials: "include" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `${res.status} ${res.statusText}`);
      msg.textContent = "Done — opening the screen.";
      await chrome.tabs.create({ url: `${base}${j.url}` });
      window.close();
    } catch (err) {
      msg.className = "msg err";
      msg.textContent = err.message || String(err);
      go.disabled = false;
    }
  };
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/data:([^;]+)/)[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Visible viewport at the display's pixel ratio. */
async function captureVisible(tab) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  return dataUrlToBlob(dataUrl);
}

/** Whole scrollable page in one shot via the DevTools protocol (shows Chrome's "debugging" bar briefly). */
async function captureFullPage(tab) {
  const target = { tabId: tab.id };
  const send = (method, params) => chrome.debugger.sendCommand(target, method, params);
  await chrome.debugger.attach(target, "1.3");
  try {
    const { cssContentSize, cssVisualViewport } = await send("Page.getLayoutMetrics", {});
    const width = Math.ceil(cssVisualViewport?.clientWidth || cssContentSize.width);
    const height = Math.min(Math.ceil(cssContentSize.height), 16384);
    const dprRes = await send("Runtime.evaluate", { expression: "window.devicePixelRatio", returnByValue: true }).catch(() => null);
    const dpr = Number(dprRes?.result?.value) || 2;
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
    // Let lazy content and sticky elements settle.
    await new Promise((r) => setTimeout(r, 350));
    const { data } = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    await send("Emulation.clearDeviceMetricsOverride", {});
    return dataUrlToBlob(`data:image/png;base64,${data}`);
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}

init();
