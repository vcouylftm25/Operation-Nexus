/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Operation Nexus REST API, e.g. http://localhost:8000 */
  readonly VITE_API_URL: string;
  /** Base URL of the Operation Nexus WebSocket gateway, e.g. ws://localhost:8000 */
  readonly VITE_WS_URL: string;
  /** When "true", the app runs entirely against the in-memory mock API/WS. */
  readonly VITE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
