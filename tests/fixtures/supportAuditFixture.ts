import type { PanelAudit } from '../../src/verification/supportPicture'

/** Small valid panel-audit fixture with deliberately visible, reconciled counts. */
export const validPanelAuditFixture: PanelAudit = {
  rows: 207,
  countries: 83,
  attrition: {
    noIso: 10,
    noMacro: 6,
    missingCovariate: 64,
    missingOutcome: 18,
  },
  missingByCovariate: {
    Y: 27,
    T: 12,
    E: 10,
    M: 8,
    R: 7,
  },
}
