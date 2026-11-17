// Analytics: Google Analytics 4 (VITE_GA_ID) loaded directly, plus Google Tag Manager (VITE_GTM_ID)
// for any other tags. Either ID left empty in .env turns that part off; nothing loads on local hosts.
// The app uses a HashRouter, so GA4's automatic page view would only ever see "/". Page views are
// sent by hand on each route change instead, with the hash route as the page path. Do not also add a
// GA4 page_view tag inside the GTM container, or every page is counted twice.
const GA_ID = (import.meta.env.VITE_GA_ID ?? '').trim();
const GTM_ID = (import.meta.env.VITE_GTM_ID ?? '').trim();
const LOCAL = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
const gaOn = /^G-[A-Z0-9]+$/.test(GA_ID) && !LOCAL;
const gtmOn = /^GTM-[A-Z0-9]+$/.test(GTM_ID) && !LOCAL;
const platform = /MarketLensApp/.test(navigator.userAgent) ? 'android_app' : 'web';

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: Gtag }
}

function load(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

let started = false;
function init() {
  if (started) return;
  started = true;
  window.dataLayer = window.dataLayer || [];
  if (gtmOn) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js', platform });
    load(`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`);
  }
  if (gaOn) {
    // gtag must push the arguments object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    window.gtag = function gtag() { window.dataLayer!.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { send_page_view: false });
    window.gtag('set', 'user_properties', { platform });
    load(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
  }
}

export function trackPageView(path: string) {
  if (!gaOn && !gtmOn) return;
  init();
  const page = { page_path: path, page_location: `${location.origin}${path}`, page_title: document.title };
  if (gaOn) window.gtag!('event', 'page_view', page);
  if (gtmOn) window.dataLayer!.push({ event: 'virtual_pageview', ...page });
}
