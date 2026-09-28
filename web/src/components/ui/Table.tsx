import React from 'react';

interface TableProps {
  children: React.ReactNode;
}

export const Table: React.FC<TableProps> = ({ children }) => {
  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        {children}
      </table>
    </div>
  );
};

export const TableHead: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <thead style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid var(--color-border)' }}>
      {children}
    </thead>
  );
};

export const TableBody: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <tbody>{children}</tbody>;
};

export const TableRow: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }> = ({ children, style, onClick }) => {
  return <tr onClick={onClick} style={{ borderBottom: '1px solid var(--color-border)', ...style }}>{children}</tr>;
};

export const TableHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
      {children}
    </th>
  );
};

export const TableCell: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  colSpan?: number;
  onClick?: (event: React.MouseEvent<HTMLTableCellElement>) => void;
}> = ({ children, style, colSpan, onClick }) => {
  return (
    <td colSpan={colSpan} onClick={onClick} style={{ padding: '1rem', color: 'var(--color-text-primary)', fontSize: '0.875rem', ...style }}>
      {children}
    </td>
  );
};
