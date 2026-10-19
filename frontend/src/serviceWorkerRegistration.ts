// ==============================================================================
// CogniDesk PWA Service Worker Registration & Installation Prompt Manager
// ==============================================================================

type InstallPromptCallback = (canInstall: boolean) => void;

let deferredPrompt: any = null;
const installListeners = new Set<InstallPromptCallback>();

export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Register sw.js at root scope
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('[PWA] Service Worker registered successfully with scope:', registration.scope);

          // Check for worker updates
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    console.log('[PWA] New version of CogniDesk is available.');
                  } else {
                    console.log('[PWA] CogniDesk is cached and ready for offline use.');
                  }
                }
              };
            }
          };
        })
        .catch((error) => {
          console.warn('[PWA] Service Worker registration failed:', error);
        });
    });

    // Capture install prompt event for custom install button
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
      installListeners.forEach((callback) => callback(true));
      console.log('[PWA] Installation prompt captured and available.');
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      installListeners.forEach((callback) => callback(false));
      console.log('[PWA] CogniDesk PWA was successfully installed.');
    });
  }
}

export function onInstallPromptChange(callback: InstallPromptCallback): () => void {
  installListeners.add(callback);
  callback(Boolean(deferredPrompt));
  return () => {
    installListeners.delete(callback);
  };
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredPrompt) {
    console.log('[PWA] Install prompt is not available.');
    return false;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  installListeners.forEach((callback) => callback(false));
  return outcome === 'accepted';
}

export function isPwaInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
