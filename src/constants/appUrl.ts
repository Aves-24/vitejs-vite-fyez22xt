// Adres aplikacji — jedno miejsce (link i QR w Ustawieniach, ekran przeprowadzki).
// C42 (2026-09-25): z Vercela na Firebase Hosting, witryna `grot-x` (`grotx` za krótkie — min. 6 znaków) w projekcie grotx-fb8f8.
export const APP_HOST = 'grot-x.web.app';
export const APP_URL = `https://${APP_HOST}/`;

// Stary adres na Vercelu — tam pokazujemy ekran „GROT-X ma nowy adres” (MoveNotice).
export const OLD_HOSTS = ['vitejs-vite-fyez22xt.vercel.app'];
export const isOldHost = () => OLD_HOSTS.includes(window.location.hostname);
