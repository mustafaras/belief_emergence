import React from 'react';

import './ContributionPanel.css';

type TermContribution = {
  key: string;
  label: string;
  value: number;
};

export interface ContributionPanelProps {
  terms?: TermContribution[] | null;
  totalPhi?: number | null;
}

export const ContributionPanel: React.FC<ContributionPanelProps> = ({ terms, totalPhi }) => {
  const validTerms = Array.isArray(terms)
    ? terms.filter((term) =>
        term && typeof term.key === 'string' && typeof term.label === 'string' &&
        typeof term.value === 'number' && Number.isFinite(term.value),
      )
    : []
  const sorted = [...validTerms].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const hasTotal = typeof totalPhi === 'number' && Number.isFinite(totalPhi)
  return (
    <div className="phi-panel">
      <div className="phi-panel-header">
        <div className="phi-panel-title">Φ Contributions</div>
        <div className="phi-panel-total" role="group" aria-label={hasTotal ? `Total Φ ${totalPhi.toFixed(4)}` : 'Total Φ unavailable'}>
          <span className="phi-panel-total-label">Total Φ</span>
          <span className="phi-panel-total-value">{hasTotal ? totalPhi.toFixed(4) : '—'}</span>
        </div>
      </div>

      <dl className="phi-terms" aria-label="Φ term contributions">
        {sorted.map((t) => {
          const abs = Math.abs(t.value);
          const muted = abs < 0.005;
          const signClass = t.value >= 0 ? 'is-pos' : 'is-neg';
          const mutedClass = muted ? 'is-muted' : '';
          return (
            <div className="phi-term" key={t.key}>
              <dt className={`phi-term-label ${mutedClass}`} title={t.key}>
                {t.label}
              </dt>
              <dd className={`phi-term-value ${signClass} ${mutedClass}`}>{t.value.toFixed(4)}</dd>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="phi-term-empty" role="status">No contribution data available.</div>
        )}
        <div className="phi-panel-separator" aria-hidden="true" />
      </dl>
    </div>
  );
};

export default ContributionPanel;
