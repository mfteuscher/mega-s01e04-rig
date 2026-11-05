export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstTime: string;
  lastTime: string;
};

export type NightDigest = {
  night: string;
  rows: DigestRow[];
  badLines: number;
  /** Counts of valid log events, rather than final job states. */
  counts: Record<RunStatus, number>;
};

/** Missing or invalid night: null. Empty file: a digest with no rows. */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
