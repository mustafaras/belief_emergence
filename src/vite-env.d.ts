/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * The commit this build came from, injected by `vite.config.ts` from `git rev-parse`.
   *
   * Declared rather than left as `any`: the evidence bundle prints it on its cover, and an
   * undefined value there is a visible "unversioned build" rather than a silent blank.
   */
  readonly VITE_COMMIT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
