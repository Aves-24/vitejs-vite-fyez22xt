/// <reference types="vite/client" />

declare global {
  // Injected przez vite.config.ts via `define` — data i godzina startu build/dev-server.
  const __BUILD_TIME__: string;
}

export {};
