import type { SupabaseClient } from '@supabase/supabase-js'
import { i18n } from '@/i18n'
import { cloneDesign, type Design } from '@/lib/model'
import { importProjectText, projectFileBlob } from '@/lib/projectFile'
import { renderDesignBlob } from '@/lib/render'
import { supabase } from './supabase'

/**
 * Typed API for the community gallery (Supabase). Every function throws a
 * {@link GalleryError}; use {@link errorMessage} to get a localised message for a toast.
 */

/** Database object names – the only place they are spelled out (all prefixed to coexist with other tables). */
export const T_PROFILES = 'sticker_profiles'
export const T_DESIGNS = 'sticker_designs'
export const T_LIKES = 'sticker_likes'
export const T_REPORTS = 'sticker_reports'
export const RPC = {
  isAdmin: 'sticker_is_admin',
  reportDesign: 'sticker_report_design',
  incrementDownload: 'sticker_increment_download',
  setStatus: 'sticker_admin_set_status',
  resolveReport: 'sticker_admin_resolve_report',
} as const
export const BUCKET = 'sticker-gallery'
export const MAX_PROJECT_BYTES = 8 * 1024 * 1024
export const MAX_THUMB_BYTES = 300 * 1024
export const MAX_TITLE_LENGTH = 60
export const MAX_REPORT_DETAILS = 1000
export const MIN_REPORT_DETAILS = 10

/**
 * Characters never allowed in public names/titles (control, zero-width, bidi overrides).
 * Must match the check constraints in supabase/migrations/20261011000000_gallery.sql.
 */
export const FORBIDDEN_TEXT_CHARS = /[\u0001-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/

export type DesignStatus = 'pending' | 'published' | 'hidden' | 'rejected'
export type ReportReason = 'copyright' | 'trademark' | 'inappropriate' | 'personal_data' | 'spam' | 'other'
export type ReportStatus = 'open' | 'resolved' | 'dismissed'
export type GallerySort = 'new' | 'top'

export const REPORT_REASONS: readonly ReportReason[] = [
  'copyright',
  'trademark',
  'inappropriate',
  'personal_data',
  'spam',
  'other',
]

export interface GalleryDesign {
  id: string
  userId: string
  title: string
  templateId: string
  projectPath: string
  thumbPath: string
  status: DesignStatus
  likeCount: number
  reportCount: number
  downloadCount: number
  createdAt: string
  publishedAt: string | null
  /** Display name of the creator (null if the profile is gone). */
  creatorName: string | null
}

export interface GalleryReport {
  id: string
  designId: string
  reporterId: string | null
  reason: ReportReason
  description: string | null
  moderatorNote: string | null
  resolvedAt: string | null
  contactEmail: string | null
  status: ReportStatus
  createdAt: string
  design: GalleryDesign | null
}

export interface ListDesignsOptions {
  sort: GallerySort
  templateId?: string | null
  /** Zero-based page index. */
  page: number
  pageSize: number
}

export interface DesignPage {
  items: GalleryDesign[]
  hasMore: boolean
}

export interface ReportInput {
  designId: string
  reason: ReportReason
  description: string
  contactEmail?: string
}

// ---------- errors ----------

export type GalleryErrorCode =
  | 'disabled'
  | 'not-signed-in'
  | 'not-found'
  | 'too-large'
  | 'rate-limit'
  | 'files-missing'
  | 'already-reported'
  | 'invalid'
  | 'forbidden'
  | 'network'
  | 'render'
  | 'bad-project'
  | 'unknown'

export class GalleryError extends Error {
  readonly code: GalleryErrorCode
  constructor(code: GalleryErrorCode, cause?: unknown) {
    super(code)
    this.name = 'GalleryError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

function codeFromMessage(message: string): GalleryErrorCode {
  const m = message.toLowerCase()
  if (m.includes('rate_limit') || m.includes('rate limit')) return 'rate-limit'
  if (m.includes('files_missing')) return 'files-missing'
  if (m.includes('file_too_large') || m.includes('maximum allowed size') || m.includes('payload too large')) return 'too-large'
  if (m.includes('already_reported')) return 'already-reported'
  if (m.includes('invalid_input')) return 'invalid'
  if (m.includes('not_found')) return 'not-found'
  if (m.includes('forbidden') || m.includes('row-level security') || m.includes('permission denied')) return 'forbidden'
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) return 'network'
  return 'unknown'
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}

/** Normalises anything thrown by supabase-js / fetch into a GalleryError. */
function toError(err: unknown): GalleryError {
  if (err instanceof GalleryError) return err
  return new GalleryError(codeFromMessage(messageOf(err)), err)
}

export function galleryErrorCode(err: unknown): GalleryErrorCode {
  return toError(err).code
}

/** Localised, user-facing message for any error thrown by this module. */
export function errorMessage(err: unknown): string {
  const code = galleryErrorCode(err)
  if (code === 'unknown') console.warn('gallery error', err)
  return i18n.global.t(`gallery.errors.${code}`)
}

// ---------- plumbing ----------

function client(): SupabaseClient {
  if (!supabase) throw new GalleryError('disabled')
  return supabase
}

async function currentUserId(): Promise<string | null> {
  const { data } = await client().auth.getSession()
  return data.session?.user.id ?? null
}

async function requireUserId(): Promise<string> {
  const id = await currentUserId()
  if (!id) throw new GalleryError('not-signed-in')
  return id
}

interface ProfileEmbed {
  display_name: string
}

interface DesignRow {
  id: string
  user_id: string
  title: string
  template_id: string
  project_path: string
  thumb_path: string
  status: DesignStatus
  like_count: number
  report_count: number
  download_count: number
  created_at: string
  published_at: string | null
  creator?: ProfileEmbed | ProfileEmbed[] | null
}

interface ReportRow {
  id: string
  design_id: string
  reporter_id: string | null
  reason: ReportReason
  description: string | null
  moderator_note: string | null
  resolved_at: string | null
  contact_email: string | null
  status: ReportStatus
  created_at: string
  design?: DesignRow | DesignRow[] | null
}

const DESIGN_COLUMNS =
  `id, user_id, title, template_id, project_path, thumb_path, status, like_count, report_count, download_count, created_at, published_at, creator:${T_PROFILES}(display_name)`
const REPORT_COLUMNS = `id, design_id, reporter_id, reason, description, contact_email, status, moderator_note, resolved_at, created_at, design:${T_DESIGNS}(${DESIGN_COLUMNS})`

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

function mapDesign(r: DesignRow): GalleryDesign {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    templateId: r.template_id,
    projectPath: r.project_path,
    thumbPath: r.thumb_path,
    status: r.status,
    likeCount: r.like_count,
    reportCount: r.report_count,
    downloadCount: r.download_count,
    createdAt: r.created_at,
    publishedAt: r.published_at,
    creatorName: one(r.creator)?.display_name ?? null,
  }
}

function mapReport(r: ReportRow): GalleryReport {
  const d = one(r.design)
  return {
    id: r.id,
    designId: r.design_id,
    reporterId: r.reporter_id,
    reason: r.reason,
    description: r.description,
    moderatorNote: r.moderator_note,
    resolvedAt: r.resolved_at,
    contactEmail: r.contact_email,
    status: r.status,
    createdAt: r.created_at,
    design: d ? mapDesign(d) : null,
  }
}

/** Public URL of a file in the gallery bucket ('' when the gallery is disabled). */
export function thumbUrl(path: string): string {
  if (!supabase) return ''
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// ---------- reading ----------

export async function listDesigns(opts: ListDesignsOptions): Promise<DesignPage> {
  try {
    const from = opts.page * opts.pageSize
    let q = client().from(T_DESIGNS).select(DESIGN_COLUMNS).eq('status', 'published')
    if (opts.templateId) q = q.eq('template_id', opts.templateId)
    q =
      opts.sort === 'top'
        ? q.order('like_count', { ascending: false }).order('published_at', { ascending: false, nullsFirst: false })
        : q.order('published_at', { ascending: false, nullsFirst: false })
    // One extra row tells us whether another page exists.
    const { data, error } = await q.range(from, from + opts.pageSize)
    if (error) throw error
    const rows = (data ?? []) as unknown as DesignRow[]
    return { items: rows.slice(0, opts.pageSize).map(mapDesign), hasMore: rows.length > opts.pageSize }
  } catch (err) {
    throw toError(err)
  }
}

/** Returns null when the design does not exist or is not visible to the current user. */
export async function getDesign(id: string): Promise<GalleryDesign | null> {
  try {
    const { data, error } = await client().from(T_DESIGNS).select(DESIGN_COLUMNS).eq('id', id).maybeSingle()
    if (error) throw error
    return data ? mapDesign(data as unknown as DesignRow) : null
  } catch (err) {
    throw toError(err)
  }
}

export async function myUploads(): Promise<GalleryDesign[]> {
  try {
    const uid = await requireUserId()
    const { data, error } = await client()
      .from(T_DESIGNS)
      .select(DESIGN_COLUMNS)
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    if (error) throw error
    return ((data ?? []) as unknown as DesignRow[]).map(mapDesign)
  } catch (err) {
    throw toError(err)
  }
}

// ---------- upload / download ----------

/** Quality ladder: stays under the 300 KB thumbnail limit even for busy designs. */
const THUMB_ATTEMPTS: Array<{ pxPerMm: number; quality: number }> = [
  { pxPerMm: 6, quality: 0.85 },
  { pxPerMm: 5, quality: 0.7 },
  { pxPerMm: 4, quality: 0.6 },
  { pxPerMm: 3, quality: 0.5 },
]

/** Renders the gallery thumbnail (cut-out shape, transparent background) as WebP. */
export async function renderThumbnail(design: Design): Promise<Blob> {
  try {
    for (const { pxPerMm, quality } of THUMB_ATTEMPTS) {
      const blob = await renderDesignBlob(design, { pxPerMm, clip: 'outline' }, 'image/webp', quality)
      if (blob.size <= MAX_THUMB_BYTES) return blob
    }
  } catch (err) {
    throw new GalleryError('render', err)
  }
  throw new GalleryError('too-large')
}

export async function uploadDesign(design: Design, title: string): Promise<GalleryDesign> {
  const cleanTitle = title.trim()
  if (cleanTitle.length < 1 || cleanTitle.length > MAX_TITLE_LENGTH || FORBIDDEN_TEXT_CHARS.test(cleanTitle)) {
    throw new GalleryError('invalid')
  }
  if (design.layers.length === 0) throw new GalleryError('invalid')
  const sb = client()
  const uid = await requireUserId()

  const shared: Design = { ...cloneDesign(design), name: cleanTitle }
  let projectBlob: Blob
  try {
    projectBlob = await projectFileBlob([shared])
  } catch (err) {
    throw new GalleryError('render', err)
  }
  const thumbBlob = await renderThumbnail(shared)
  // Size checks before any network traffic.
  if (projectBlob.size > MAX_PROJECT_BYTES || thumbBlob.size > MAX_THUMB_BYTES) throw new GalleryError('too-large')

  const id = crypto.randomUUID()
  const projectPath = `${uid}/${id}/project.json`
  const thumbPath = `${uid}/${id}/thumb.webp`
  const storage = sb.storage.from(BUCKET)

  try {
    const p = await storage.upload(projectPath, projectBlob, { contentType: 'application/json', upsert: false })
    if (p.error) throw p.error
    const t = await storage.upload(thumbPath, thumbBlob, { contentType: 'image/webp', upsert: false })
    if (t.error) throw t.error
    const { data, error } = await sb
      .from(T_DESIGNS)
      .insert({
        id,
        user_id: uid,
        title: cleanTitle,
        template_id: shared.templateId,
        project_path: projectPath,
        thumb_path: thumbPath,
        status: 'pending',
      })
      .select(DESIGN_COLUMNS)
      .single()
    if (error) throw error
    return mapDesign(data as unknown as DesignRow)
  } catch (err) {
    // Do not leave orphaned files behind.
    await storage.remove([projectPath, thumbPath]).catch(() => undefined)
    throw toError(err)
  }
}

/** Downloads and validates the project file of a gallery design, and counts the download. */
export async function downloadProject(id: string): Promise<Design[]> {
  const sb = client()
  let designs: Design[]
  try {
    const row = await getDesign(id)
    if (!row) throw new GalleryError('not-found')
    const res = await fetch(thumbUrl(row.projectPath))
    if (!res.ok) throw new GalleryError('not-found')
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_PROJECT_BYTES) throw new GalleryError('too-large')
    // Content is untrusted: importProjectText parses, sanitises and re-encodes everything.
    const text = await res.text()
    if (text.length > MAX_PROJECT_BYTES * 2) throw new GalleryError('too-large')
    try {
      designs = await importProjectText(text)
    } catch (err) {
      throw new GalleryError('bad-project', err)
    }
    if (designs.length === 0) throw new GalleryError('bad-project')
  } catch (err) {
    throw toError(err)
  }
  // Fire and forget – a failed counter must never block the download.
  void Promise.resolve(sb.rpc(RPC.incrementDownload, { p_design_id: id })).catch(() => undefined)
  return designs
}

// ---------- likes ----------

/**
 * Likes or unlikes a design and returns the NEW liked state. Pass `currentlyLiked`
 * when the UI already knows it to save a round trip.
 */
export async function toggleLike(id: string, currentlyLiked?: boolean): Promise<boolean> {
  try {
    const sb = client()
    const uid = await requireUserId()
    let liked = currentlyLiked
    if (liked === undefined) liked = (await myLikes([id])).has(id)
    if (liked) {
      const { error } = await sb.from(T_LIKES).delete().eq('user_id', uid).eq('design_id', id)
      if (error) throw error
      return false
    }
    const { error } = await sb.from(T_LIKES).insert({ user_id: uid, design_id: id })
    // 23505 = already liked (double click / other tab): the end state is what we wanted.
    if (error && error.code !== '23505') throw error
    return true
  } catch (err) {
    throw toError(err)
  }
}

/** Which of the given designs the current user has liked (empty set when signed out). */
export async function myLikes(ids: string[]): Promise<Set<string>> {
  if (!supabase || ids.length === 0) return new Set()
  try {
    const uid = await currentUserId()
    if (!uid) return new Set()
    const { data, error } = await supabase.from(T_LIKES).select('design_id').eq('user_id', uid).in('design_id', ids)
    if (error) throw error
    return new Set(((data ?? []) as Array<{ design_id: string }>).map((r) => r.design_id))
  } catch (err) {
    throw toError(err)
  }
}

// ---------- reports / own content ----------

/** Works without login (DSA Art. 16 notice). */
export async function reportDesign(input: ReportInput): Promise<void> {
  try {
    const { error } = await client().rpc(RPC.reportDesign, {
      p_design_id: input.designId,
      p_reason: input.reason,
      p_description: input.description,
      p_contact_email: input.contactEmail?.trim() || null,
    })
    if (error) throw error
  } catch (err) {
    throw toError(err)
  }
}

export async function deleteMyDesign(id: string): Promise<void> {
  try {
    const sb = client()
    const uid = await requireUserId()
    // Row first (the source of truth); files are cleaned up best-effort afterwards.
    const { error } = await sb.from(T_DESIGNS).delete().eq('id', id).eq('user_id', uid)
    if (error) throw error
    await sb.storage
      .from(BUCKET)
      .remove([`${uid}/${id}/project.json`, `${uid}/${id}/thumb.webp`])
      .catch(() => undefined)
  } catch (err) {
    throw toError(err)
  }
}

// ---------- admin ----------

async function listByStatus(status: DesignStatus, ascending: boolean): Promise<GalleryDesign[]> {
  try {
    const { data, error } = await client()
      .from(T_DESIGNS)
      .select(DESIGN_COLUMNS)
      .eq('status', status)
      .order('created_at', { ascending })
      .limit(200)
    if (error) throw error
    return ((data ?? []) as unknown as DesignRow[]).map(mapDesign)
  } catch (err) {
    throw toError(err)
  }
}

/** Designs waiting for review, oldest first. */
export function listQueue(): Promise<GalleryDesign[]> {
  return listByStatus('pending', true)
}

/** Hidden designs (auto-hidden by reports or hidden by an admin), newest first. */
export function listHidden(): Promise<GalleryDesign[]> {
  return listByStatus('hidden', false)
}

/** Open reports with their design, oldest first. */
export async function listReports(): Promise<GalleryReport[]> {
  try {
    const { data, error } = await client()
      .from(T_REPORTS)
      .select(REPORT_COLUMNS)
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) throw error
    return ((data ?? []) as unknown as ReportRow[]).map(mapReport)
  } catch (err) {
    throw toError(err)
  }
}

/**
 * Admin: change a design's status. Rejecting also deletes the stored files so that
 * rejected content is no longer reachable via its public URL.
 */
export async function setStatus(
  design: Pick<GalleryDesign, 'id' | 'projectPath' | 'thumbPath'>,
  status: DesignStatus,
): Promise<void> {
  try {
    const sb = client()
    const { error } = await sb.rpc(RPC.setStatus, { p_design_id: design.id, p_status: status })
    if (error) throw error
    if (status === 'rejected') {
      // storage.remove() resolves with { error } instead of throwing. Surface it so the
      // admin notices that rejected content is still reachable and can simply retry.
      const { error: removeError } = await sb.storage.from(BUCKET).remove([design.projectPath, design.thumbPath])
      if (removeError) throw removeError
    }
  } catch (err) {
    throw toError(err)
  }
}

export async function resolveReport(reportId: string, status: Exclude<ReportStatus, 'open'>, note?: string): Promise<void> {
  try {
    const { error } = await client().rpc(RPC.resolveReport, { p_report_id: reportId, p_status: status, p_note: note?.trim() || null })
    if (error) throw error
  } catch (err) {
    throw toError(err)
  }
}
