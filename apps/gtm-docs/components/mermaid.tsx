'use client';

import mermaid from 'mermaid';
import { useEffect, useRef, useState } from 'react';

let instanceCounter = 0;

function isDark(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.dataset.theme === 'dark' || root.classList.contains('dark');
}

/**
 * Renders Mermaid chart source. Re-renders when the docs theme flips so
 * diagrams stay readable in dark mode. If rendering fails, falls back to the
 * raw chart text — a broken diagram should never break the page.
 */
export function Mermaid({ chart, caption }: { chart: string; caption?: string }) {
  const idRef = useRef<string>(`paydirt-mermaid-${++instanceCounter}`);
  const [svg, setSvg] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderIndex = 0;

    const render = async () => {
      const attempt = ++renderIndex;
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: isDark() ? 'dark' : 'default',
        });
        const { svg } = await mermaid.render(`${idRef.current}-${attempt}`, chart);
        if (!cancelled && attempt === renderIndex) {
          setSvg(svg);
          setFailed(false);
        }
      } catch {
        if (!cancelled && attempt === renderIndex) setFailed(true);
      }
    };

    void render();
    const observer = new MutationObserver(() => void render());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [chart]);

  return (
    <figure className="mermaid-figure not-prose my-6 overflow-x-auto rounded-lg border border-fd-border bg-fd-card p-4 text-center">
      {failed ? (
        <pre className="text-left text-xs whitespace-pre-wrap text-fd-muted-foreground">
          {chart}
        </pre>
      ) : svg ? (
        <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="text-sm text-fd-muted-foreground">Rendering diagram…</p>
      )}
      {caption ? (
        <figcaption className="mt-2 text-xs text-fd-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
