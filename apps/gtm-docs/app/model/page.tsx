import { redirect } from 'next/navigation';

/**
 * The form-based /model composer was retired 2026-09-23 (spec: studio section)
 * — the studio's canvas model boards supersede it, and "copy as DataModel MDX"
 * survives as a studio export on model boards. Keep the route as a redirect so
 * old links land in the right place.
 */
export default function ModelComposerPage() {
  redirect('/studio');
}
