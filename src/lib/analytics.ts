// Google Analytics 4. The Measurement ID lives in .env as VITE_GA_ID; with it empty, nothing loads.
// The app uses a HashRouter, so GA's automatic page view would only ever see "/". Page views are
// sent by hand on each route change instead, with the hash route as the page path.
const GA_ID = (import.meta.env.VITE_GA_ID ?? '').trim();
const LOCAL = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
const enabled = /^G-[A-Z0-9]+$/.test(GA_ID) && !LOCAL;

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: Gtag }
}

function init() {
  if (!enabled || window.gtag) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  // gtag must push the arguments object itself, not an array.
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function gtag() { window.dataLayer!.push(arguments); };
  window.gtag('js', new Date());
  const app = /MarketLensApp/.test(navigator.userAgent);
  window.gtag('config', GA_ID, { send_page_view: false, anonymize_ip: true });
  window.gtag('set', 'user_properties', { platform: app ? 'android_app' : 'web' });
}

export function trackPageView(path: string) {
  if (!enabled) return;
  init();
  window.gtag!('event', 'page_view', {
    page_path: path,
    page_location: `${location.origin}${path}`,
    page_title: document.title,
  });
}
