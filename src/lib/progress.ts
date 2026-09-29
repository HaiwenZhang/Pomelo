/** Fraction is in [0, 1] within the reporting operation, independent of phase text. */
export interface ProgressUpdate {
  phase: string;
  fraction?: number;
}

export type ProgressReporter = (update: ProgressUpdate) => void;
