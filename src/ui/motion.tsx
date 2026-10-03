// Motion helpers: kinetic display text and scroll-triggered reveals. Both are
// purely decorative; html.reduce-motion (see App) turns the animations off.
import { Fragment, useLayoutEffect, type CSSProperties, type RefObject } from 'react';

/**
 * Text whose words rise into place one after another. Screen readers and
 * accessible names get the plain string; the animated copy is aria-hidden.
 * Put it inside the real heading element. `accent` words are set in italic.
 */
export function Kinetic({ text, accent, delay = 0 }: { text: string; accent?: string; delay?: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  const accented = new Set(accent?.split(/\s+/) ?? []);
  return (
    <>
      <span className="sr-only">{text}</span>
      {/* Keyed by text so the reveal replays when the wording changes. */}
      <span className="kt" aria-hidden="true" key={text} style={{ '--kt-delay': `${delay}ms` } as CSSProperties}>
        {words.map((w, i) => (
          <Fragment key={i}>
            {i > 0 && ' '}
            <span className="kt__w">
              <span className={accented.has(w) ? 'kt__i kt__i--accent' : 'kt__i'} style={{ '--i': i } as CSSProperties}>
                {w}
              </span>
            </span>
          </Fragment>
        ))}
      </span>
    </>
  );
}

/**
 * Fades `[data-reveal]` descendants of `ref` up as they scroll into view,
 * staggering ones that appear together. New descendants are picked up as they
 * render. The revealed flag is a data attribute React doesn't manage, so
 * re-renders that change className never hide an element again.
 */
export function useReveal(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    let batch = 0;
    let frame = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.style.setProperty('--reveal-delay', `${Math.min(batch++, 6) * 70}ms`);
          el.dataset.revealed = '';
          io.unobserve(el);
        }
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => (batch = 0));
      },
      { rootMargin: '0px 0px -32px 0px' },
    );
    const scan = () => root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])').forEach((el) => io.observe(el));
    root.setAttribute('data-reveal-root', '');
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame);
      root.removeAttribute('data-reveal-root');
    };
  }, [ref]);
}
