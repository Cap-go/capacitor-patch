export interface CapacitorPatchConfig {
  /**
   * Apply all Capgo-recommended patches that match the installed Capacitor version.
   */
  recommended?: boolean;

  /**
   * Explicit patch IDs to apply.
   */
  patches?: string[];

  /**
   * Patch IDs to skip even if they are recommended or explicitly listed.
   */
  disabled?: string[];

  /**
   * Throw when a selected patch is incompatible or cannot be applied.
   */
  strict?: boolean;
}

export type PatchPlugin = Record<string, never>;
