export type ConstraintProfile = 'REALISTIC' | 'STYLIZED' | 'FANTASY';

export const CONSTRAINT_PROFILES: ConstraintProfile[] = ['REALISTIC', 'STYLIZED', 'FANTASY'];

export interface ConstraintResult {
  satisfaction: number; // 0..1
  messages: string[];
}
