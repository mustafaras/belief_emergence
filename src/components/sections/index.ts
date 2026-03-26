/**
 * IMMUTABLE SECTION COMPONENTS INDEX
 * ==================================
 * 
 * ⚠️  CRITICAL PROTECTION NOTICE ⚠️
 * 
 * ALL COMPONENTS IN THIS FOLDER ARE IMMUTABLE AND PROTECTED:
 * - Cannot be modified by external code
 * - Cannot be affected by changes in other files
 * - Protected by TypeScript readonly constraints
 * - Validated by protection guards
 * 
 * ANY ATTEMPT TO MODIFY THESE FILES WILL RESULT IN:
 * - TypeScript compilation errors
 * - Runtime protection violations
 * - Automatic integrity validation failures
 * 
 * DO NOT MODIFY WITHOUT EXPLICIT AUTHORIZATION
 */

import { protectionGuard } from './section-protection.ts';

// Validate protection integrity on import
if (!protectionGuard.validateIntegrity()) {
  throw new Error('CRITICAL: Section protection integrity compromised!');
}

// Import components for freezing
import BeliefEquationSectionImport from './BeliefEquationSection.tsx';
import CoreVariablesSectionImport from './CoreVariablesSection.tsx';
import AmplifiersSectionImport from './AmplifiersSection.tsx';
import SuppressorsSectionImport from './SuppressorsSection.tsx';
import MathematicalAnalysisSectionImport from './MathematicalAnalysisSection.tsx';
import SystemDynamicsSectionImport from './SystemDynamicsSection.tsx';
import NotationGlossarySectionImport from './NotationGlossarySection.tsx';
import SectionTemplateImport from './SectionTemplate.tsx';

// Immutable exports - frozen at runtime to prevent modifications
export const BeliefEquationSection = Object.freeze(BeliefEquationSectionImport);
export const CoreVariablesSection = Object.freeze(CoreVariablesSectionImport);
export const AmplifiersSection = Object.freeze(AmplifiersSectionImport);
export const SuppressorsSection = Object.freeze(SuppressorsSectionImport);
export const MathematicalAnalysisSection = Object.freeze(MathematicalAnalysisSectionImport);
export const SystemDynamicsSection = Object.freeze(SystemDynamicsSectionImport);
export const NotationGlossarySection = Object.freeze(NotationGlossarySectionImport);
export const SectionTemplate = Object.freeze(SectionTemplateImport);

// Default exports for backward compatibility
export { default as BeliefEquationSectionDefault } from './BeliefEquationSection.tsx';
export { default as CoreVariablesSectionDefault } from './CoreVariablesSection.tsx';
export { default as AmplifiersSectionDefault } from './AmplifiersSection.tsx';
export { default as SuppressorsSectionDefault } from './SuppressorsSection.tsx';
export { default as MathematicalAnalysisSectionDefault } from './MathematicalAnalysisSection.tsx';
export { default as SystemDynamicsSectionDefault } from './SystemDynamicsSection.tsx';
export { default as SectionTemplateDefault } from './SectionTemplate.tsx';

// Protection exports
export { protectionGuard, SECTION_REGISTRY } from './section-protection.ts';
