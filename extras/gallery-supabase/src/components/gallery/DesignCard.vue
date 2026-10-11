<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTemplateLabel } from './composables'
import Icon from '@/components/common/Icon.vue'
import { thumbUrl, type GalleryDesign } from '@/services/gallery'

const props = defineProps<{
  design: GalleryDesign
  liked?: boolean
  /** Show the moderation status badge (own uploads, admin). */
  showStatus?: boolean
  /** Hide like/report buttons (e.g. in the moderation queue). */
  hideActions?: boolean
}>()
const emit = defineEmits<{ like: [design: GalleryDesign]; report: [design: GalleryDesign] }>()

const { t } = useI18n()
const templateLabel = useTemplateLabel()

const src = computed(() => thumbUrl(props.design.thumbPath))
const statusClass = computed(() => {
  switch (props.design.status) {
    case 'published':
      return 'badge-success'
    case 'pending':
      return 'badge-warning'
    default:
      return 'badge-danger'
  }
})
</script>

<template>
  <article class="card design-card">
    <RouterLink class="thumb" :to="`/gallery/${design.id}`" :aria-label="t('gallery.card.open', { title: design.title })">
      <img :src="src" :alt="design.title" loading="lazy" decoding="async" />
    </RouterLink>
    <div class="info">
      <h3 class="title" :title="design.title">{{ design.title }}</h3>
      <div class="meta muted">
        {{ t('gallery.card.by', { name: design.creatorName ?? t('gallery.card.unknown') }) }}
      </div>
      <div class="badges">
        <span class="badge">{{ templateLabel(design.templateId) }}</span>
        <span v-if="showStatus" class="badge" :class="statusClass">{{ t(`gallery.status.${design.status}`) }}</span>
      </div>
      <div v-if="!hideActions" class="row actions">
        <button
          class="btn btn-sm like"
          :class="{ active: liked }"
          type="button"
          :aria-pressed="!!liked"
          :aria-label="liked ? t('gallery.card.unlike', { title: design.title }) : t('gallery.card.like', { title: design.title })"
          :disabled="design.status !== 'published'"
          @click="emit('like', design)"
        >
          <Icon name="heart" :size="14" />
          <span>{{ design.likeCount }}</span>
        </button>
        <span class="spacer" />
        <button
          v-if="design.status === 'published'"
          class="btn btn-sm btn-ghost"
          type="button"
          :aria-label="t('gallery.card.report', { title: design.title })"
          :title="t('gallery.card.reportShort')"
          @click="emit('report', design)"
        >
          <Icon name="flag" :size="14" />
        </button>
      </div>
      <slot name="actions" />
    </div>
  </article>
</template>

<style scoped>
.design-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.thumb {
  display: grid;
  place-items: center;
  aspect-ratio: 16 / 9;
  padding: 12px;
  background: var(--surface-2);
}
.thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px 12px;
}
.title {
  margin: 0;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 12px;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.like.active {
  color: var(--danger);
}
</style>
