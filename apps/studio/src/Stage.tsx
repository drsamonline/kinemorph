import { useEffect, useRef, useState } from 'react';
import { SceneRenderer } from '@kinemorph/renderer';

/**
 * Owns the WebGL surface. The renderer is created once and handed upward; the
 * app drives it with an explicit clock, so React never sits in the frame path.
 */
export function Stage({ onReady }: { onReady: (renderer: SceneRenderer) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const renderer = new SceneRenderer();
    let disposed = false;

    renderer
      .init()
      .then(() => {
        if (disposed) {
          renderer.destroy();
          return;
        }
        if (hostRef.current) {
          hostRef.current.innerHTML = '';
          renderer.mount(hostRef.current);
        }
        onReady(renderer);
      })
      .catch((err: unknown) => {
        setFailed(err instanceof Error ? err.message : 'WebGL could not start');
      });

    return () => {
      disposed = true;
      renderer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stage" ref={hostRef}>
      {failed && (
        <div className="stage-error">
          <strong>Renderer unavailable</strong>
          <span>{failed}</span>
          <span>Kinemorph needs WebGL. Try a different browser, or enable hardware acceleration.</span>
        </div>
      )}
    </div>
  );
}
