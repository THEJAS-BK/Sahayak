import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { scrim } from '../../lib/styles';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A dialog that behaves like one.
 *
 * All three dialogs in the app previously closed on a backdrop click and
 * nothing else: no Escape key, no focus trap, no initial focus, and focus was
 * never given back, so a keyboard user tabbed off into the page behind the
 * overlay and had to guess their way back. A police console is exactly where
 * that costs time.
 */
export const Modal: React.FC<ModalProps> = ({ title, onClose, children, footer, width = 560 }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;

    // Focus the first real control rather than the panel, so typing goes
    // somewhere sensible.
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      style={scrim}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          width,
          maxWidth: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-raised)',
          borderRadius: 'var(--radius-panel)',
          boxShadow: 'var(--shadow-overlay)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-rule)',
          }}
        >
          <h2 style={{ fontSize: 'var(--text-lead)', fontWeight: 600 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '1.5rem',
              minHeight: '1.5rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-ink-muted)',
            }}
          >
            <X size={18} />
          </button>
        </header>

        <div style={{ padding: '1.25rem', overflowY: 'auto' }}>{children}</div>

        {footer && (
          <footer
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.5rem',
              padding: '0.875rem 1.25rem',
              borderTop: '1px solid var(--color-rule)',
              background: 'var(--color-canvas)',
              borderBottomLeftRadius: 'var(--radius-panel)',
              borderBottomRightRadius: 'var(--radius-panel)',
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};
