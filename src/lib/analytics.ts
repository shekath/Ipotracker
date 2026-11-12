// Google Tag Manager. The container ID lives in .env as VITE_GTM_ID; with it empty, nothing loads.
// GA4 itself is configured inside the GTM container. The app uses a HashRouter, so each route change
// pushes a "virtual_pageview" event with the hash route as page_path for a GA4 page_view tag to use.
const GTM_ID = (import.meta.env.VITE_GTM_ID ?? '').trim();
const LOCAL = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
const enabled = /^GTM-[A-Z0-9]+$/.test(GTM_ID) && !LOCAL;

declare global {
  interface Window { dataLayer?: Record<string, unknown>[] }
}

let started = false;
function init() {
  if (!enabled || started) return;
  started = true;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    'gtm.start': Date.now(),
    event: 'gtm.js',
    platform: /MarketLensApp/.test(navigator.userAgent) ? 'android_app' : 'web',
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(s);
}

export function trackPageView(path: string) {
  if (!enabled) return;
  init();
  window.dataLayer!.push({
    event: 'virtual_pageview',
    page_path: path,
    page_location: `${location.origin}${path}`,
    page_title: document.title,
  });
}
