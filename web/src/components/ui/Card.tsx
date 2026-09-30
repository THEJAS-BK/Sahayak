import React from 'react';
import { panel } from '../../lib/styles';

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  /**
   * A table lives flush against the card edges. The old Card hard-coded
   * `overflow: hidden`, so a flush table was clipped rather than scrolled unless
   * the wrapper happened to contain it.
   */
  flush?: boolean;
}

/**
 * A raised surface. Reserved for things that are objects — a stat tile, a table,
 * a map panel — and deliberately not used for page sections, which are a title
 * and a rule. When everything is a card, nothing is.
 */
export const Card: React.FC<CardProps> = ({ children, style, className, flush = false }) => (
  <div className={className} style={{ ...panel, ...(flush ? { overflow: 'visible' } : {}), ...style }}>
    {children}
  </div>
);
