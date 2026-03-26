import React, { useState, useMemo } from 'react';
import { InlineMath } from 'react-katex';
import SectionTemplate from './SectionTemplate.tsx';
import glossary from '../../data/analysis/notation_glossary.json';
import './NotationGlossarySection.css';

/* ---------- tiny helpers ---------- */

const Sym: React.FC<{ latex?: string; text?: string }> = ({ latex, text }) => {
  if (latex) {
    try {
      return <InlineMath math={latex} />;
    } catch {
      return <span>{text ?? latex}</span>;
    }
  }
  return <span>{text ?? ''}</span>;
};

/* ---------- collapsible sub-section ---------- */

interface CollapsibleProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  visible: boolean;
}

const Collapsible: React.FC<CollapsibleProps> = ({ title, defaultOpen = true, children, visible }) => {
  const [open, setOpen] = useState(defaultOpen);
  if (!visible) return null;
  return (
    <div className="ng-collapsible">
      <button
        className="ng-collapsible-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="ng-chevron">{open ? '▾' : '▸'}</span>
        <span className="ng-collapsible-title">{title}</span>
      </button>
      {open && <div className="ng-collapsible-body">{children}</div>}
    </div>
  );
};

/* ---------- filter helper ---------- */

function matchesQuery(query: string, ...fields: (string | undefined)[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(q));
}

/* ---------- main component ---------- */

const NotationGlossarySection: React.FC = () => {
  const [search, setSearch] = useState('');

  /* --- filtered data --- */

  const filteredVars = useMemo(
    () =>
      glossary.model_variables.filter((v) =>
        matchesQuery(search, v.symbol, v.name, v.type, v.source)
      ),
    [search]
  );

  const filteredGreek = useMemo(
    () =>
      glossary.greek_letters.filter((g) =>
        matchesQuery(search, g.symbol, g.name, g.definition, g.domain)
      ),
    [search]
  );

  const filteredHyper = useMemo(
    () =>
      glossary.hyperparameters.filter((h) =>
        matchesQuery(search, h.symbol, h.name, h.role)
      ),
    [search]
  );

  const filteredRegimes = useMemo(
    () =>
      glossary.regime_definitions.filter((r) =>
        matchesQuery(search, r.label, r.formal_definition, r.empirical_characterization)
      ),
    [search]
  );

  const showVars = filteredVars.length > 0;
  const showGreek = filteredGreek.length > 0;
  const showHyper = filteredHyper.length > 0;
  const showRegimes = filteredRegimes.length > 0;

  return (
    <SectionTemplate
      title="Notation Glossary"
      sectionIndex="Reference"
      subtitle="Complete reference for all symbols used in the belief-emergence model."
    >
      {/* search bar */}
      <div className="ng-search-bar">
        <input
          type="text"
          className="ng-search-input"
          placeholder="Filter by symbol, name, or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter notation glossary"
        />
        {search && (
          <button className="ng-search-clear" onClick={() => setSearch('')} aria-label="Clear filter">
            ✕
          </button>
        )}
      </div>

      {/* Model Variables */}
      <Collapsible title="Model Variables" visible={showVars}>
        <div className="ng-table-wrap">
          <table className="ng-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Description</th>
                <th>Domain</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {filteredVars.map((v) => (
                <tr key={v.symbol}>
                  <td className="ng-sym"><Sym text={v.symbol} /></td>
                  <td>{v.name}</td>
                  <td>{v.source}</td>
                  <td><code>{v.scale}</code></td>
                  <td>{v.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapsible>

      {/* Greek Letters */}
      <Collapsible title="Greek Letters" visible={showGreek}>
        <div className="ng-table-wrap">
          <table className="ng-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Description</th>
                <th>Context</th>
              </tr>
            </thead>
            <tbody>
              {filteredGreek.map((g) => (
                <tr key={g.symbol}>
                  <td className="ng-sym"><Sym text={g.symbol} /></td>
                  <td>{g.name}</td>
                  <td>{g.definition}</td>
                  <td><code>{g.domain}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapsible>

      {/* Hyperparameters */}
      <Collapsible title="Hyperparameters" visible={showHyper}>
        <div className="ng-table-wrap">
          <table className="ng-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Value / Range</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {filteredHyper.map((h) => (
                <tr key={h.symbol}>
                  <td className="ng-sym"><Sym text={h.symbol} /></td>
                  <td>{h.name}</td>
                  <td>
                    <code>
                      {'bounds' in h && h.bounds
                        ? Array.isArray(h.bounds)
                          ? `[${(h.bounds as number[]).join(', ')}]`
                          : String(h.bounds)
                        : 'values' in h && (h as Record<string, unknown>).values
                          ? `[${(((h as Record<string, unknown>).values) as number[]).join(', ')}]`
                          : '—'}
                    </code>
                  </td>
                  <td>{h.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapsible>

      {/* Regime Definitions */}
      <Collapsible title="Regime Definitions" visible={showRegimes}>
        <div className="ng-table-wrap">
          <table className="ng-table">
            <thead>
              <tr>
                <th>Regime</th>
                <th>Z Range</th>
                <th>Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {filteredRegimes.map((r) => (
                <tr key={r.label}>
                  <td className="ng-sym">{r.label}</td>
                  <td><code>{r.formal_definition}</code></td>
                  <td>{r.empirical_characterization}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapsible>

      {!showVars && !showGreek && !showHyper && !showRegimes && (
        <p className="ng-no-results">No symbols match "{search}".</p>
      )}
    </SectionTemplate>
  );
};

export default NotationGlossarySection;
