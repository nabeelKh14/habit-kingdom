import { Request, Response } from 'express';
import { supabase } from './supabaseClient';
import {
  FeatureFlag,
  setFeatureFlag,
  loadRemoteFeatureFlags,
} from '../lib/feature-flags';
import { getAllFeatureFlags } from '../lib/feature-flags';

/**
 * GET /api/v1/feature-flags
 * Returns the current effective feature flag states.
 * In production this is populated from a remote config service
 * (Supabase edge function, Firebase Remote Config, etc.).
 */
export async function getFeatureFlags(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    await loadRemoteFeatureFlags(); // Fetch from remote source (Supabase edge function)
    // Return effective flags built from defaults + overrides
    const effective = getAllFeatureFlags();
    res.json({ effectiveFlags: effective });
  } catch (err: any) {
    console.error('[RemoteConfig] Failed to load flags:', err);
    res.status(500).json({ error: 'Failed to load feature flags' });
  }
}

/**
 * POST /api/v1/feature-flags/override
 * Allows an authorized admin (parent) to temporarily override flag values.
 * Payload: { [flagId: string]: boolean | null }
 * Example: { "PARENT_ACCESS_CONTROL": true, "DARK_MODE": false }
 */
export async function setFlagOverrides(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // 1️⃣ Auth check – only parent accounts may override flags that affect children
    const user = (req as any).user;
    if (!user || !user.profileType || user.profileType !== 'parent') {
      res
        .status(403)
        .json({ error: 'INSUFFICIENT_PERMISSIONS', message: 'Parent access required' });
      return;
    }

    // 2️⃣ Parse payload
    const overrides: Partial<Record<string, boolean | null>> = req.body;
    if (typeof overrides !== 'object' || overrides === null) {
      res
        .status(400)
        .json({ error: 'INVALID_INPUT', message: 'Payload must be a JSON object' });
      return;
    }

    // 3️⃣ Apply overrides — validate key is a real FeatureFlag before applying
    const validFlags = new Set(Object.values(FeatureFlag));
    const keys = Object.keys(overrides);
    const applied: string[] = [];

    for (const k of keys) {
      if (!validFlags.has(k as FeatureFlag)) {
        console.warn(`[RemoteConfig] Unknown flag key: "${k}" — skipping`);
        continue;
      }
      const flag = k as FeatureFlag;
      if (overrides[k] !== undefined) {
        setFeatureFlag(flag, overrides[k] ?? null);
        applied.push(k);
      }
    }

    res.json({ success: true, applied });
  } catch (err: any) {
    console.error('[RemoteConfig] Override failed:', err);
    res.status(500).json({ error: 'Failed to apply overrides' });
  }
}