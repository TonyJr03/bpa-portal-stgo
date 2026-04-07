<script setup lang="ts">
/**
 * @componente  src/components/vue/TasasMiniWidget.vue
 * @directiva   client:visible  (inyectado desde AccesoRapidoHome.astro)
 *
 * @descripcion
 *   Micro-widget de tasas de cambio para la tarjeta de Acceso Rápido del Home.
 *   Muestra las primeras 3 monedas activas con sus tasas de compra y venta.
 *
 * @i18n — dos capas:
 *   1. Campos de PocketBase con traducción directa:
 *      · monedas.nombre_moneda / nombre_moneda_en → nombre de la divisa
 *      Se usa en el atributo title de cada fila para accesibilidad.
 *      El código ISO (USD, EUR…) no se traduce — es universal.
 *
 *   2. Strings de interfaz pura → objeto local `ui` (NO van a .ts):
 *      · Labels de columnas, timestamp, mensajes de carga/error
 *
 * @props
 *   lang  'es' | 'en'  — idioma activo, inyectado por AccesoRapidoHome.astro
 *
 * @coleccion  monedas
 *   moneda           Text    → código ISO (USD, EUR, MLC…)
 *   nombre_moneda    Text    → nombre completo en español
 *   nombre_moneda_en Text    → nombre completo en inglés (puede estar vacío)
 *   compra           Number  → tasa de compra en CUP
 *   venta            Number  → tasa de venta en CUP
 *   activa           Bool
 *   updated          Date    → campo automático de PocketBase
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, computed, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

import { useFieldTranslation, useLocalTranslations, type Lang } from '~/i18n/utils';

// ── Props ─────────────────────────────────────────────────────────────────────
const props = defineProps<{ lang: Lang }>();

// ── Traducción de campos de PocketBase ───────────────────────────────────────
const tf = useFieldTranslation(props.lang);

// ── Strings de interfaz pura (local — no van a los archivos .ts) ───────────────
const tl = useLocalTranslations(props.lang, {
  es: {
    colCurrency: 'Moneda',
    colBuy:      'Compra',
    colSell:     'Venta',
    updated:     'Actualizado:',
    noRates:     'No hay tasas disponibles',
    retry:       'Reintentar',
    errorMsg:    'No disponible. Sin conexión con el servidor.',
  },
  en: {
    colCurrency: 'Currency',
    colBuy:      'Buy',
    colSell:     'Sell',
    updated:     'Updated:',
    noRates:     'No rates available',
    retry:       'Retry',
    errorMsg:    'Not available. No server connection.',
  },
});

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface TasaCambio {
  id:               string;
  moneda:           string;
  nombre_moneda:    string;
  nombre_moneda_en: string; // campo _en de PocketBase
  compra:           number;
  venta:            number;
  activa:           boolean;
  updated:          string;
}

// ── Estado ────────────────────────────────────────────────────────────────────
const tasas    = ref<TasaCambio[]>([]);
const cargando = ref(true);
const errorDB  = ref(false);

// Las primeras 3 monedas activas según el orden de PocketBase
const tasasFiltradas = computed(() => tasas.value.filter((t) => t.activa).slice(0, 3));

const ultimaActualizacion = computed<string | null>(() => {
  if (!tasas.value.length) return null;
  const mas = tasas.value.reduce((prev, curr) =>
    new Date(curr.updated) > new Date(prev.updated) ? curr : prev,
  );
  try {
    return new Intl.DateTimeFormat(props.lang === 'en' ? 'en-US' : 'es-CU', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
    }).format(new Date(mas.updated));
  } catch { return null; }
});

// ── Carga de datos ────────────────────────────────────────────────────────────
const cargarTasas = async () => {
  cargando.value = true;
  errorDB.value  = false;
  try {
    // Se solicitan todos los campos incluidos nombre_moneda_en
    const resultado = await pb.collection('monedas').getFullList<TasaCambio>({
      filter: 'activa = true',
      sort:   'orden',
      fields: 'id,moneda,nombre_moneda,nombre_moneda_en,compra,venta,activa,updated',
    });
    tasas.value = resultado;
  } catch {
    errorDB.value = true;
  } finally {
    cargando.value = false;
  }
};

onMounted(cargarTasas);
</script>

<template>

  <!-- ── Cargando ────────────────────────────────────────────────────────── -->
  <div v-if="cargando" class="space-y-2 animate-pulse">
    <div class="flex justify-between items-center py-2 border-b border-bpa-100/50 dark:border-bpa-800/50">
      <div class="h-3 w-20 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
      <div class="flex gap-3">
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
      </div>
    </div>
    <div class="flex justify-between items-center py-2 border-b border-bpa-100/50 dark:border-bpa-800/50">
      <div class="h-3 w-16 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
      <div class="flex gap-3">
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
      </div>
    </div>
    <div class="flex justify-between items-center py-2">
      <div class="h-3 w-16 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
      <div class="flex gap-3">
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded" />
      </div>
    </div>
  </div>

  <!-- ── Error ──────────────────────────────────────────────────────────── -->
  <div v-else-if="errorDB" class="text-center py-2">
    <p class="text-xs text-red-500 dark:text-red-400 mb-1">{{ tl('errorMsg') }}</p>
    <button @click="cargarTasas" class="text-xs text-primary dark:text-primary hover:underline">
      {{ tl('retry') }}
    </button>
  </div>

  <!-- ── Datos ──────────────────────────────────────────────────────────── -->
  <div v-else>

    <!-- Cabecera de columnas -->
    <div class="flex justify-between items-center text-xs font-semibold text-primary dark:text-primary uppercase tracking-wide mb-1 pb-1 border-b border-bpa-100/50 dark:border-bpa-amber-800/50">
      <span>{{ tl('colCurrency') }}</span>
      <div class="flex gap-4">
        <span class="w-14 text-right">{{ tl('colBuy') }}</span>
        <span class="w-14 text-right">{{ tl('colSell') }}</span>
      </div>
    </div>

    <!-- Filas de tasas -->
    <!--
      El código ISO de la moneda (USD, EUR…) es universal y no se traduce.
      El nombre completo traducido se usa como title para accesibilidad → tf().
    -->
    <div
      v-for="tasa in tasasFiltradas"
      :key="tasa.id"
      class="flex justify-between items-center py-2 border-b border-bpa-100/30 dark:border-bpa-amber-800/30 last:border-0"
      :title="tf(tasa.nombre_moneda, tasa.nombre_moneda_en)"
    >
      <!-- Código ISO de la moneda (no traducible: es un estándar internacional) -->
      <span class="text-sm font-semibold text-default dark:text-default font-mono tracking-wide">
        {{ tasa.moneda }}
      </span>
      <div class="flex gap-4">
        <!-- Compra: emerald — distinción financiera semántica universal -->
        <span class="w-14 text-right text-sm font-mono text-emerald-600 dark:text-emerald-400 font-medium">
          {{ tasa.compra.toFixed(2) }}
        </span>
        <!-- Venta: rose — distinción financiera semántica universal -->
        <span class="w-14 text-right text-sm font-mono text-rose-600 dark:text-rose-400 font-medium">
          {{ tasa.venta.toFixed(2) }}
        </span>
      </div>
    </div>

    <!-- Sin tasas -->
    <p v-if="!tasasFiltradas.length" class="text-xs text-muted dark:text-muted text-center py-2">
      {{ tl('noRates') }}
    </p>

    <!-- Timestamp de actualización -->
    <p v-if="ultimaActualizacion" class="text-xs text-muted dark:text-muted mt-2 text-right">
      {{ tl('updated') }} {{ ultimaActualizacion }}
    </p>

  </div>
</template>
