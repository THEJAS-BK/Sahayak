import React from 'react';

export type TableDensity = 'default' | 'dense';

interface TableProps {
  children: React.ReactNode;
  density?: TableDensity;
  /**
   * `true` pins the header while the pane scrolls. Worth it on the two long
   * boards (Monitoring, Requests) where losing the column labels halfway down
   * is the whole cost of a 200-row table.
   */
  stickyHeader?: boolean;
}

const DENSITY: Record<TableDensity, { cell: string; header: string; row: string }> = {
  default: { cell: '1rem 0.75rem', header: '0.625rem 0.75rem', row: '3.25rem' },
  dense: { cell: '0.5rem 0.625rem', header: '0.5rem 0.625rem', row: '2.625rem' },
};

const densityContext = React.createContext<TableDensity>('default');
const stickyContext = React.createContext(false);

export const Table: React.FC<TableProps> = ({
  children,
  density = 'default',
  stickyHeader = false,
}) => (
  <densityContext.Provider value={density}>
    <stickyContext.Provider value={stickyHeader}>
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            // Rows must not be allowed to shrink below their content on a narrow
            // pane; the wrapper scrolls instead.
            minWidth: '100%',
          }}
        >
          {children}
        </table>
      </div>
    </stickyContext.Provider>
  </densityContext.Provider>
);

export const TableHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead>
    <tr>{children}</tr>
  </thead>
);

export const TableBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody>{children}</tbody>
);

/**
 * A row that navigates on click.
 *
 * A `<tr>` with a click handler is not reachable by keyboard and is announced as
 * plain text, so this only covers the mouse. Every call site pairs it with a
 * real `<Link>` in the leading cell, which is the focusable, announced path.
 * The row click is convenience; the link is the contract.
 */
export const TableRow: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}> = ({ children, style, onClick }) => {
  const density = React.useContext(densityContext);
  // Row state follows the keyboard too. The hover background used to be the only
  // cue that a scanning eye had landed on a row, and it was wired to
  // onMouseEnter/onMouseLeave, so arrowing through the lead link moved nothing.
  // CSS `:hover` also covers the synthetic hover a touch screen emits, which the
  // JS handlers did not.
  const [hovered, setHovered] = React.useState(false);
  // Only a row that navigates gets the hover treatment; a static row that lit up
  // on hover would be promising something it will not do.
  const active = Boolean(onClick) && hovered;

  return (
    <tr
      className="sahayak-row"
      onClick={onClick}
      tabIndex={-1}
      style={{
        borderBottom: '1px solid var(--color-rule)',
        height: DENSITY[density].row,
        cursor: onClick ? 'pointer' : undefined,
        // Row hover is what tells a scanning eye which row it is over. It used
        // to have no state at all, so a wide table read as one grey block.
        background: active ? 'var(--color-canvas)' : 'var(--color-raised)',
        ...style,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </tr>
  );
};

export const TableHeader: React.FC<{
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
}> = ({ children, align = 'left', width }) => {
  const density = React.useContext(densityContext);
  const sticky = React.useContext(stickyContext);
  return (
    <th
      scope="col"
      style={{
        padding: DENSITY[density].header,
        fontWeight: 600,
        color: 'var(--color-ink-muted)',
        fontSize: 'var(--text-caption)',
        textAlign: align,
        whiteSpace: 'nowrap',
        width,
        background: 'var(--color-raised)',
        // A 2px rule instead of the old `#F1F5F9` fill band: the fill was a
        // fifth surface grey with no job, and the rule holds the eye without
        // adding another plane.
        borderBottom: '2px solid var(--color-rule-strong)',
        position: sticky ? 'sticky' : undefined,
        top: sticky ? 0 : undefined,
        zIndex: sticky ? 1 : undefined,
      }}
    >
      {children}
    </th>
  );
};

export const TableCell: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  colSpan?: number;
  align?: 'left' | 'right' | 'center';
  onClick?: (event: React.MouseEvent<HTMLTableCellElement>) => void;
}> = ({ children, style, colSpan, align = 'left', onClick }) => {
  const density = React.useContext(densityContext);
  return (
    <td
      colSpan={colSpan}
      onClick={onClick}
      style={{
        padding: DENSITY[density].cell,
        color: 'var(--color-ink)',
        fontSize: 'var(--text-body)',
        lineHeight: 'var(--text-body--line-height)',
        textAlign: align,
        verticalAlign: 'middle',
        ...style,
      }}
    >
      {children}
    </td>
  );
};

/**
 * The caption every table needs and none had. It is the only thing that tells a
 * screen-reader user what the columns of a nine-column grid are before they
 * start arrowing across cells.
 */
export const TableCaption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <caption className="sr-only">{children}</caption>
);

/** A leading cell holding the row's real, focusable link. */
export const TableLeadCell: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <TableCell style={{ fontWeight: 500, ...style }}>{children}</TableCell>
);
