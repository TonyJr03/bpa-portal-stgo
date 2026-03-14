// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="vite/client" />
/// <reference types="../vendor/integration/types.d.ts" />

interface ImportMetaEnv {
  /**
   * URL base del servidor PocketBase.
   * Definida en el archivo .env de la raíz del proyecto.
   * El prefijo PUBLIC_ expone la variable al navegador (islas Vue en runtime).
   *
   * @ejemplo  http://192.168.1.105:8090
   */
  readonly PUBLIC_PB_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
