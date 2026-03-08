<script setup lang="ts">
/**
 * @componente  src/components/vue/TasasDeCambio.vue
 * @directiva   client:load  (inyectado desde tasas-de-cambio.astro)
 *
 * @responsabilidad
 *   Isla Vue que muestra las tasas de cambio oficiales del BPA en tiempo real.
 *   Consulta la colección `tasas_cambio` de PocketBase al montarse, sin rebuild.
 *   Incluye tabla comparativa Compra/Venta y conversor rápido de divisa a CUP.
 *
 * @coleccion  tasas_cambio
 *   moneda        Text    → código ISO de la divisa. Ej: USD, EUR, MLC
 *   nombre_moneda Text    → nombre completo. Ej: "Dólar Estadounidense"
 *   compra        Number  → tasa de compra en CUP
 *   venta         Number  → tasa de venta en CUP
 *   activa        Bool    → true si la moneda está operativa actualmente
 *   orden         Number  → orden de aparición en la tabla
 *   updated       Date    → campo automático de PocketBase (última modificación)
 *
 * @estados
 *   cargando → spinner mientras llega la respuesta de PocketBase
 *   error    → PocketBase no responde (aviso con opción de reintentar)
 *   vacío    → PocketBase responde OK pero no hay tasas activas
 *   datos    → tabla + conversor
 *
 * @dependencias  ~/lib/pocketbase
 */

import { ref, reactive, computed, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

// ── Interfaces ────────────────────────────────────────────────────────────────
interface TasaCambio {
  id: string;
  moneda: string;
  nombre_moneda: string;
  compra: number;
  venta: number;
  activa: boolean;
  orden: number;
  updated: string;
}

// ── Estado principal ──────────────────────────────────────────────────────────
const tasas     = ref<TasaCambio[]>([]);
const cargando  = ref(true);
const errorDB   = ref(false);

// ── Conversor rápido ──────────────────────────────────────────────────────────
const conversor = reactive({
  monto:            '' as string | number,
  monedaSeleccionada: '',
  /** 'a_cup'    → divisa extranjera  → CUP
   *  'desde_cup' → CUP              → divisa extranjera */
  direccion:        'a_cup' as 'a_cup' | 'desde_cup',
});

// ── Computed ──────────────────────────────────────────────────────────────────
/** Tasas filtradas a las activas (ya llegan ordenadas por PocketBase) */
const tasasActivas = computed(() =>
  tasas.value.filter((t) => t.activa)
);

/** Fecha/hora de la tasa actualizada más recientemente */
const ultimaActualizacion = computed(() => {
  if (!tasas.value.length) return null;
  const masFreciente = tasas.value.reduce((prev, curr) =>
    new Date(curr.updated) > new Date(prev.updated) ? curr : prev
  );
  return new Date(masFreciente.updated);
});

/** Texto formateado de la última actualización */
const textoActualizacion = computed(() => {
  if (!ultimaActualizacion.value) return '';
  return ultimaActualizacion.value.toLocaleString('es-CU', {
    day:    '2-digit',
    month:  'long',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
});

/** Tasa seleccionada en el conversor */
const tasaSeleccionada = computed(() =>
  tasasActivas.value.find((t) => t.moneda === conversor.monedaSeleccionada) ?? null
);

/** Resultado del conversor — null si faltan datos */
const resultadoConversor = computed<string | null>(() => {
  const monto = parseFloat(String(conversor.monto));
  if (!monto || isNaN(monto) || monto <= 0) return null;
  if (!tasaSeleccionada.value) return null;

  if (conversor.direccion === 'a_cup') {
    // Usa tasa de compra cuando el cliente vende su divisa al banco
    const total = monto * tasaSeleccionada.value.compra;
    return `${formatCup(total)} CUP`;
  } else {
    // Usa tasa de venta cuando el cliente compra divisa al banco
    const tasaVenta = tasaSeleccionada.value.venta;
    if (tasaVenta <= 0) return null;
    const total = monto / tasaVenta;
    return `${total.toFixed(2)} ${conversor.monedaSeleccionada}`;
  }
});

/** Etiqueta dinámica del campo "Tiene" */
const etiquetaTiene = computed(() => {
  if (!conversor.monedaSeleccionada) return 'Divisa';
  return conversor.direccion === 'a_cup'
    ? conversor.monedaSeleccionada
    : 'CUP';
});

/** Etiqueta dinámica del campo "Recibe" */
const etiquetaRecibe = computed(() => {
  if (!conversor.monedaSeleccionada) return 'Divisa';
  return conversor.direccion === 'a_cup'
    ? 'CUP'
    : conversor.monedaSeleccionada;
});

// ── Utilidades ────────────────────────────────────────────────────────────────
function formatCup(valor: number): string {
  return valor.toLocaleString('es-CU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function intercambiarDireccion() {
  conversor.direccion =
    conversor.direccion === 'a_cup' ? 'desde_cup' : 'a_cup';
}

// ── Carga de datos ────────────────────────────────────────────────────────────
async function cargarTasas() {
  cargando.value = true;
  errorDB.value  = false;
  try {
    const registros = await pb
      .collection('tasas_cambio')
      .getFullList<TasaCambio>({ sort: 'orden' });
    tasas.value = registros;
    // Pre-seleccionar la primera moneda activa en el conversor
    const primera = registros.find((t) => t.activa);
    if (primera) conversor.monedaSeleccionada = primera.moneda;
  } catch {
    errorDB.value = true;
  } finally {
    cargando.value = false;
  }
}

onMounted(cargarTasas);
</script>

<template>
  <!--
    Contenedor principal de la isla. No necesita padding exterior porque
    la página shell (tasas-de-cambio.astro) ya provee el WidgetWrapper.
  -->
  <div class="w-full">

    <!-- ── ESTADO: Cargando ──────────────────────────────────────────────── -->
    <div v-if="cargando" class="flex flex-col items-center justify-center gap-4 py-20 text-slate-500">
      <!-- tabler:loader-2 (animated) -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-10 h-10 animate-spin text-blue-600">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
      <p class="text-sm font-medium">Consultando tasas de cambio…</p>
    </div>

    <!-- ── ESTADO: Error de conexión ────────────────────────────────────── -->
    <div v-else-if="errorDB"
      class="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-8 text-center">
      <!-- tabler:alert-triangle -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-10 h-10 mx-auto mb-3 text-red-500">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 9v4" />
        <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.871l-8.106 -13.534a1.914 1.914 0 0 0 -3.274 0z" />
        <path d="M12 16h.01" />
      </svg>
      <p class="font-semibold text-red-700 dark:text-red-400 mb-1">No se pudo conectar con el servidor</p>
      <p class="text-sm text-red-600 dark:text-red-500 mb-4">
        El servicio de tasas de cambio no está disponible en este momento.
      </p>
      <button
        @click="cargarTasas"
        class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        <!-- tabler:refresh -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          class="w-4 h-4">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
          <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
        </svg>
        Reintentar
      </button>
    </div>

    <!-- ── ESTADO: Sin tasas activas ────────────────────────────────────── -->
    <div v-else-if="!tasasActivas.length"
      class="rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800/50 dark:border-slate-700 p-10 text-center">
      <!-- tabler:currency-off -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-10 h-10 mx-auto mb-3 text-slate-400">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M3 3l18 18" />
        <path d="M16.7 16.7a4 4 0 0 1 -5.4 -5.4m-1.1 -2.3a4 4 0 0 1 5.6 5.6" />
        <path d="M4 8h2.343" />
        <path d="M8 4v2.343m0 3.657v10" />
      </svg>
      <p class="font-semibold text-slate-600 dark:text-slate-300 mb-1">No hay tasas publicadas</p>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Agregue registros en la colección <code class="font-mono text-xs bg-slate-200 dark:bg-slate-700 px-1 rounded">tasas_cambio</code>
        de PocketBase con el campo <code class="font-mono text-xs bg-slate-200 dark:bg-slate-700 px-1 rounded">activa = true</code>.
      </p>
    </div>

    <!-- ── ESTADO: Datos disponibles ────────────────────────────────────── -->
    <div v-else class="space-y-8">

      <!-- Tabla de tasas ─────────────────────────────────────────────────── -->
      <div class="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">

        <!-- Cabecera de la tabla -->
        <div class="bg-blue-700 dark:bg-blue-900 px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-2 text-white">
            <!-- tabler:currency-exchange -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-5 h-5">
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.7 8A3 3 0 0 0 14 6h-4a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6h-4a3 3 0 0 1-2.7-2M12 3v3m0 12v3" />
            </svg>
            <span class="font-semibold text-sm">Tasas Oficiales BPA — Santiago de Cuba</span>
          </div>
          <span class="text-blue-200 dark:text-blue-300 text-xs font-medium hidden sm:block">
            En pesos cubanos (CUP)
          </span>
        </div>

        <!-- Tabla responsive -->
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <th class="text-left px-6 py-3 font-semibold text-slate-600 dark:text-slate-300 w-20">
                  Moneda
                </th>
                <th class="text-left px-6 py-3 font-semibold text-slate-600 dark:text-slate-300">
                  Nombre
                </th>
                <th class="text-right px-6 py-3 font-semibold text-green-700 dark:text-green-400">
                  Compra (CUP)
                </th>
                <th class="text-right px-6 py-3 font-semibold text-blue-700 dark:text-blue-400">
                  Venta (CUP)
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
              <tr
                v-for="tasa in tasasActivas"
                :key="tasa.id"
                class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <!-- Badge del código de moneda -->
                <td class="px-6 py-4">
                  <span class="inline-flex items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 font-bold text-xs px-2.5 py-1 min-w-[3rem]">
                    {{ tasa.moneda }}
                  </span>
                </td>

                <!-- Nombre completo de la moneda -->
                <td class="px-6 py-4 text-slate-700 dark:text-slate-300">
                  {{ tasa.nombre_moneda }}
                </td>

                <!-- Tasa de compra -->
                <td class="px-6 py-4 text-right">
                  <span class="font-semibold text-green-700 dark:text-green-400">
                    {{ formatCup(tasa.compra) }}
                  </span>
                </td>

                <!-- Tasa de venta -->
                <td class="px-6 py-4 text-right">
                  <span class="font-semibold text-blue-700 dark:text-blue-400">
                    {{ formatCup(tasa.venta) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pie con última actualización -->
        <div class="bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700 px-6 py-3 flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
          <!-- tabler:clock -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="w-3.5 h-3.5 flex-shrink-0">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
            <path d="M12 7v5l3 3" />
          </svg>
          <span>
            Última actualización:
            <span class="font-medium text-slate-600 dark:text-slate-300">
              {{ textoActualizacion }}
            </span>
          </span>
        </div>
      </div>

      <!-- Nota informativa sobre compra/venta -->
      <div class="flex gap-3 rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-5 py-4">
        <!-- tabler:info-circle -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          class="w-5 h-5 flex-shrink-0 text-blue-500 mt-0.5">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
          <path d="M12 9h.01" />
          <path d="M11 12h1v4h1" />
        </svg>
        <p class="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
          <strong>Compra:</strong> tasa a la que el banco adquiere la divisa del cliente.
          <strong class="ml-3">Venta:</strong> tasa a la que el banco entrega la divisa al cliente.
          Las tasas pueden variar sin previo aviso según las disposiciones del BCC.
        </p>
      </div>

      <!-- Conversor rápido ────────────────────────────────────────────────── -->
      <div class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">

        <!-- Cabecera del conversor -->
        <div class="bg-slate-800 dark:bg-slate-900 px-6 py-4 flex items-center gap-2 text-white">
          <!-- tabler:arrows-exchange -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="w-5 h-5">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M7 10h14l-4 -4" />
            <path d="M17 14h-14l4 4" />
          </svg>
          <span class="font-semibold text-sm">Conversor Rápido</span>
        </div>

        <div class="p-6 bg-white dark:bg-slate-800/50">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">

            <!-- Monto a convertir -->
            <div class="sm:col-span-2">
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Cantidad
              </label>
              <input
                v-model="conversor.monto"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              />
            </div>

            <!-- Selección de moneda -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Moneda
              </label>
              <select
                v-model="conversor.monedaSeleccionada"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              >
                <option
                  v-for="tasa in tasasActivas"
                  :key="tasa.moneda"
                  :value="tasa.moneda"
                >
                  {{ tasa.moneda }} — {{ tasa.nombre_moneda }}
                </option>
              </select>
            </div>

            <!-- Botón intercambiar dirección -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Dirección
              </label>
              <button
                @click="intercambiarDireccion"
                class="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2.5 text-sm font-medium transition-colors"
              >
                <!-- tabler:switch-horizontal -->
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  class="w-4 h-4">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <path d="M16 3l4 4l-4 4" />
                  <path d="M10 7l10 0" />
                  <path d="M8 13l-4 4l4 4" />
                  <path d="M4 17l9 0" />
                </svg>
                <span>
                  {{ etiquetaTiene }}
                  <span class="text-slate-400 dark:text-slate-500 mx-1">→</span>
                  {{ etiquetaRecibe }}
                </span>
              </button>
            </div>
          </div>

          <!-- Panel de resultado -->
          <div class="mt-5">
            <div
              v-if="resultadoConversor"
              class="rounded-xl bg-blue-700 text-white px-6 py-5 text-center"
            >
              <p class="text-xs font-semibold uppercase tracking-widest text-blue-200 mb-1">
                Resultado aproximado
              </p>
              <p class="text-3xl font-bold tracking-tight">
                {{ resultadoConversor }}
              </p>
              <p class="text-xs text-blue-300 mt-2">
                Calculado con la tasa de
                {{ conversor.direccion === 'a_cup' ? 'compra' : 'venta' }}
                del {{ tasaSeleccionada?.moneda }}
                ({{ conversor.direccion === 'a_cup'
                    ? formatCup(tasaSeleccionada?.compra ?? 0)
                    : formatCup(tasaSeleccionada?.venta ?? 0) }} CUP)
              </p>
            </div>
            <div
              v-else
              class="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-5 text-center text-slate-400 dark:text-slate-500 text-sm"
            >
              Ingrese una cantidad y seleccione una moneda para ver el resultado
            </div>
          </div>

          <!-- Aviso legal del conversor -->
          <p class="mt-3 text-xs text-slate-400 dark:text-slate-500 text-center">
            Resultado orientativo. El monto final puede variar según condiciones
            de la operación en la sucursal.
          </p>
        </div>
      </div>

    </div>
  </div>
</template>
