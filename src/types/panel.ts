export interface PanelRowCanonical {
  iso3: string;
  country_name: string;
  year: number;
  Z: number;
  X: number;
  Y: number;
  /**
   * Structurally unavailable covariates.
   *
   * C (cultural intensity, alpha 0.33), D (social atomization, alpha -0.42)
   * and S (social support, computable for 0 cells) cannot be measured from the
   * available item data. They are `null` for every row — never zero — so that
   * consumers must handle their absence explicitly rather than treating a
   * missing construct as an observed value.
   *
   * See docs/KNOWN_ISSUES.md KI-09, KI-10, KI-11.
   */
  C: number | null;
  M: number;
  T: number;
  D: number | null;
  G: number | null;
  E: number;
  S: number | null;
  R: number;
}
