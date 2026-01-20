
'use client';

import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';

export interface Column<T> {
    key: string;
    label: string;
    sortable?: boolean;
    render?: (row: T) => React.ReactNode;
    getSearchValue?: (row: T) => string;
    defaultVisible?: boolean;
    align?: 'left' | 'center' | 'right';
    width?: string;
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    keyExtractor: (row: T) => string | number;
    storageKey: string; // Unique key for localStorage
    loading?: boolean;
    emptyMessage?: string;
    // Selection Support
    selectable?: boolean;
    selectedKeys?: Set<string | number>;
    onSelectionChange?: (keys: Set<string | number>) => void;
    // Row Interaction
    onRowClick?: (row: T) => void;
}

export default function DataTable<T extends Record<string, any>>({
    data,
    columns,
    keyExtractor,
    storageKey,
    loading = false,
    emptyMessage = 'No hay datos disponibles',
    selectable = false,
    selectedKeys = new Set(),
    onSelectionChange,
    onRowClick,
}: DataTableProps<T>) {
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Sorting
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // Column visibility
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
    const [showColumnSelector, setShowColumnSelector] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Search
    const [searchTerm, setSearchTerm] = useState('');

    // Load preferences from localStorage ONCE on mount
    useEffect(() => {
        if (isInitialized) return; // Prevent re-initialization

        const saved = localStorage.getItem(`table-${storageKey}`);
        if (saved) {
            try {
                const prefs = JSON.parse(saved);
                if (prefs.pageSize) setPageSize(prefs.pageSize);
                if (prefs.visibleColumns && prefs.visibleColumns.length > 0) {
                    setVisibleColumns(new Set(prefs.visibleColumns));
                } else {
                    // Fallback to defaults if saved but empty
                    setVisibleColumns(new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key)));
                }
            } catch (e) {
                console.error('Error loading table preferences', e);
                // Initialize with defaults on error
                setVisibleColumns(new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key)));
            }
        } else {
            // Initialize with default visible columns
            setVisibleColumns(new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key)));
        }

        setIsInitialized(true);
    }, [storageKey]); // Only depend on storageKey, not columns

    // Save preferences to localStorage whenever they change
    useEffect(() => {
        if (!isInitialized) return; // Don't save until initialized

        const prefs = {
            pageSize,
            visibleColumns: Array.from(visibleColumns),
        };
        localStorage.setItem(`table-${storageKey}`, JSON.stringify(prefs));
    }, [pageSize, visibleColumns, storageKey, isInitialized]);

    // Sorting logic
    const handleSort = (columnKey: string) => {
        if (sortColumn === columnKey) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(columnKey);
            setSortDirection('asc');
        }
        setCurrentPage(1); // Reset to first page
    };

    // Search filter
    const searchFilteredData = data.filter((row) => {
        if (!searchTerm) return true;

        const searchLower = searchTerm.toLowerCase();

        // Search across all visible columns
        const colsToSearch = visibleColumns.size > 0
            ? columns.filter(c => visibleColumns.has(c.key))
            : columns;

        return colsToSearch.some((col) => {
            let valueToSearch = '';

            if (col.getSearchValue) {
                valueToSearch = col.getSearchValue(row);
            } else {
                const val = row[col.key];
                if (val == null) return false;
                if (typeof val === 'object') {
                    valueToSearch = JSON.stringify(val);
                } else {
                    valueToSearch = String(val);
                }
            }

            return valueToSearch.toLowerCase().includes(searchLower);
        });
    });

    // Sort data
    const sortedData = [...searchFilteredData].sort((a, b) => {
        if (!sortColumn) return 0;

        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        if (aVal === bVal) return 0;

        const comparison = aVal > bVal ? 1 : -1;
        return sortDirection === 'asc' ? comparison : -comparison;
    });

    // Pagination
    const totalPages = Math.ceil(sortedData.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedData = sortedData.slice(startIndex, startIndex + pageSize);

    // Column visibility toggle
    const toggleColumn = (columnKey: string) => {
        const newVisible = new Set(visibleColumns);
        if (newVisible.has(columnKey)) {
            newVisible.delete(columnKey);
        } else {
            newVisible.add(columnKey);
        }
        setVisibleColumns(newVisible);
    };

    // Selection Logic
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!onSelectionChange) return;
        if (e.target.checked) {
            // Select all VISIBLE (paginated) data, or all data? Usually user expects page or all. 
            // Let's select all FILTERED data for bulk actions, 
            // but typical "checkbox in header" usually acts on the current view.
            // Let's implement select ALL FILTERED data to be powerful.
            const allKeys = new Set(searchFilteredData.map(keyExtractor));
            onSelectionChange(allKeys as Set<string | number>);
        } else {
            onSelectionChange(new Set());
        }
    };

    const handleSelectRow = (key: string | number) => {
        if (!onSelectionChange) return;
        const newSet = new Set(selectedKeys);
        if (newSet.has(key)) {
            newSet.delete(key);
        } else {
            newSet.add(key);
        }
        onSelectionChange(newSet);
    };

    const isAllSelected = searchFilteredData.length > 0 && selectedKeys.size === searchFilteredData.length;
    const isIndeterminate = selectedKeys.size > 0 && selectedKeys.size < searchFilteredData.length;

    const visibleCols = columns.filter(c => visibleColumns.has(c.key));

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                    <input
                        type="text"
                        placeholder="Buscar en la tabla..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setCurrentPage(1); // Reset to first page on search
                        }}
                        className="w-full px-4 py-2 pl-10 border border-neutral-300 rounded-md bg-white text-neutral-900 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none"
                    />
                    <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                {/* Column selector */}
                <div className="relative">
                    <button
                        onClick={() => setShowColumnSelector(!showColumnSelector)}
                        className="flex items-center gap-2 px-3 py-1.5 border border-neutral-300 rounded-md bg-white hover:bg-neutral-50 transition text-sm"
                    >
                        <Settings2 className="w-4 h-4" />
                        Columnas
                    </button>

                    {showColumnSelector && (
                        <div className="absolute right-0 mt-2 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 p-2">
                            <div className="text-[10px] font-bold text-neutral-400 mb-2 px-2 uppercase tracking-wider">Mostrar columnas</div>
                            {columns.map((col) => (
                                <label
                                    key={col.key}
                                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50 rounded cursor-pointer text-sm"
                                >
                                    <input
                                        type="checkbox"
                                        checked={visibleColumns.has(col.key)}
                                        onChange={() => toggleColumn(col.key)}
                                        className="rounded border-neutral-300 text-yellow-500 focus:ring-yellow-400"
                                    />
                                    <span className="uppercase text-[11px] font-medium text-neutral-700">{col.label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-lg border border-neutral-200">
                <div className="overflow-x-auto max-w-full">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50">
                            <tr>
                                {selectable && (
                                    <th className="w-10 px-4 py-3 text-center">
                                        <input
                                            type="checkbox"
                                            checked={isAllSelected}
                                            ref={input => { if (input) input.indeterminate = isIndeterminate; }}
                                            onChange={handleSelectAll}
                                            className="rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
                                        />
                                    </th>
                                )}
                                {visibleCols.map((col) => (
                                    <th
                                        key={col.key}
                                        style={col.width ? { width: col.width } : {}}
                                        className={`px-4 py-2 text-xs font-semibold text-neutral-600 uppercase tracking-wide ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                                            } ${col.sortable !== false ? 'cursor-pointer select-none hover:bg-neutral-100' : ''
                                            }`}
                                        onClick={() => col.sortable !== false && handleSort(col.key)}
                                    >
                                        <div className={`flex items-center gap-2 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                                            <span>{col.label}</span>
                                            {col.sortable !== false && sortColumn === col.key && (
                                                sortDirection === 'asc' ? (
                                                    <ChevronUp className="w-3 h-3" />
                                                ) : (
                                                    <ChevronDown className="w-3 h-3" />
                                                )
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-neutral-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={visibleCols.length + (selectable ? 1 : 0)} className="px-4 py-8 text-center text-neutral-500">
                                        Cargando datos...
                                    </td>
                                </tr>
                            ) : paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleCols.length + (selectable ? 1 : 0)} className="px-4 py-8 text-center text-neutral-500">
                                        {emptyMessage}
                                    </td>
                                </tr>
                            ) : (
                                paginatedData.map((row) => {
                                    const key = keyExtractor(row);
                                    const isSelected = selectedKeys.has(key as any);
                                    return (
                                        <tr
                                            key={key}
                                            className={`hover:bg-neutral-50 transition ${isSelected ? 'bg-yellow-50' : ''} ${onRowClick ? 'cursor-pointer' : ''}`}
                                            onClick={() => onRowClick && onRowClick(row)}
                                        >
                                            {selectable && (
                                                <td className="px-4 py-3 text-center w-10" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleSelectRow(key as any)}
                                                        className="rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
                                                    />
                                                </td>
                                            )}
                                            {visibleCols.map((col) => (
                                                <td
                                                    key={col.key}
                                                    style={col.width ? { width: col.width } : {}}
                                                    className={`px-4 py-2 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                                                >
                                                    {col.render ? col.render(row) : row[col.key]}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {!loading && paginatedData.length > 0 && (
                <div className="flex items-center justify-between text-sm flex-wrap gap-4">
                    {/* Page size selector */}
                    <div className="flex items-center gap-2">
                        <span className="text-neutral-600">Mostrar:</span>
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="px-2 py-1.5 border border-neutral-300 rounded-md bg-white text-neutral-900"
                        >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>

                    {/* Info text */}
                    <div className="text-neutral-600">
                        Mostrando {startIndex + 1} a {Math.min(startIndex + pageSize, sortedData.length)} de {sortedData.length} registros
                    </div>

                    {/* Pagination controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <span className="px-3 py-1 text-neutral-700">
                            Página {currentPage} de {totalPages}
                        </span>

                        <button
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="p-1.5 border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
