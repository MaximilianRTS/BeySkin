export type Point = [x: number, y: number]

export type TemplateCategory = 'battlepass' | 'bey' | 'accessories' | 'generic' | 'custom'

/** Which 3D scene the preview uses for this template. */
export type PreviewModel = 'battlepass' | 'chip' | 'flat'

/** Shape of a user-defined template (see custom.ts). */
export type CustomShape = 'rect' | 'ellipse'

export interface CustomSpec {
  shape: CustomShape
  widthMm: number
  heightMm: number
  /** Corner radius for 'rect' (0 = sharp corners); always 0 for 'ellipse'. */
  radiusMm: number
}

export interface StickerTemplate {
  id: string
  /** i18n key below `templates.` for the display name and hint. */
  i18nKey: string
  category: TemplateCategory
  widthMm: number
  heightMm: number
  /** Closed cut outline in mm, origin at the top-left of the bounding box. */
  outline: Point[]
  /**
   * False when the size is an estimate that has not been measured on the real part yet.
   * The UI shows a hint so users print a test sheet first.
   */
  measured: boolean
  /** Not offered in the UI for now; designs and share links using it still open. */
  hidden?: boolean
  previewModel: PreviewModel
  /** Body under a 'chip' sticker in the 3D preview (default 'gear'). */
  chipBody?: 'gear' | 'lock'
  /** Recommended safe margin inside the cut line in mm (consumers default to 1.5). */
  safeMm?: number
  /** Set for user-defined sizes; the id encodes the same values. */
  custom?: CustomSpec
}
