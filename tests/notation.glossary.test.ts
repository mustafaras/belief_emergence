import { describe, it, expect } from 'vitest';
import glossary from '../src/data/analysis/notation_glossary.json';

describe('notation_glossary.json schema validation', () => {
  it('all model_variables have required fields (symbol, name)', () => {
    for (const v of glossary.model_variables) {
      expect(v.symbol).toBeTruthy();
      expect(v.name).toBeTruthy();
      expect(typeof v.symbol).toBe('string');
      expect(typeof v.name).toBe('string');
    }
  });

  it('all greek_letters have required fields (symbol, name, definition)', () => {
    for (const g of glossary.greek_letters) {
      expect(g.symbol).toBeTruthy();
      expect(g.name).toBeTruthy();
      expect(g.definition).toBeTruthy();
    }
  });

  it('all hyperparameters have required fields (symbol, name, role)', () => {
    for (const h of glossary.hyperparameters) {
      expect(h.symbol).toBeTruthy();
      expect(h.name).toBeTruthy();
      expect(h.role).toBeTruthy();
    }
  });

  it('all regime_definitions have required fields (label, formal_definition)', () => {
    for (const r of glossary.regime_definitions) {
      expect(r.label).toBeTruthy();
      expect(r.formal_definition).toBeTruthy();
      expect(r.empirical_characterization).toBeTruthy();
    }
  });

  it('contains expected number of entries', () => {
    expect(glossary.model_variables.length).toBe(11);
    expect(glossary.greek_letters.length).toBe(8);
    expect(glossary.hyperparameters.length).toBe(6);
    expect(glossary.regime_definitions.length).toBe(5);
  });
});
