import React from 'react';

import './ContributionPanel.css';

type TermContribution = {
  key: string;
  label: string;
  value: number;
};

export interface ContributionPanelProps {
  terms: TermContribution[];
  totalPhi: number;
}

export const ContributionPanel: React.FC<ContributionPanelProps> = ({ terms, totalPhi }) => {
  const sorted = [...terms].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return (
    <div className="phi-panel">
      <div className="phi-panel-header">
        <div className="phi-panel-title">Φ Contributions</div>
        <div className="phi-panel-total" aria-label={`Total Φ ${totalPhi.toFixed(4)}`}>
          <span className="phi-panel-total-label">Total Φ</span>
          <span className="phi-panel-total-value">{totalPhi.toFixed(4)}</span>
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
        <div className="phi-panel-separator" aria-hidden="true" />
      </dl>
    </div>
  );
};

export default ContributionPanel;
