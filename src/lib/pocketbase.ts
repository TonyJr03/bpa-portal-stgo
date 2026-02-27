import PocketBase from 'pocketbase';

// Apuntamos a la dirección donde se ejecuta tu PocketBase local
export const pb = new PocketBase('http://127.0.0.1:8090');

// Desactivamos la cancelación automática para evitar errores en Astro (SSR)
pb.autoCancellation(false);
