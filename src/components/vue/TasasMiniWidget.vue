<script setup lang="ts">
/**
 * @componente  src/components/vue/TasasMiniWidget.vue
 * @directiva   client:visible  (inyectado desde AccesoRapidoHome.astro)
 *
 * @responsabilidad
 *   Micro-widget para la tarjeta de Acceso Rápido en el Home.
 *   Muestra únicamente el precio de COMPRA y VENTA del USD y EUR
 *   frente al CUP, con indicador de actualización reciente.
 *   Es intencionalmente minimal — el detalle completo está en
 *   /herramientas/tasas-de-cambio.
 *
 * @coleccion  tasas_cambio
 *   moneda        Text    → código ISO. Ej: 'USD', 'EUR'
 *   compra        Number  → tasa de compra en CUP
 *   venta         Number  → tasa de venta en CUP
 *   activa        Bool    → true si está operativa
 *   updated       Date    → campo automático de PocketBase
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, computed, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

// ── Interfaces ────────────────────────────────────────────────────────────────
interface TasaCambio {
  id:      string;
  moneda:  string;
  compra:  number;
  venta:   number;
  activa:  boolean;
  updated: string;
}

// ── Estado ────────────────────────────────────────────────────────────────────
const tasas    = ref<TasaCambio[]>([]);
const cargando = ref(true);
const errorDB  = ref(false);

// ── Computed: las 3 primeras monedas activas (según orden de PocketBase) ──────
const tasasFiltradas = computed(() =>
  tasas.value.filter(t => t.activa).slice(0, 3)
);

/** Hora de la última actualización en formato corto */
const ultimaActualizacion = computed<string | null>(() => {
  if (!tasas.value.length) return null;
  const mas = tasas.value.reduce((prev, curr) =>
    new Date(curr.updated) > new Date(prev.updated) ? curr : prev
  );
  try {
    return new Intl.DateTimeFormat('es-CU', {
      hour:   '2-digit',
      minute: '2-digit',
      day:    '2-digit',
      month:  'short',
    }).format(new Date(mas.updated));
  } catch { return null; }
});

// ── Carga de datos ────────────────────────────────────────────────────────────
const cargarTasas = async () => {
  cargando.value = true;
  errorDB.value  = false;
  try {
    const resultado = await pb.collection('tasas_cambio').getFullList<TasaCambio>({
      filter: 'activa = true',
      sort:   'orden',
      fields: 'id,moneda,compra,venta,activa,updated',
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
      <div class="h-3 w-20 bg-bpa-100 dark:bg-bpa-800/40 rounded"></div>
      <div class="flex gap-3">
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded"></div>
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded"></div>
      </div>
    </div>
    <div class="flex justify-between items-center py-2 border-b border-bpa-100/50 dark:border-bpa-800/50">
      <div class="h-3 w-16 bg-bpa-100 dark:bg-bpa-800/40 rounded"></div>
      <div class="flex gap-3">
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded"></div>
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded"></div>
      </div>
    </div>
    <div class="flex justify-between items-center py-2">
      <div class="h-3 w-16 bg-bpa-100 dark:bg-bpa-800/40 rounded"></div>
      <div class="flex gap-3">
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded"></div>
        <div class="h-3 w-10 bg-bpa-100 dark:bg-bpa-800/40 rounded"></div>
      </div>
    </div>
  </div>

  <!-- ── Error ──────────────────────────────────────────────────────────── -->
  <div v-else-if="errorDB" class="text-center py-2">
    <p class="text-xs text-red-500 dark:text-red-400 mb-1">No disponible. Sin conexión con el servidor.</p>
    <button
      @click="cargarTasas"
      class="text-xs text-primary dark:text-primary hover:underline"
    >
      Reintentar
    </button>
  </div>

  <!-- ── Datos ──────────────────────────────────────────────────────────── -->
  <div v-else>
    <!-- Cabecera de columnas -->
    <div class="flex justify-between items-center text-xs font-semibold text-primary dark:text-primary uppercase tracking-wide mb-1 pb-1 border-b border-bpa-100/50 dark:border-bpa-amber-800/50">
      <span>Moneda</span>
      <div class="flex gap-4">
        <span class="w-14 text-right">Compra</span>
        <span class="w-14 text-right">Venta</span>
      </div>
    </div>

    <!-- Filas de tasas -->
    <div
      v-for="tasa in tasasFiltradas"
      :key="tasa.id"
      class="flex justify-between items-center py-2 border-b border-bpa-100/30 dark:border-bpa-amber-800/30 last:border-0"
    >
      <!-- Código de moneda -->
      <span class="text-sm font-semibold text-default dark:text-default font-mono tracking-wide">
        {{ tasa.moneda }}
      </span>
      <div class="flex gap-4">
        <!-- Compra: verde — distinción financiera, se conserva -->
        <span class="w-14 text-right text-sm font-mono text-emerald-600 dark:text-emerald-400 font-medium">
          {{ tasa.compra.toFixed(2) }}
        </span>
        <!-- Venta: rojo — distinción financiera, se conserva -->
        <span class="w-14 text-right text-sm font-mono text-rose-600 dark:text-rose-400 font-medium">
          {{ tasa.venta.toFixed(2) }}
        </span>
      </div>
    </div>

    <!-- Sin tasas disponibles -->
    <p v-if="!tasasFiltradas.length" class="text-xs text-muted dark:text-muted text-center py-2">
      No hay tasas disponibles
    </p>

    <!-- Timestamp de actualización -->
    <p v-if="ultimaActualizacion" class="text-xs text-muted dark:text-muted mt-2 text-right">
      Actualizado: {{ ultimaActualizacion }}
    </p>
  </div>
</template>
