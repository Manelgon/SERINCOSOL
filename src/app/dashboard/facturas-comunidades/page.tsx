'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Folder, FileText, ChevronRight, Home, RefreshCw, ExternalLink, Download, Search } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import { supabase } from '@/lib/supabaseClient';

interface BucketItem {
    name: string;
    id: string | null;
    updated_at: string | null;
    created_at: string | null;
    last_accessed_at: string | null;
    metadata: any;
}

export default function FacturasComunidadesPage() {
    const [path, setPath] = useState<string[]>([]);
    const [items, setItems] = useState<BucketItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [comunidades, setComunidades] = useState<{ codigo: string; nombre_cdad: string }[]>([]);

    const currentPathString = path.join('/');

    useEffect(() => {
        fetchComunidades();
    }, []);

    useEffect(() => {
        fetchItems();
    }, [currentPathString]);

    const fetchComunidades = async () => {
        try {
            const { data, error } = await supabase
                .from('comunidades')
                .select('codigo, nombre_cdad');

            if (error) throw error;
            setComunidades(data || []);
        } catch (error: any) {
            console.error('Error loading comunidades:', error);
        }
    };

    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/facturas-comunidades/list?path=${encodeURIComponent(currentPathString)}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Error al listar archivos');

            const filteredItems = (data.items || []).filter((item: BucketItem) =>
                item.name !== '.emptyFolderPlaceholder' && item.name !== '.keep'
            );
            setItems(filteredItems);
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFolderClick = (folderName: string) => {
        setPath([...path, folderName]);
    };

    const handleFileClick = async (fileName: string) => {
        const filePath = currentPathString ? `${currentPathString}/${fileName}` : fileName;
        // Use the proxy view route instead of signed URL for better browser compatibility
        window.open(`/api/facturas-comunidades/view?path=${encodeURIComponent(filePath)}`, '_blank');
    };

    const handleDownloadClick = async (fileName: string) => {
        const filePath = currentPathString ? `${currentPathString}/${fileName}` : fileName;
        try {
            const res = await fetch(`/api/facturas-comunidades/signed-url?path=${encodeURIComponent(filePath)}&download=true`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Error al obtener URL de descarga');

            const link = document.createElement('a');
            link.href = data.url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const navigateTo = (index: number) => {
        setPath(path.slice(0, index + 1));
    };

    const goHome = () => {
        setPath([]);
    };

    const columns: Column<BucketItem>[] = [
        {
            key: 'icon',
            label: '',
            width: '50px',
            sortable: false,
            render: (row) => {
                const isFolder = !row.metadata;
                return (
                    <div className={`p-2 rounded-lg ${isFolder ? 'bg-indigo-50 text-indigo-600' : 'bg-red-50 text-red-600'}`}>
                        {isFolder ? <Folder className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                    </div>
                );
            },
        },
        {
            key: 'name',
            label: 'Nombre',
            sortable: true,
            render: (row) => (
                <div className="flex flex-col">
                    <span className="font-semibold text-neutral-900">
                        {row.name}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono hidden sm:block">
                        {row.id}
                    </span>
                </div>
            ),
        },
        {
            key: 'comunidad',
            label: 'Comunidad',
            sortable: true,
            render: (row) => {
                const comunidadFolder = path.length === 0 ? row.name : path[0];
                // Extract just the code from folder name (e.g., "055" from "055" or "055 - Name")
                const codeMatch = comunidadFolder.match(/^(\d+)/);
                const code = codeMatch ? codeMatch[1] : '';

                // Find the community name from the database
                const comunidad = comunidades.find(c => c.codigo === code);
                const name = comunidad?.nombre_cdad || comunidadFolder;

                return (
                    <span className="font-semibold text-neutral-900">{name}</span>
                );
            },
            getSearchValue: (row) => {
                const comunidadFolder = path.length === 0 ? row.name : path[0];
                const codeMatch = comunidadFolder.match(/^(\d+)/);
                const code = codeMatch ? codeMatch[1] : '';
                const comunidad = comunidades.find(c => c.codigo === code);
                return comunidad?.nombre_cdad || comunidadFolder;
            }
        },
        {
            key: 'kind',
            label: 'Tipo',
            sortable: true,
            render: (row) => {
                const isFolder = !row.metadata;
                return (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isFolder ? 'bg-indigo-100 text-indigo-800' : 'bg-red-100 text-red-800'}`}>
                        {isFolder ? 'Carpeta' : 'Archivo PDF'}
                    </span>
                );
            },
            getSearchValue: (row) => !row.metadata ? 'carpeta' : 'archivo pdf'
        },
        {
            key: 'updated_at',
            label: 'Última Modificación',
            sortable: true,
            render: (row) => (
                <span className="text-sm text-neutral-500">
                    {row.updated_at ? new Date(row.updated_at).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : '-'}
                </span>
            ),
        },
        {
            key: 'actions',
            label: 'Acciones',
            sortable: false,
            render: (row) => {
                const isFolder = !row.metadata;
                if (isFolder) return (
                    <div className="flex justify-end">
                        <ChevronRight className="w-5 h-5 text-neutral-300 group-hover:text-yellow-600 transition-colors" />
                    </div>
                );
                return (
                    <div className="flex items-center justify-end gap-2">
                        <button
                            className="p-2 text-neutral-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-all"
                            title="Visualizar"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleFileClick(row.name);
                            }}
                        >
                            <ExternalLink className="w-4 h-4" />
                        </button>
                        <button
                            className="p-2 text-neutral-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-all"
                            title="Descargar"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadClick(row.name);
                            }}
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    </div>
                );
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold text-neutral-900">Facturas Comunidades</h1>
                <button
                    onClick={fetchItems}
                    className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                    title="Actualizar"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Breadcrumbs */}
            <nav className="flex items-center space-x-2 text-sm text-neutral-600 bg-white p-3 rounded-lg border border-neutral-200 shadow-sm">
                <button
                    onClick={goHome}
                    className="hover:text-yellow-600 flex items-center gap-1 transition-colors"
                >
                    <Home className="w-4 h-4" />
                    <span className="font-medium">Facturas</span>
                </button>
                {path.map((folder, index) => (
                    <div key={index} className="flex items-center space-x-2">
                        <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                        <button
                            onClick={() => navigateTo(index)}
                            className={`hover:text-yellow-600 transition-colors ${index === path.length - 1 ? 'font-bold text-neutral-900' : 'font-medium'}`}
                        >
                            {folder}
                        </button>
                    </div>
                ))}
            </nav>

            {/* Content Table */}
            <DataTable
                data={items}
                columns={columns}
                keyExtractor={(row) => row.id || row.name}
                storageKey="facturas-comunidades"
                loading={loading}
                emptyMessage="No se encontraron archivos o carpetas"
                onRowClick={(row) => {
                    const isFolder = !row.metadata;
                    if (isFolder) {
                        handleFolderClick(row.name);
                    } else {
                        handleFileClick(row.name);
                    }
                }}
            />
        </div>
    );
}
