import { Canvas, type CanvasProps } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import React, { Component, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';

let webglSupport: boolean | null = null;
export function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const c = document.createElement('canvas');
    webglSupport = Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

export const isSmallScreen = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    if (import.meta.env.DEV) console.warn('[3D] scene disabled after an error:', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Shared canvas wrapper:
 *  - falls back to a static illustration without WebGL or after a render error
 *  - pauses rendering when scrolled out of view (saves GPU/battery)
 *  - renders a single still frame under prefers-reduced-motion
 *  - caps pixel ratio for average laptops
 */
export function CanvasShell({
  children,
  fallback,
  className,
  camera,
  eventSource,
  label,
}: {
  children: ReactNode;
  fallback: ReactNode;
  className?: string;
  camera?: CanvasProps['camera'];
  eventSource?: RefObject<HTMLElement | null>;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const [supported] = useState(hasWebGL);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrap} className={cn(className ?? 'relative h-full w-full')} role="img" aria-label={label}>
      {supported ? (
        <SceneBoundary fallback={fallback}>
          <Canvas
            flat
            dpr={[1, 1.75]}
            camera={camera ?? { fov: 35, position: [0, 3, 10] }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            frameloop={reduce ? 'demand' : visible ? 'always' : 'never'}
            eventSource={eventSource as React.RefObject<HTMLElement> | undefined}
            eventPrefix={eventSource ? 'client' : undefined}
            style={{ position: 'absolute', inset: 0 }}
          >
            {children}
          </Canvas>
        </SceneBoundary>
      ) : (
        fallback
      )}
    </div>
  );
}
