<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDialog } from './composables'
import { CONTACT_EMAIL } from '@/config'
import {
  errorMessage,
  MAX_REPORT_DETAILS,
  MIN_REPORT_DETAILS,
  REPORT_REASONS,
  reportDesign,
  type ReportReason,
} from '@/services/gallery'
import { toast } from '@/lib/toast'

const props = defineProps<{ designId: string; designTitle?: string }>()
const emit = defineEmits<{ close: []; reported: [] }>()
const { t } = useI18n()

const dialog = ref<HTMLElement | null>(null)
useDialog(dialog, () => {
  if (!busy.value) emit('close')
})

const reason = ref<ReportReason | null>(null)
const details = ref('')
const email = ref('')
const busy = ref(false)
const done = ref(false)

const emailValid = computed(() => email.value.trim() === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim()))
const detailsLength = computed(() => details.value.trim().length)
const canSend = computed(
  () => !!reason.value && detailsLength.value >= MIN_REPORT_DETAILS && emailValid.value && !busy.value,
)

async function send() {
  if (!reason.value || !canSend.value) return
  busy.value = true
  try {
    await reportDesign({
      designId: props.designId,
      reason: reason.value,
      description: details.value.trim(),
      contactEmail: email.value.trim() || undefined,
    })
    done.value = true
    emit('reported')
  } catch (err) {
    toast(errorMessage(err), 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="dialog-backdrop" @mousedown.self="!busy && emit('close')">
      <div ref="dialog" class="dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" tabindex="-1">
        <h2 id="report-title">{{ t('gallery.report.title') }}</h2>

        <div v-if="done" role="status">
          <p>
            <strong>{{ t('gallery.report.thanks') }}</strong>
          </p>
          <p class="muted">{{ t('gallery.report.thanksText') }}</p>
          <div class="dialog-actions">
            <button class="btn btn-primary" data-autofocus @click="emit('close')">{{ t('gallery.close') }}</button>
          </div>
        </div>

        <form v-else @submit.prevent="send">
          <p v-if="designTitle" class="muted">{{ t('gallery.report.about', { title: designTitle }) }}</p>

          <fieldset class="reasons">
            <legend class="field-label">{{ t('gallery.report.reasonLabel') }}</legend>
            <label v-for="(r, i) in REPORT_REASONS" :key="r" class="checkbox reason">
              <input
                v-model="reason"
                type="radio"
                name="report-reason"
                :value="r"
                :data-autofocus="i === 0 ? '' : undefined"
              />
              <span>{{ t(`gallery.report.reasons.${r}`) }}</span>
            </label>
          </fieldset>

          <div class="field">
            <label for="report-details">{{ t('gallery.report.detailsLabel') }}</label>
            <textarea
              id="report-details"
              v-model="details"
              class="input"
              rows="4"
              required
              :maxlength="MAX_REPORT_DETAILS"
              :placeholder="t('gallery.report.detailsPlaceholder')"
            />
            <span class="muted small">
              {{ detailsLength }} / {{ MAX_REPORT_DETAILS }} · {{ t('gallery.report.detailsMin', { n: MIN_REPORT_DETAILS }) }}
            </span>
          </div>

          <div class="field">
            <label for="report-email">{{ t('gallery.report.emailLabel') }}</label>
            <input
              id="report-email"
              v-model="email"
              class="input"
              type="email"
              maxlength="200"
              autocomplete="email"
              :aria-invalid="!emailValid"
            />
            <span class="muted small">{{ t('gallery.report.emailHint') }}</span>
          </div>

          <p class="muted small">
            {{ t('gallery.report.dsaNote') }}
            <template v-if="CONTACT_EMAIL">
              {{ t('gallery.report.orMail') }}
              <a :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a>
            </template>
          </p>
          <p class="muted small">{{ t('gallery.report.noLogin') }}</p>

          <div class="dialog-actions">
            <button type="button" class="btn" :disabled="busy" @click="emit('close')">{{ t('gallery.cancel') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="!canSend">
              {{ busy ? t('gallery.report.sending') : t('gallery.report.send') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.reasons {
  border: 0;
  padding: 0;
  margin: 0 0 12px;
  display: grid;
  gap: 6px;
}
.reason {
  align-items: center;
}
.small {
  font-size: 12px;
}
</style>
