/** True when the app runs inside another page's frame (e.g. a hosted preview), where share links and downloads do not work. */
export const EMBEDDED = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
