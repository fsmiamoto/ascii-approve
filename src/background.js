// Clicking the toolbar icon opens the options page (there is no popup).
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Content scripts can't open the options page directly.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "open-options") chrome.runtime.openOptionsPage();
});
