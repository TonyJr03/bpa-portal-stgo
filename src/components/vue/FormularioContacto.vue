<script setup lang="ts">
/**
 * @componente  src/components/vue/FormularioContacto.vue
 *
 * @responsabilidad  EXCLUSIVAMENTE lo reactivo:
 *   · Cambio de pestaña activa (feedback / queja)
 *   · Binding de campos con v-model
 *   · Validación client-side antes del envío
 *   · Estados del ciclo de vida del envío: idle → enviando → éxito | error
 *   · Petición a PocketBase — colecciones: mensajes / quejas_sugerencias
 *
 * @colecciones
 *   mensajes: nombre · correo · asunto · mensaje · leido
 *   quejas_sugerencias: tipo · nombre · direccion · municipio · telefono · motivo · correo · mensaje · leido
 *
 * @nota-tecnica selects
 *   La flecha nativa del <select> es una decoración del SO que se pinta
 *   fuera del flujo del padding — ningún valor de pr-* la mueve.
 *   Solución: appearance-none elimina la flecha nativa; un wrapper
 *   relativo + SVG absoluto la reemplaza con control total.
 *
 * @dependencias  ~/lib/pocketbase
 * @directiva     client:load  (en ContactoBPA.astro)
 */

import { ref, reactive, computed, watch } from 'vue';
import { pb } from '~/lib/pocketbase';
import { useTranslations, useLocalTranslations, type Lang } from '~/i18n/utils';

type TabId = 'feedback' | 'queja';
type EstadoEnvio = 'idle' | 'enviando' | 'exito' | 'error';

const props = defineProps<{ lang: Lang }>();

// ── Traducción ────────────────────────────────────────────────────────────────
const t = useTranslations(props.lang);

// ── Listas de datos semánticos reutilizables (generadas desde claves del diccionario) ──
const MOTIVOS = computed(() => {
  const motivos = [];
  for (let i = 1; i <= 9; i++) {
    const key = `form.motive.${i}` as Parameters<typeof t>[0];
    motivos.push(t(key));
  }
  return motivos;
});

const MUNICIPIOS = computed(() => {
  const municipios = [];
  for (let i = 1; i <= 10; i++) {
    const key = `form.municipality.${i}` as Parameters<typeof t>[0];
    municipios.push(t(key));
  }
  return municipios;
});

// ── Strings de interfaz pura (local — no van a los archivos .ts) ───────────────
const tl = useLocalTranslations(props.lang, {
  es: {
    tabMsg: 'Mensaje',
    tabComplaint: 'Queja o Sugerencia',
    name: 'Nombre y apellidos',
    namePlaceholder: 'Ej: Juan García Pérez',
    email: 'Correo electrónico',
    emailPlaceholder: 'ejemplo@correo.cu',
    subject: 'Asunto',
    subjectPlaceholder: 'Resumen breve de su consulta',
    message: 'Mensaje',
    messagePlaceholder: 'Escriba aquí su consulta o pregunta con el mayor detalle posible…',
    send: 'Enviar mensaje',
    sending: 'Enviando…',
    successTitle: 'Mensaje enviado con éxito',
    successMsg:
      'Gracias por comunicarse con nosotros. Su mensaje ha sido registrado y un representante lo atenderá a la brevedad posible.',
    successComplaint:
      'Su queja o sugerencia ha quedado registrada. Tiene derecho a recibir respuesta en un plazo de <strong>30 días hábiles</strong> a partir de la fecha de recepción.',
    sendAnother: 'Enviar otro mensaje',
    errorTitle: 'Error al enviar',
    retry: 'Intentar de nuevo',
    address: 'Dirección',
    addressPlaceholder: 'Calle, número, reparto…',
    municipality: 'Municipio',
    municipalityPlaceholder: 'Seleccione su municipio…',
    phone: 'Teléfono de contacto',
    phonePlaceholder: 'Ej: 52312345',
    motive: 'Motivo de la queja',
    motivePlaceholder: 'Seleccione el motivo…',
    description: 'Descripción detallada',
    descriptionPlaceholder: 'Describa con exactitud y claridad su queja o sugerencia…',
    submitComplaint: 'Enviar queja',
    submitSuggestion: 'Enviar sugerencia',
    submitting: 'Registrando…',
    vName: 'El nombre es obligatorio.',
    vEmail: 'El correo es obligatorio.',
    vEmailInvalid: 'Ingrese un correo válido.',
    vSubject: 'El asunto es obligatorio.',
    vMessage: 'El mensaje no puede estar vacío.',
    vMunicipality: 'Seleccione el municipio.',
    vMotive: 'Seleccione el motivo de la queja.',
  },
  en: {
    tabMsg: 'Message',
    tabComplaint: 'Complaint or Suggestion',
    name: 'Full name',
    namePlaceholder: 'E.g.: John García Pérez',
    email: 'Email address',
    emailPlaceholder: 'example@mail.cu',
    subject: 'Subject',
    subjectPlaceholder: 'Brief summary of your inquiry',
    message: 'Message',
    messagePlaceholder: 'Write your question or inquiry here in as much detail as possible…',
    send: 'Send message',
    sending: 'Sending…',
    successTitle: 'Message sent successfully',
    successMsg:
      'Thank you for contacting us. Your message has been recorded and a representative will attend to it as soon as possible.',
    successComplaint:
      'Your complaint or suggestion has been registered. You have the right to receive a response within <strong>30 business days</strong> from the date of receipt.',
    sendAnother: 'Send another message',
    errorTitle: 'Sending error',
    retry: 'Try again',
    address: 'Address',
    addressPlaceholder: 'Street, number, neighborhood…',
    municipality: 'Municipality',
    municipalityPlaceholder: 'Select your municipality…',
    phone: 'Contact phone',
    phonePlaceholder: 'E.g.: 52312345',
    motive: 'Reason for complaint',
    motivePlaceholder: 'Select a reason…',
    description: 'Detailed description',
    descriptionPlaceholder: 'Describe your complaint or suggestion accurately and clearly…',
    submitComplaint: 'Submit complaint',
    submitSuggestion: 'Submit suggestion',
    submitting: 'Recording…',
    vName: 'Name is required.',
    vEmail: 'Email is required.',
    vEmailInvalid: 'Please enter a valid email address.',
    vSubject: 'Subject is required.',
    vMessage: 'Message cannot be empty.',
    vMunicipality: 'Please select a municipality.',
    vMotive: 'Please select a reason for your complaint.',
  },
});

const tabActiva = ref<TabId>('feedback');
const estado = ref<EstadoEnvio>('idle');
const errServer = ref('');

const feedback = reactive({ nombre: '', correo: '', asunto: '', mensaje: '' });
const queja = reactive({
  tipo: 'queja' as 'queja' | 'sugerencia',
  nombre: '',
  direccion: '',
  municipio: '',
  telefono: '',
  correo: '',
  motivo: '',
  mensaje: '',
});
const tocado = reactive<Record<string, boolean>>({});
const tocar = (c: string) => {
  tocado[c] = true;
};

const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const errFeedback = computed(() => {
  const e: Record<string, string> = {};
  if (!feedback.nombre.trim()) e.nombre = tl('vName');
  if (!feedback.correo.trim()) e.correo = tl('vEmail');
  else if (!reEmail.test(feedback.correo.trim())) e.correo = tl('vEmailInvalid');
  if (!feedback.asunto.trim()) e.asunto = tl('vSubject');
  if (!feedback.mensaje.trim()) e.mensaje = tl('vMessage');
  return e;
});

const errQueja = computed(() => {
  const e: Record<string, string> = {};
  if (!queja.nombre.trim()) e.nombre = tl('vName');
  if (!queja.municipio) e.municipio = tl('vMunicipality');
  if (queja.tipo === 'queja' && !queja.motivo) e.motivo = tl('vMotive');
  if (!queja.mensaje.trim()) e.mensaje = tl('vMessage');
  return e;
});

watch(
  () => queja.tipo,
  (nuevoTipo) => {
    if (nuevoTipo === 'sugerencia') {
      queja.motivo = '';
      delete tocado['motivo'];
    }
  }
);

function claseInput(campo: string, errores: Record<string, string>) {
  const base = [
    'w-full rounded-lg border px-4 py-2.5 text-sm transition',
    'bg-white dark:bg-bpa-950/80',
    'text-default dark:text-default',
    'placeholder:text-muted dark:placeholder:text-muted',
    'focus:outline-none focus:ring-2',
  ];
  base.push(
    tocado[campo] && errores[campo]
      ? 'border-red-400 dark:border-red-500 focus:ring-red-400/60 bg-red-50 dark:bg-red-900/20'
      : 'border-bpa-100 dark:border-bpa-amber-800 focus:ring-bpa-600/40 dark:focus:ring-bpa-amber-600/70'
  );
  return base.join(' ');
}
function claseSelect(campo: string, errores: Record<string, string>) {
  return claseInput(campo, errores) + ' appearance-none pr-10';
}

const chevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6"/></svg>`;

async function enviarFeedback() {
  ['nombre', 'correo', 'asunto', 'mensaje'].forEach(tocar);
  if (Object.keys(errFeedback.value).length) return;
  estado.value = 'enviando';
  try {
    await pb.collection('mensajes').create({
      leido: false,
      nombre: feedback.nombre.trim(),
      correo: feedback.correo.trim(),
      asunto: feedback.asunto.trim(),
      mensaje: feedback.mensaje.trim(),
    });
    estado.value = 'exito';
    Object.assign(feedback, { nombre: '', correo: '', asunto: '', mensaje: '' });
    Object.keys(tocado).forEach((k) => delete tocado[k]);
  } catch (err: unknown) {
    estado.value = 'error';
    errServer.value = err instanceof Error ? err.message : 'Error';
  }
}

async function enviarQueja() {
  const campos = ['nombre', 'municipio', 'mensaje'];
  if (queja.tipo === 'queja') campos.push('motivo');
  campos.forEach(tocar);
  if (Object.keys(errQueja.value).length) return;
  estado.value = 'enviando';
  try {
    await pb.collection('quejas_sugerencias').create({
      leido: false,
      tipo: queja.tipo,
      nombre: queja.nombre.trim(),
      direccion: queja.direccion.trim(),
      municipio: queja.municipio,
      telefono: queja.telefono.trim(),
      motivo: queja.motivo,
      correo: queja.correo.trim(),
      mensaje: queja.mensaje.trim(),
    });
    estado.value = 'exito';
    Object.assign(queja, {
      tipo: 'queja',
      nombre: '',
      direccion: '',
      municipio: '',
      telefono: '',
      correo: '',
      motivo: '',
      mensaje: '',
    });
    Object.keys(tocado).forEach((k) => delete tocado[k]);
  } catch (err: unknown) {
    estado.value = 'error';
    errServer.value = err instanceof Error ? err.message : 'Error';
  }
}

function reintentar() {
  estado.value = 'idle';
  errServer.value = '';
}
function cambiarTab(tab: TabId) {
  tabActiva.value = tab;
  estado.value = 'idle';
  errServer.value = '';
  Object.keys(tocado).forEach((k) => delete tocado[k]);
}
</script>

<template>
  <!-- Pestañas -->
  <div class="flex border-b border-bpa-100 dark:border-bpa-800 mb-7" role="tablist">
    <button
      role="tab"
      :aria-selected="tabActiva === 'feedback'"
      @click="cambiarTab('feedback')"
      :class="[
        'flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors duration-150 focus:outline-none',
        tabActiva === 'feedback'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted hover:text-default dark:hover:text-default',
      ]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-4 h-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M8 9h8" />
        <path d="M8 13h6" />
        <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12" />
      </svg>
      {{ tl('tabMsg') }}
    </button>
    <button
      role="tab"
      :aria-selected="tabActiva === 'queja'"
      @click="cambiarTab('queja')"
      :class="[
        'flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors duration-150 focus:outline-none',
        tabActiva === 'queja'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted hover:text-default dark:hover:text-default',
      ]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-4 h-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
        <path d="M9 17h6" />
        <path d="M9 13h6" />
      </svg>
      {{ tl('tabComplaint') }}
    </button>
  </div>

  <!-- Éxito -->
  <div
    v-if="estado === 'exito'"
    class="flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="w-14 h-14 text-green-500 dark:text-green-400 mb-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M9 12l2 2l4 -4" />
    </svg>
    <h3 class="text-xl font-bold font-heading text-green-800 dark:text-green-300 mb-2">{{ tl('successTitle') }}</h3>
    <p class="text-green-700 dark:text-green-400 text-sm max-w-sm">
      <span v-if="tabActiva === 'feedback'" v-html="tl('successMsg')"></span>
      <span v-else v-html="tl('successComplaint')"></span>
    </p>
    <button
      @click="estado = 'idle'"
      class="mt-6 text-sm text-green-700 dark:text-green-400 underline hover:no-underline"
    >
      {{ tl('sendAnother') }}
    </button>
  </div>

  <!-- Error -->
  <div
    v-else-if="estado === 'error'"
    class="flex flex-col items-center justify-center text-center py-12 px-6 rounded-xl border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="w-12 h-12 text-red-400 mb-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 9v4" />
      <path
        d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"
      />
      <path d="M12 16h.01" />
    </svg>
    <h3 class="text-lg font-bold font-heading text-red-700 dark:text-red-400 mb-1">{{ tl('errorTitle') }}</h3>
    <p class="text-muted text-sm mb-4">{{ errServer }}</p>
    <button
      @click="reintentar"
      class="text-sm font-semibold text-red-700 dark:text-red-400 underline hover:no-underline"
    >
      {{ tl('retry') }}
    </button>
  </div>

  <!-- Formularios -->
  <template v-else>
    <!-- Tab Mensaje -->
    <form v-if="tabActiva === 'feedback'" @submit.prevent="enviarFeedback" novalidate class="space-y-5">
      <div>
        <label for="fb-nombre" class="block text-sm font-medium text-default dark:text-default mb-1"
          >{{ tl('name') }} <span class="text-red-500">*</span></label
        >
        <input
          id="fb-nombre"
          v-model="feedback.nombre"
          @blur="tocar('nombre')"
          type="text"
          autocomplete="name"
          :placeholder="tl('namePlaceholder')"
          :class="claseInput('nombre', errFeedback)"
        />
        <p v-if="tocado['nombre'] && errFeedback['nombre']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errFeedback['nombre'] }}
        </p>
      </div>
      <div>
        <label for="fb-correo" class="block text-sm font-medium text-default dark:text-default mb-1"
          >{{ tl('email') }} <span class="text-red-500">*</span></label
        >
        <input
          id="fb-correo"
          v-model="feedback.correo"
          @blur="tocar('correo')"
          type="email"
          autocomplete="email"
          :placeholder="tl('emailPlaceholder')"
          :class="claseInput('correo', errFeedback)"
        />
        <p v-if="tocado['correo'] && errFeedback['correo']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errFeedback['correo'] }}
        </p>
      </div>
      <div>
        <label for="fb-asunto" class="block text-sm font-medium text-default dark:text-default mb-1"
          >{{ tl('subject') }} <span class="text-red-500">*</span></label
        >
        <input
          id="fb-asunto"
          v-model="feedback.asunto"
          @blur="tocar('asunto')"
          type="text"
          :placeholder="tl('subjectPlaceholder')"
          :class="claseInput('asunto', errFeedback)"
        />
        <p v-if="tocado['asunto'] && errFeedback['asunto']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errFeedback['asunto'] }}
        </p>
      </div>
      <div>
        <label for="fb-mensaje" class="block text-sm font-medium text-default dark:text-default mb-1"
          >{{ tl('message') }} <span class="text-red-500">*</span></label
        >
        <textarea
          id="fb-mensaje"
          v-model="feedback.mensaje"
          @blur="tocar('mensaje')"
          rows="5"
          :placeholder="tl('messagePlaceholder')"
          :class="claseInput('mensaje', errFeedback) + ' resize-none'"
        />
        <p v-if="tocado['mensaje'] && errFeedback['mensaje']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errFeedback['mensaje'] }}
        </p>
      </div>
      <button
        type="submit"
        :disabled="estado === 'enviando'"
        class="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <svg
          v-if="estado === 'enviando'"
          class="animate-spin w-4 h-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        {{ estado === 'enviando' ? tl('sending') : tl('send') }}
      </button>
    </form>

    <!-- Tab Queja o Sugerencia -->
    <form v-else-if="tabActiva === 'queja'" @submit.prevent="enviarQueja" novalidate class="space-y-5">
      <div class="flex gap-6">
        <label class="flex items-center gap-2 cursor-pointer text-sm font-medium text-default dark:text-default">
          <input type="radio" v-model="queja.tipo" value="queja" class="w-4 h-4 accent-primary" />
          {{ t('form.type.complaint') }}
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-sm font-medium text-default dark:text-default">
          <input type="radio" v-model="queja.tipo" value="sugerencia" class="w-4 h-4 accent-primary" />
          {{ t('form.type.suggestion') }}
        </label>
      </div>
      <div>
        <label for="qj-nombre" class="block text-sm font-medium text-default dark:text-default mb-1"
          >{{ tl('name') }} <span class="text-red-500">*</span></label
        >
        <input
          id="qj-nombre"
          v-model="queja.nombre"
          @blur="tocar('nombre')"
          type="text"
          autocomplete="name"
          :placeholder="tl('namePlaceholder')"
          :class="claseInput('nombre', errQueja)"
        />
        <p v-if="tocado['nombre'] && errQueja['nombre']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errQueja['nombre'] }}
        </p>
      </div>
      <div>
        <label for="qj-direccion" class="block text-sm font-medium text-default dark:text-default mb-1">{{
          tl('address')
        }}</label>
        <input
          id="qj-direccion"
          v-model="queja.direccion"
          type="text"
          :placeholder="tl('addressPlaceholder')"
          :class="claseInput('direccion', errQueja)"
        />
      </div>
      <div>
        <label for="qj-municipio" class="block text-sm font-medium text-default dark:text-default mb-1"
          >{{ tl('municipality') }} <span class="text-red-500">*</span></label
        >
        <div class="relative">
          <select
            id="qj-municipio"
            v-model="queja.municipio"
            @blur="tocar('municipio')"
            :class="claseSelect('municipio', errQueja)"
          >
            <option value="" disabled>{{ tl('municipalityPlaceholder') }}</option>
            <option v-for="m in MUNICIPIOS" :key="m" :value="m">{{ m }}</option>
          </select>
          <span
            class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted"
            v-html="chevronSvg"
          ></span>
        </div>
        <p v-if="tocado['municipio'] && errQueja['municipio']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errQueja['municipio'] }}
        </p>
      </div>
      <div>
        <label for="qj-telefono" class="block text-sm font-medium text-default dark:text-default mb-1">{{
          tl('phone')
        }}</label>
        <input
          id="qj-telefono"
          v-model="queja.telefono"
          type="tel"
          :placeholder="tl('phonePlaceholder')"
          :class="claseInput('telefono', errQueja)"
        />
      </div>
      <div>
        <label for="qj-correo" class="block text-sm font-medium text-default dark:text-default mb-1">{{
          tl('email')
        }}</label>
        <input
          id="qj-correo"
          v-model="queja.correo"
          @blur="tocar('correo')"
          type="email"
          autocomplete="email"
          :placeholder="tl('emailPlaceholder')"
          :class="claseInput('correo', errQueja)"
        />
        <p v-if="tocado['correo'] && errQueja['correo']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errQueja['correo'] }}
        </p>
      </div>
      <div v-if="queja.tipo === 'queja'">
        <label for="qj-motivo" class="block text-sm font-medium text-default dark:text-default mb-1"
          >{{ tl('motive') }} <span class="text-red-500">*</span></label
        >
        <div class="relative">
          <select
            id="qj-motivo"
            v-model="queja.motivo"
            @blur="tocar('motivo')"
            :class="claseSelect('motivo', errQueja)"
          >
            <option value="" disabled>{{ tl('motivePlaceholder') }}</option>
            <option v-for="m in MOTIVOS" :key="m" :value="m">{{ m }}</option>
          </select>
          <span
            class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted"
            v-html="chevronSvg"
          ></span>
        </div>
        <p v-if="tocado['motivo'] && errQueja['motivo']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errQueja['motivo'] }}
        </p>
      </div>
      <div>
        <label for="qj-mensaje" class="block text-sm font-medium text-default dark:text-default mb-1"
          >{{ tl('description') }} <span class="text-red-500">*</span></label
        >
        <textarea
          id="qj-mensaje"
          v-model="queja.mensaje"
          @blur="tocar('mensaje')"
          rows="6"
          :placeholder="tl('descriptionPlaceholder')"
          :class="claseInput('mensaje', errQueja) + ' resize-none'"
        />
        <p v-if="tocado['mensaje'] && errQueja['mensaje']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errQueja['mensaje'] }}
        </p>
      </div>
      <button
        type="submit"
        :disabled="estado === 'enviando'"
        class="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <svg
          v-if="estado === 'enviando'"
          class="animate-spin w-4 h-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        {{
          estado === 'enviando'
            ? tl('submitting')
            : queja.tipo === 'queja'
              ? tl('submitComplaint')
              : tl('submitSuggestion')
        }}
      </button>
    </form>
  </template>
</template>
