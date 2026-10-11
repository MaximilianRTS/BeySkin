export type Point = [x: number, y: number]

export type TemplateCategory = 'battlepass' | 'bey'

/** Which 3D scene the preview uses for this template. */
export type PreviewModel = 'battlepass' | 'chip' | 'flat'

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
  previewModel: PreviewModel
}
