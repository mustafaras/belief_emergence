import React, { useRef } from 'react';
import { useDataContext } from '../../contexts/DataContext';
import { computeCoefficientSetFingerprint } from '../../utils/validation/coefficientsSchema';
import {
  OPTIMIZED_SIGMOID_COEFFICIENTS,
  INTERACTION_TERMS,
  QUADRATIC_TERMS,
  OPTIMIZED_STRUCTURAL_PARAMS,
} from '../../data/feCoefficients';
import './CoefficientProvenancePanel.css';

/**
 * CoefficientProvenancePanel
 * 
 * Displays coefficient provenance (source, metadata, uncertainty).
 * - Built-in mode: Shows fixed source with no uncertainty
 * - Estimated mode: Shows method, dataset fingerprint, and per-coefficient SE/CI95
 * - Dev-only controls: File upload, toggle builtin/estimated, clear button
 * 
 * Integrates with DataContext to manage coefficient state transitions.
 */
export const CoefficientProvenancePanel: React.FC = () => {
  const dataContext = useDataContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandCoefficients, setExpandCoefficients] = React.useState(false);

  const {
    activeCoeffSource,
    estimatedCoeffMeta,
    estimatedCoeffSet,
    coeffError,
    loadEstimatedCoefficients,
    setBuiltinCoefficients,
  } = dataContext;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        await loadEstimatedCoefficients(json);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('[CoefficientProvenancePanel] Failed to parse JSON:', error);
      }
    };
    reader.readAsText(file);
  };

  const handleToggle = async () => {
    if (activeCoeffSource === 'builtin') {
      if (estimatedCoeffSet) {
        // Re-activate estimated
        await loadEstimatedCoefficients({
          schemaVersion: estimatedCoeffMeta?.schemaVersion || '1.0.0',
          generatedAtIso: estimatedCoeffMeta?.generatedAtIso || new Date().toISOString(),
          method: estimatedCoeffMeta?.method,
          dataFingerprint: estimatedCoeffMeta?.dataFingerprint,
          termSpec: estimatedCoeffMeta?.termSpec,
          estimates: Object.fromEntries(
            Object.entries(estimatedCoeffSet).map(([key, value]) => [
              key,
              { value },
            ])
          ),
        });
      }
    } else {
      setBuiltinCoefficients();
    }
  };

  const handleClear = () => {
    setBuiltinCoefficients();
  };

  // Get builtin fingerprint for comparison
  const getBuiltinCoefficientSet = () => ({
    ...OPTIMIZED_SIGMOID_COEFFICIENTS,
    ...INTERACTION_TERMS,
    ...QUADRATIC_TERMS,
    ...OPTIMIZED_STRUCTURAL_PARAMS,
  });

  const builtinFingerprint = computeCoefficientSetFingerprint(getBuiltinCoefficientSet());
  const activeFingerprint = activeCoeffSource === 'builtin'
    ? builtinFingerprint
    : computeCoefficientSetFingerprint(estimatedCoeffSet || getBuiltinCoefficientSet());

  return (
    <div className="coeff-provenance-panel">
      <h3 className="coeff-provenance-title">Coefficient Provenance</h3>

      {/* Active Source Status */}
      <div className="coeff-provenance-section">
        <div className="coeff-provenance-status-row">
          <span className="coeff-provenance-label">Active Source:</span>
          <span className={activeCoeffSource === 'builtin' ? 'coeff-provenance-status-builtin' : 'coeff-provenance-status-estimated'}>
            {activeCoeffSource === 'builtin' ? 'Built-in (Fixed)' : 'Estimated'}
          </span>
        </div>
        <p>
          Provenance indicates which coefficient set is active; out-of-sample generalization evidence is evaluated separately in the
          refit validation block (country-out and rolling-origin protocols).
        </p>

        {/* Fingerprint Summary */}
        <div className="coeff-provenance-fingerprint">
          <div className="coeff-provenance-fp-row">
            <span className="coeff-provenance-fp-label">Count:</span>
            <span>{activeFingerprint.nCoefficients} parameters</span>
          </div>
          <div className="coeff-provenance-fp-row">
            <span className="coeff-provenance-fp-label">Sum:</span>
            <span>{activeFingerprint.sumValues.toFixed(4)}</span>
          </div>
          <div className="coeff-provenance-fp-row">
            <span className="coeff-provenance-fp-label">Range:</span>
            <span>
              [{activeFingerprint.minValue.toFixed(4)}, {activeFingerprint.maxValue.toFixed(4)}]
            </span>
          </div>
        </div>
      </div>

      {/* Estimated Metadata (if applicable) - Always visible */}
      {activeCoeffSource === 'estimated' && estimatedCoeffMeta && (
        <div className="coeff-provenance-section">
          <h4 className="coeff-provenance-subtitle">Estimation Details</h4>

          <div className="coeff-provenance-metadata-row">
            <span className="coeff-provenance-label">Schema:</span>
            <span>{estimatedCoeffMeta.schemaVersion}</span>
          </div>

          {estimatedCoeffMeta.generatedAtIso && (
            <div className="coeff-provenance-metadata-row">
              <span className="coeff-provenance-label">Generated:</span>
              <span>{new Date(estimatedCoeffMeta.generatedAtIso).toLocaleString()}</span>
            </div>
          )}

          {estimatedCoeffMeta.method && (
            <div className="coeff-provenance-metadata-row">
              <span className="coeff-provenance-label">Method:</span>
              <span>
                {estimatedCoeffMeta.method.name || 'Unknown'}
                {estimatedCoeffMeta.method.seed !== undefined && ` (seed: ${estimatedCoeffMeta.method.seed})`}
              </span>
            </div>
          )}

          {estimatedCoeffMeta.dataFingerprint && (
            <div className="coeff-provenance-data-fp">
              <div className="coeff-provenance-fp-label">Dataset:</div>
              <div className="coeff-provenance-data-fp-grid">
                {estimatedCoeffMeta.dataFingerprint.nRows && (
                  <span>{estimatedCoeffMeta.dataFingerprint.nRows} rows</span>
                )}
                {estimatedCoeffMeta.dataFingerprint.nCountries && (
                  <span>{estimatedCoeffMeta.dataFingerprint.nCountries} countries</span>
                )}
                {estimatedCoeffMeta.dataFingerprint.yearMin && estimatedCoeffMeta.dataFingerprint.yearMax && (
                  <span>
                    {estimatedCoeffMeta.dataFingerprint.yearMin}-{estimatedCoeffMeta.dataFingerprint.yearMax}
                  </span>
                )}
              </div>
            </div>
          )}

          {estimatedCoeffMeta.fit && Object.keys(estimatedCoeffMeta.fit).length > 0 && (
            <div className="coeff-provenance-fit-metrics">
              <div className="coeff-provenance-fp-label">Fit Metrics:</div>
              <div className="coeff-provenance-fit-grid">
                {Object.entries(estimatedCoeffMeta.fit).map(([key, value]) => (
                  <div key={key} className="coeff-provenance-fit-item">
                    <span className="coeff-provenance-fit-key">{key}:</span>
                    <span className="coeff-provenance-fit-value">
                      {typeof value === 'number' ? value.toFixed(4) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coefficient Uncertainty Table - Dev Only */}
          {import.meta.env.DEV && estimatedCoeffSet && Object.keys(estimatedCoeffSet).length > 0 && (
            <div className="coeff-provenance-coeff-table">
              <button
                onClick={() => setExpandCoefficients(!expandCoefficients)}
                className="coeff-provenance-expand-button"
              >
                {expandCoefficients ? '▼' : '▶'} Coefficient Values ({Object.keys(estimatedCoeffSet).length} parameters)
              </button>

              {expandCoefficients && (
                <div className="coeff-provenance-table-wrapper">
                  <table className="coeff-provenance-table">
                    <thead>
                      <tr className="coeff-provenance-table-header">
                        <th className="coeff-provenance-th coeff-provenance-th-key">Key</th>
                        <th className="coeff-provenance-th coeff-provenance-th-value">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(estimatedCoeffSet)
                        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                        .map(([key, value]) => (
                          <tr key={key} className="coeff-provenance-table-row">
                            <td className="coeff-provenance-td coeff-provenance-td-key">
                              {key}
                            </td>
                            <td className="coeff-provenance-td coeff-provenance-td-value">
                              {value.toFixed(6)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error Message - Dev Only */}
      {import.meta.env.DEV && coeffError && (
        <div className="coeff-provenance-error-box">
          <strong>Error:</strong> {coeffError}
        </div>
      )}

      {/* Dev-Only Controls */}
      {import.meta.env.DEV && (
        <div className="coeff-provenance-dev-controls">
          <h4 className="coeff-provenance-subtitle">Developer Controls</h4>

          <div className="coeff-provenance-control-row">
            <label className="coeff-provenance-file-label">
              Load coefficients.json:
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleFileUpload}
                className="coeff-provenance-file-input"
              />
            </label>
          </div>

          <div className="coeff-provenance-control-row">
            <button
              onClick={handleToggle}
              className={`coeff-provenance-button ${
                activeCoeffSource === 'builtin'
                  ? 'coeff-provenance-toggle-button'
                  : 'coeff-provenance-toggle-button-active'
              }`}
            >
              {activeCoeffSource === 'builtin' ? 'Use Estimated' : 'Use Built-in'}
            </button>
            {estimatedCoeffSet && activeCoeffSource === 'estimated' && (
              <button onClick={handleClear} className="coeff-provenance-button coeff-provenance-clear-button">
                Clear Estimated
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
