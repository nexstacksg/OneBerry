import { useMemo, useState } from 'preact/hooks';

export function useSortableData(items, defaultSortColumn, valueGetters) {
  const [sortColumn, setSortColumn] = useState(defaultSortColumn);
  const [sortDirection, setSortDirection] = useState('asc');

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedItems = useMemo(() => {
    if (sortColumn === defaultSortColumn) return items;

    const getValue = valueGetters[sortColumn];
    if (!getValue) return items;

    return [...items].sort((a, b) => {
      const aVal = getValue(a);
      const bVal = getValue(b);
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, sortColumn, sortDirection, defaultSortColumn, valueGetters]);

  return {
    sortedItems,
    sortColumn,
    sortDirection,
    handleSort,
  };
}
