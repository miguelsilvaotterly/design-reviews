const DEFAULT_APP = "https://design-reviews.vercel.app";
chrome.storage.sync.get({ appUrl: DEFAULT_APP }).then(({ appUrl }) => (document.getElementById("url").value = appUrl));
document.getElementById("save").onclick = async () => {
  const v = document.getElementById("url").value.trim().replace(/\/+$/, "") || DEFAULT_APP;
  await chrome.storage.sync.set({ appUrl: v });
  document.getElementById("msg").textContent = `Saved: ${v}`;
};
