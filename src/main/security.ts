// Règles de sécurité appliquées à toutes les vues et à toutes les sessions.
import { app, BrowserWindow, type Session, type WebContents } from 'electron';
import { permNames } from './settings.js';

export const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

/** User-Agent identique à Chrome : sans "Electron/x" ni le nom de l'appli (sinon Google refuse la connexion). */
export function chromeUserAgent(): string {
  return app.userAgentFallback
    .replace(/ Electron\/\S+/, '')
    .replace(new RegExp(` (${app.getName()}|navigateur_mini|Phosphore)\\/\\S+`, 'gi'), '')
    .replace(/Chrome\/(\d+)\.[\d.]+/, 'Chrome/$1.0.0.0');
}

const chromeMajor = () => (/Chrome\/(\d+)/.exec(chromeUserAgent())?.[1]) ?? '152';

/**
 * Google refuse la connexion à Electron même déguisé en Chrome (tests JS) ; en Firefox il ne fait pas ces tests.
 * Seulement les pages de saisie du compte : RotateCookies, CheckCookie, ListAccounts… restent en Chrome, sinon Google
 * voit la même session passer de Chrome à Firefox à chaque rotation des cookies et la ferme (tous les comptes déconnectés).
 */
export const isGoogleLogin = (url: string) =>
  /^https:\/\/accounts\.google\.com\/(v\d\/)?(signin|ServiceLogin|AccountChooser|InteractiveLogin|lifecycle|speedbump|challenge|AddSession)/i.test(url);
// Version Firefox actuelle estimée : 135 le 4 févr. 2025, puis une version toutes les 4 semaines.
const firefoxUserAgent = () => {
  const v = 135 + Math.floor((Date.now() - Date.UTC(2025, 1, 4)) / (28 * 864e5));
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
};
export const userAgentFor = (url: string) => isGoogleLogin(url) ? firefoxUserAgent() : chromeUserAgent();

const hostOf = (u: string | undefined) => { try { return new URL(u ?? '').hostname.replace(/^www\./, ''); } catch { return ''; } };

/**
 * Permissions : tout est refusé, sauf le plein écran (vidéos) et ce que l'utilisateur a accordé à un site (perm allow).
 * allowed(site, nom) répond pour un site et un droit ; un sous-domaine hérite du domaine.
 */
export function hardenSession(ses: Session, allowed: (host: string, perm: string) => boolean = () => false, strict: () => boolean = () => false): void {
  ses.setUserAgent(chromeUserAgent());
  const ok = (permission: string, url: string | undefined, media?: string[]) => {
    if (permission === 'fullscreen') return true;
    const names = permNames(permission, media);
    const host = hostOf(url);
    return !!host && names.length > 0 && names.every(n => allowed(host, n));
  };
  ses.setPermissionRequestHandler((wc, permission, cb, details) => cb(ok(permission, details.requestingUrl || wc.getURL(), (details as { mediaTypes?: string[] }).mediaTypes)));
  ses.setPermissionCheckHandler((_wc, permission, origin) => permission === 'media' ? ['camera', 'microphone'].some(n => ok('media', origin, [n === 'camera' ? 'video' : 'audio'])) : ok(permission, origin));
  // Appareils physiques (USB, HID, port série, Bluetooth) : toujours refusés, aucun site n'y accède.
  ses.setDevicePermissionHandler(() => false);
  // Client hints alignés sur Chrome : Electron n'annonce pas « Google Chrome », ce qui fait échouer la connexion Google.
  const v = chromeMajor();
  const brands = `"Chromium";v="${v}", "Google Chrome";v="${v}", "Not=A?Brand";v="99"`;
  ses.webRequest.onBeforeSendHeaders((d, cb) => {
    // Document principal seulement : un iframe ou un fetch garde le navigator.userAgent Chrome de sa page.
    if (d.resourceType === 'mainFrame' && isGoogleLogin(d.url)) {
      // Firefox n'envoie pas de client hints : on les retire pour rester cohérent avec son User-Agent.
      for (const k of Object.keys(d.requestHeaders)) if (/^sec-ch-ua/i.test(k)) delete d.requestHeaders[k];
      d.requestHeaders['User-Agent'] = userAgentFor(d.url);
    } else if (d.requestHeaders['sec-ch-ua'] || d.requestHeaders['Sec-CH-UA']) {
      d.requestHeaders['sec-ch-ua'] = brands;
      d.requestHeaders['sec-ch-ua-full-version-list'] = `"Chromium";v="${v}.0.0.0", "Google Chrome";v="${v}.0.0.0", "Not=A?Brand";v="99.0.0.0"`;
    }
    // Confidentialité « strict » : vers un autre site, on ne transmet que l'origine du référent (pas le chemin ni la requête).
    if (strict()) {
      const key = 'Referer' in d.requestHeaders ? 'Referer' : 'referer' in d.requestHeaders ? 'referer' : '';
      if (key) try { const r = new URL(d.requestHeaders[key]), t = new URL(d.url); if (r.hostname !== t.hostname) d.requestHeaders[key] = r.origin + '/'; } catch { /* référent vide */ }
    }
    cb({ requestHeaders: d.requestHeaders });
  });
}

export interface OpenRules {
  isUi(wc: WebContents): boolean;
  openTab(url: string, background: boolean, from: WebContents): void;
}

/** Appliqué à chaque webContents créé (interface, onglets, popups). */
export function hardenWebContents(rules: OpenRules): void {
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', e => e.preventDefault());

    // Pages autorisées : http(s) pour les sites, et chrome-extension:// pour les pages d'une extension (popup ouvert avec « ext open »).
    const allowedPage = (url: string) => isWebUrl(url) || url.startsWith('chrome-extension://');
    const guard = (e: { preventDefault(): void }, url: string) => {
      if (rules.isUi(wc) || !allowedPage(url)) e.preventDefault(); // l'interface ne navigue jamais ; les sites restent en http(s)/extension
    };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', guard);
    // navigator.userAgent de la page doit dire la même chose que l'en-tête (Firefox sur accounts.google.com).
    wc.on('did-start-navigation', ({ url, isMainFrame }) => {
      if (isMainFrame && !rules.isUi(wc) && isWebUrl(url) && wc.getUserAgent() !== userAgentFor(url)) wc.setUserAgent(userAgentFor(url));
    });

    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (rules.isUi(wc) || !allowedPage(url)) return { action: 'deny' };
      // Liens "nouvel onglet" (target=_blank, Ctrl+clic) : un onglet, pas une fenêtre.
      if (disposition !== 'new-window') {
        rules.openTab(url, disposition === 'background-tab', wc);
        return { action: 'deny' };
      }
      // Popups de connexion (OAuth) : elles ont besoin de window.opener, donc une vraie petite fenêtre.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520, height: 680, autoHideMenuBar: true, backgroundColor: '#ffffff',
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
        },
      };
    });

    wc.on('did-create-window', (win: BrowserWindow) => {
      // Le titre affiche toujours le vrai domaine : une popup ne peut pas se faire passer pour un autre site.
      const title = () => { try { win.setTitle('POPUP · ' + new URL(win.webContents.getURL()).host); } catch { /* URL vide */ } };
      win.on('page-title-updated', e => { e.preventDefault(); title(); });
      win.webContents.on('did-navigate', title);
    });
  });
}
