export declare const PHASE_STATUSES: readonly ["COMPLETE", "IN_PROGRESS", "PROTOTYPE", "PLANNED", "BLOCKED"];
export type PhaseStatus = (typeof PHASE_STATUSES)[number];
/**
 * Derive a phase's honest status from its required capabilities.
 *
 * A phase is only COMPLETE when every required capability is IMPLEMENTED. If any
 * required capability is PLANNED the phase is PLANNED; if any is PROTOTYPE it is
 * PROTOTYPE; if any is PARTIAL (and nothing worse) it is IN_PROGRESS. This keeps
 * the phase report consistent with the capability matrix — a phase can never
 * appear finished while one of its required systems is still a prototype.
 */
export declare function derivePhaseStatus(required: readonly string[]): PhaseStatus;
export interface PhaseMilestone {
    phase: number;
    title: string;
    status: PhaseStatus;
    requiredCapabilities: string[];
    productionExitCriteria: string[];
    nextWork: string[];
}
export interface PhaseReport {
    total: number;
    counts: Record<PhaseStatus, number>;
    phases: PhaseMilestone[];
    activePhase: PhaseMilestone | null;
    nextProductionWork: string[];
}
export declare const START_MD_PHASES: PhaseMilestone[];
export declare function phaseReport(phases?: readonly PhaseMilestone[]): PhaseReport;
//# sourceMappingURL=phase-report.d.ts.map