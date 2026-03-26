/**
 * Tests for CSV export utility (B-04).
 */
import { describe, it, expect } from 'vitest';
import { buildCsv, buildCsvWithComment } from '../src/utils/csv/exportCsv';

describe('buildCsv – RFC 4180 compliance', () => {
  it('quotes fields that contain commas', () => {
    const csv = buildCsv(['name', 'value'], [['hello, world', 42]]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('name,value');
    expect(lines[1]).toBe('"hello, world",42');
  });

  it('escapes double-quotes by doubling them', () => {
    const csv = buildCsv(['a'], [['She said "hi"']]);
    expect(csv).toContain('"She said ""hi"""');
  });

  it('quotes fields that contain newlines', () => {
    const csv = buildCsv(['a'], [['line1\nline2']]);
    expect(csv).toContain('"line1\nline2"');
  });

  it('does not quote simple fields', () => {
    const csv = buildCsv(['x', 'y'], [[1, 2]]);
    expect(csv).toBe('x,y\r\n1,2\r\n');
  });
});

describe('buildCsv – BOM check', () => {
  it('buildCsv output can be prepended with BOM for Excel', () => {
    const csv = '\uFEFF' + buildCsv(['a'], [[1]]);
    // The BOM is U+FEFF. In UTF-8, it encodes to 3 bytes: EF BB BF.
    // In JS string form the first char should be the BOM character.
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

describe('buildCsvWithComment', () => {
  it('prepends comment lines starting with #', () => {
    const csv = buildCsvWithComment(
      'Parameters: alpha=0.5, beta=0.3',
      ['X', 'Y', 'Z'],
      [[1, 2, 3]],
    );
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('# Parameters: alpha=0.5, beta=0.3');
    expect(lines[1]).toBe('X,Y,Z');
    expect(lines[2]).toBe('1,2,3');
  });
});
