<script setup lang="ts">
/**
 * @componente  src/components/vue/TablonComunicados.vue
 * @directiva   client:visible  (inyectado desde Comunicados.astro)
 *
 * @responsabilidad
 *   Tablón de Comunicados institucionales en la página de inicio.
 *   Muestra los últimos 3 comunicados del BPA, ordenados por updated.
 *
 *   · Borde siempre verde/ámbar del tema (fijo, no depende del nivel)
 *   · Badge de la etiqueta sí depende del nivel: verde/ámbar si informativo,
 *     ámbar semántico si alerta, rojo si urgente
 *   · Botón "Leer más" al detalle si el registro tiene slug
 *   · "Ver todos" apunta a /actualidad?categoria=comunicado
 *
 * @coleccion  actualidad  (antes: noticias)
 *   filter: publicado = true && categoria = "comunicado"
 *   sort:   -updated
 *   limit:  3
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, onMounted, computed } from 'vue';
import { pb } from '~/lib/pocketbase';
import { useTranslations, useFieldTranslation, useLocalTranslations, type Lang } from '~/i18n/utils';

interface Comunicado {
  id: string; titulo: string; titulo_en: string;
  slug: string; resumen: string; resumen_en: string;
  fecha: string; nivel: 'informativo' | 'alerta' | 'urgente';
  categoria: string; publicado: boolean; imagen: string; collectionId: string;
}

const props = defineProps<{ lang: Lang }>();

// ── Traducción ────────────────────────────────────────────────────────────────
const t  = useTranslations(props.lang);
const tf = useFieldTranslation(props.lang);

// IMPORTANTE: el componente se reinstancia al cambiar de idioma, por lo que
// tl captura props.lang en el momento correcto sin necesidad de computed.
const tl = useLocalTranslations(props.lang, {
  es: {
    readMore:  'Leer más',
    noPending: 'Sin comunicados publicados por el momento',
    retry:     'Reintentar',
  },
  en: {
    readMore:  'Read more',
    noPending: 'No announcements published at the moment',
    retry:     'Retry',
  },
});

const CONFIG_NIVEL = {
  informativo: { badge: 'bg-bpa-100 text-bpa-800 dark:bg-bpa-amber-800/40 dark:text-bpa-amber-200' },
  alerta:      { badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
  urgente:     { badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
} as const;

const ICONO_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-12 h-12 opacity-50"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 8a3 3 0 0 1 0 6"/><path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5"/><path d="M12 8h0l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"/></svg>`;

const comunicados = ref<Comunicado[]>([]);
const cargando    = ref(true);
const errorDB     = ref(false);

const badgeLabel = (c: Comunicado) => {
  if (c.nivel === 'alerta')   return t('news.level.alerta');
  if (c.nivel === 'urgente')  return t('news.level.urgente');
  return t('news.level.informativo');
};

function formatearFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat(props.lang === 'en' ? 'en-US' : 'es-CU', {
      day: '2-digit', month: 'long', year: 'numeric',
    }).format(new Date(iso));
  } catch { return iso; }
}

function urlImagen(c: Comunicado): string | null {
  return c.imagen ? pb.files.getURL(c, c.imagen, { thumb: '600x300' }) : null;
}

const cargar = async () => {
  cargando.value = true; errorDB.value = false;
  try {
    const res = await pb.collection('actualidad').getList<Comunicado>(1, 3, {
      filter: 'publicado = true && categoria = "comunicado"', sort: '-updated',
      fields: 'id,titulo,titulo_en,slug,resumen,resumen_en,fecha,nivel,imagen,collectionId',
    });
    comunicados.value = res.items;
  } catch { errorDB.value = true; }
  finally { cargando.value = false; }
};

onMounted(cargar);
</script>

<template>
  <div v-if="cargando" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <div v-for="i in 3" :key="i" class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/60 overflow-hidden animate-pulse">
      <div class="h-40 bg-bpa-100 dark:bg-bpa-800/40"></div>
      <div class="p-5 space-y-3">
        <div class="h-3 bg-bpa-100 dark:bg-bpa-800/40 rounded w-24"></div>
        <div class="h-5 bg-bpa-100 dark:bg-bpa-800/40 rounded w-full"></div>
        <div class="h-4 bg-bpa-100 dark:bg-bpa-800/40 rounded w-4/5"></div>
      </div>
    </div>
  </div>

  <div v-else-if="errorDB" class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-8 text-center">
    <!-- tabler:wifi-off -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-10 h-10 mx-auto mb-3 text-red-400">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 18l.01 0"/><path d="M9.172 15.172a4 4 0 0 1 5.656 0"/><path d="M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 .155a7.965 7.965 0 0 1 3.287 2"/><path d="M3.515 9.515a12 12 0 0 1 3.544 -2.455m3.182 -.982a12 12 0 0 1 10.043 3.438"/><path d="M3 3l18 18"/>
    </svg>
    <button @click="cargar" class="mt-3 text-sm text-red-600 dark:text-red-400 underline">{{ tl('retry') }}</button>
  </div>

  <div v-else-if="!comunicados.length" class="rounded-xl border border-bpa-200 dark:border-bpa-amber-800 bg-bpa-50 dark:bg-bpa-950/60 p-10 text-center">
    <p class="font-semibold text-default dark:text-default">{{ tl('noPending') }}</p>
  </div>

  <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <article v-for="c in comunicados" :key="c.id"
      class="group flex flex-col rounded-xl border-2 bg-white dark:bg-bpa-950/60 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 border-bpa-400 dark:border-bpa-amber-600">
      <div class="overflow-hidden h-40 flex-shrink-0">
        <img v-if="urlImagen(c)" :src="urlImagen(c)!" :alt="tf(c.titulo, c.titulo_en)"
          class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
        <div v-else class="w-full h-full flex items-center justify-center bg-gradient-to-br from-bpa-600 to-bpa-100 dark:from-bpa-amber-600 dark:to-bpa-amber-950">
          <span class="text-bpa-50 dark:text-bpa-amber-200" v-html="ICONO_PLACEHOLDER"></span>
        </div>
      </div>
      <div class="flex flex-col flex-1 p-5 gap-3">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <span :class="['text-xs font-semibold px-2.5 py-1 rounded-full', CONFIG_NIVEL[c.nivel]?.badge ?? CONFIG_NIVEL.informativo.badge]">
            {{ badgeLabel(c) }}
          </span>
          <time :datetime="c.fecha" class="text-xs text-muted flex-shrink-0">{{ formatearFecha(c.fecha) }}</time>
        </div>
        <h3 class="font-bold text-default dark:text-default text-base leading-snug line-clamp-2">{{ tf(c.titulo, c.titulo_en) }}</h3>
        <p class="text-sm text-muted leading-relaxed line-clamp-3 flex-1">{{ tf(c.resumen, c.resumen_en) }}</p>
        <a v-if="c.slug" :href="`/${props.lang ?? 'es'}/actualidad/${c.slug}`"
          class="inline-flex items-center gap-1.5 text-sm font-medium mt-auto text-primary dark:text-primary hover:text-secondary dark:hover:text-secondary transition-colors">
          {{ tl('readMore') }}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>
          </svg>
        </a>
      </div>
    </article>
  </div>
</template>
