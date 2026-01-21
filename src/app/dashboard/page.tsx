'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import KPICard from '@/components/KPICard';
import SearchableSelect from '@/components/SearchableSelect';
import { Building, AlertCircle, FileText, CheckCircle, TrendingUp, Users, Filter } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { toast } from 'react-hot-toast';
import * as htmlToImage from 'html-to-image';
import { FileDown } from 'lucide-react';

export default function DashboardPage() {
    const [stats, setStats] = useState({
        totalComunidades: 0,
        incidenciasPendientes: 0,
        incidenciasResueltas: 0,
        totalDeuda: 0,
        deudaRecuperada: 0,
    });

    const [chartData, setChartData] = useState<{
        incidenciasEvolution: any[];
        urgencyDistribution: any[];
        topComunidades: any[];
        userPerformance: any[];
        debtByCommunity: any[];
        debtStatus: any[];
        incidenciasStatus: any[];
        sentimentDistribution: any[];
    }>({
        incidenciasEvolution: [],
        urgencyDistribution: [],
        topComunidades: [],
        userPerformance: [],
        debtByCommunity: [],
        debtStatus: [],
        incidenciasStatus: [],
        sentimentDistribution: []
    });

    const [loading, setLoading] = useState(true);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [period, setPeriod] = useState('30'); // Default to '30'
    const [communities, setCommunities] = useState<{ id: string, nombre_cdad: string, codigo: string }[]>([]);
    const [selectedCommunity, setSelectedCommunity] = useState<string>('all');
    const [isInitialized, setIsInitialized] = useState(false);

    // Load period and community from localStorage on mount
    useEffect(() => {
        const savedPeriod = localStorage.getItem('dashboard_period');
        if (savedPeriod && ['30', '90', 'all'].includes(savedPeriod)) {
            setPeriod(savedPeriod);
        }

        const savedCommunity = localStorage.getItem('dashboard_community');
        if (savedCommunity) {
            setSelectedCommunity(savedCommunity);
        }

        fetchCommunities();
        setIsInitialized(true);
    }, []);

    const fetchCommunities = async () => {
        const { data } = await supabase
            .from('comunidades')
            .select('id, nombre_cdad, codigo')
            .order('codigo', { ascending: true });
        if (data) setCommunities(data);
    };

    // Save period to localStorage when it changes
    const changePeriod = (newPeriod: string) => {
        setPeriod(newPeriod);
        localStorage.setItem('dashboard_period', newPeriod);
    };

    const changeCommunity = (commId: string) => {
        setSelectedCommunity(commId || 'all');
        localStorage.setItem('dashboard_community', commId || 'all');
    };



    const fetchDashboardData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Basic Counts
            const { count: countComunidades } = await supabase.from('comunidades').select('*', { count: 'exact', head: true });

            // 2. Fetch Incidencias (All for heavy aggregations, optimizing later if needed)
            // Note: In a real large app, create RPC functions for this.

            // Filter by date if needed
            let query = supabase.from('incidencias').select(`
                id, created_at, resuelto, dia_resuelto, urgencia, sentimiento, gestor_asignado, comunidad_id,
                comunidades (nombre_cdad),
                profiles:gestor_asignado (nombre)
            `);

            if (period !== 'all') {
                const date = new Date();
                date.setDate(date.getDate() - parseInt(period));
                // Get all currently pending OR resolved in period OR created in period
                query = query.or(`resuelto.eq.false,dia_resuelto.gte.${date.toISOString()},created_at.gte.${date.toISOString()}`);
            }

            if (selectedCommunity !== 'all') {
                query = query.eq('comunidad_id', selectedCommunity);
            }

            const { data: incidencias, error: incError } = await query;
            if (incError) throw incError;

            // 3. Fetch Morosidad
            let morosidadQuery = supabase.from('morosidad').select('importe, estado, comunidad_id, created_at, comunidades(nombre_cdad)');

            if (period !== 'all') {
                const date = new Date();
                date.setDate(date.getDate() - parseInt(period));
                morosidadQuery = morosidadQuery.gte('created_at', date.toISOString());
            }

            if (selectedCommunity !== 'all') {
                morosidadQuery = morosidadQuery.eq('comunidad_id', selectedCommunity);
            }
            const { data: morosidad, error: morError } = await morosidadQuery;
            if (morError) throw morError;

            // 4. Fetch Profiles (to ensure all users are shown in performance table)
            const { data: profiles, error: profError } = await supabase.from('profiles').select('nombre');
            // Don't throw on profile error, just continue

            // --- Process Data ---

            // KPIs
            const totalIncidencias = incidencias?.length || 0;
            const resueltas = incidencias?.filter(i => i.resuelto).length || 0;
            const pendientes = totalIncidencias - resueltas;

            const totalDeuda = morosidad?.reduce((acc, curr) => acc + (curr.importe || 0), 0) || 0;
            const deudaPagada = morosidad?.filter(m => m.estado === 'Pagado').reduce((acc, curr) => acc + (curr.importe || 0), 0) || 0;

            setStats({
                totalComunidades: countComunidades || 0,
                incidenciasPendientes: pendientes,
                incidenciasResueltas: resueltas,
                totalDeuda,
                deudaRecuperada: deudaPagada
            });

            // Charts: Evolution (Show cumulative pending balance over time)
            const daysToShow = period === 'all' ? 30 : parseInt(period);
            const createdMap = new Map<string, number>();
            const resolvedMap = new Map<string, number>();

            incidencias?.forEach(inc => {
                const cDate = new Date(inc.created_at).toLocaleDateString();
                createdMap.set(cDate, (createdMap.get(cDate) || 0) + 1);

                if (inc.dia_resuelto) {
                    const rDate = new Date(inc.dia_resuelto).toLocaleDateString();
                    resolvedMap.set(rDate, (resolvedMap.get(rDate) || 0) + 1);
                }
            });

            let runningPending = pendientes;
            const evolutionData = [];

            for (let i = 0; i < daysToShow; i++) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toLocaleDateString();

                evolutionData.push({ date: dateStr, count: runningPending });

                const createdCount = createdMap.get(dateStr) || 0;
                const resolvedCount = resolvedMap.get(dateStr) || 0;
                runningPending -= (createdCount - resolvedCount);
            }

            evolutionData.reverse();

            // Charts: Urgency & Sentiment Distribution (Pending only)
            const urgencyMap = { 'Alta': 0, 'Media': 0, 'Baja': 0 };
            const sentimentMap: Record<string, number> = {};

            incidencias?.forEach(inc => {
                if (!inc.resuelto) {
                    // Urgency
                    if (inc.urgencia && urgencyMap.hasOwnProperty(inc.urgencia)) {
                        // @ts-ignore
                        urgencyMap[inc.urgencia]++;
                    }
                    // Sentiment
                    const sent = inc.sentimiento || 'Neutral';
                    sentimentMap[sent] = (sentimentMap[sent] || 0) + 1;
                }
            });
            const urgencyData = Object.entries(urgencyMap).map(([name, value]) => ({ name, value }));
            const sentimentData = Object.entries(sentimentMap)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value);

            // Charts: Top Comunidades (Most Pending Incidents)
            const comMap = new Map<string, number>();
            incidencias?.forEach(inc => {
                if (!inc.resuelto) {
                    // @ts-ignore
                    const name = inc.comunidades?.nombre_cdad || 'Desconocida';
                    comMap.set(name, (comMap.get(name) || 0) + 1);
                }
            });
            const topComunidades = Array.from(comMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            // Table: User Performance
            const userMap = new Map<string, { assigned: number, resolved: number }>();

            // Initialize with all profiles first
            if (profiles) {
                profiles.forEach(p => {
                    if (p.nombre) {
                        userMap.set(p.nombre, { assigned: 0, resolved: 0 });
                    }
                });
            }

            incidencias?.forEach(inc => {
                // @ts-ignore
                const profileData = inc.profiles;

                // Handle both array and object cases
                const profile = Array.isArray(profileData) ? profileData[0] : profileData;
                const userName = profile?.nombre || 'Sin Asignar';
                const current = userMap.get(userName) || { assigned: 0, resolved: 0 };
                current.assigned++;
                if (inc.resuelto) current.resolved++;
                userMap.set(userName, current);
            });

            const userPerformance = Array.from(userMap.entries()).map(([name, data]) => ({
                name,
                ...data,
                pending: data.assigned - data.resolved,
                efficiency: data.assigned > 0 ? Math.round((data.resolved / data.assigned) * 100) : 0
            }));

            // Charts: Debt by Community
            const debtByCom = new Map<string, number>();
            morosidad?.forEach(m => {
                if (m.estado !== 'Pagado') {
                    // @ts-ignore
                    const name = m.comunidades?.nombre_cdad || 'Desconocida';
                    debtByCom.set(name, (debtByCom.get(name) || 0) + (m.importe || 0));
                }
            });
            const debtByCommunity = Array.from(debtByCom.entries())
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 5);

            // Charts: Debt Status
            const debtStatusMap = { 'Pendiente': 0, 'Pagado': 0 };
            morosidad?.forEach(m => {
                if (m.estado && debtStatusMap.hasOwnProperty(m.estado)) {
                    // @ts-ignore
                    debtStatusMap[m.estado] += (m.importe || 0);
                }
            });
            const debtStatus = Object.entries(debtStatusMap).map(([name, value]) => ({ name, value }));

            setChartData({
                incidenciasEvolution: evolutionData,
                urgencyDistribution: urgencyData,
                topComunidades,
                userPerformance,
                debtByCommunity,
                debtStatus,
                incidenciasStatus: [
                    { name: 'Resuelta', value: resueltas },
                    { name: 'Pendiente', value: pendientes }
                ],
                sentimentDistribution: sentimentData
            });

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            toast.error('Error al cargar datos del dashboard');
        } finally {
            setLoading(false);
        }
    }, [period, selectedCommunity]);

    const generatePDFReport = async () => {
        if (loading || isGeneratingPDF) return;

        setIsGeneratingPDF(true);
        const loadingToast = toast.loading('Generando reporte PDF...');

        try {
            const captureChart = async (id: string) => {
                const element = document.getElementById(id);
                if (!element) return null;
                try {
                    // html-to-image works better with SVGs (Recharts)
                    return await htmlToImage.toPng(element, {
                        quality: 0.95,
                        backgroundColor: '#ffffff',
                        pixelRatio: 2
                    });
                } catch (err) {
                    console.warn(`Error capturing ${id}:`, err);
                    return null;
                }
            };

            const charts = {
                evolution: await captureChart('chart-evolution'),
                urgency: await captureChart('chart-urgency'),
                sentiment: await captureChart('chart-sentiment'),
                debtStatus: await captureChart('chart-debt-status'),
                incidentStatus: await captureChart('chart-incident-status'),
                topCommunities: await captureChart('chart-top-communities'),
                debtByCommunity: await captureChart('chart-debt-by-community'),
            };

            const payload = {
                stats: {
                    ...stats,
                    totalDeuda: `${stats.totalDeuda.toLocaleString()}€`
                },
                period,
                communityName: selectedCommunity === 'all'
                    ? 'Todas'
                    : (() => {
                        const c = communities.find(c => String(c.id) === selectedCommunity);
                        return c ? `${c.codigo} - ${c.nombre_cdad}` : 'Seleccionada';
                    })(),
                charts,
                userPerformance: chartData.userPerformance,
                topComunidades: chartData.topComunidades
            };

            const response = await fetch('/api/dashboard/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Error al generar el PDF');

            const now = new Date();
            const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
            const communityLabel = selectedCommunity === 'all'
                ? 'Todas'
                : (() => {
                    const c = communities.find(c => String(c.id) === selectedCommunity);
                    return c ? `${c.codigo} - ${c.nombre_cdad}` : 'Seleccionada';
                })();
            const safeName = communityLabel.replace(/[^a-z0-9]/gi, '_');
            const filename = `${dateStr}_Reporte_${safeName}.pdf`;

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success('Reporte descargado correctamente', { id: loadingToast });
        } catch (error) {
            console.error(error);
            toast.error('Error al generar el reporte', { id: loadingToast });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    useEffect(() => {
        if (!isInitialized) return;

        fetchDashboardData();

        const channel = supabase
            .channel('dashboard-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias' }, () => fetchDashboardData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'morosidad' }, () => fetchDashboardData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comunidades' }, () => fetchDashboardData())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isInitialized, fetchDashboardData]); // Re-subscribe when fetchDashboardData changes (on period change)

    const COLORS = ['#FF8042', '#FFBB28', '#00C49F']; // Alta (Orange/Red), Media (Yellow), Baja (Green)
    const SENTIMENT_COLORS: Record<string, string> = {
        'Negativo': '#FF8042',
        'Neutral': '#FFBB28',
        'Positivo': '#00C49F'
    };

    return (
        <div className="space-y-6 md:space-y-8 pb-10">
            {/* Header / Filter */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div className="flex-shrink-0">
                    <h1 className="text-xl md:text-2xl font-bold text-neutral-900 tracking-tight">Panel de Control</h1>
                    <p className="text-neutral-500 text-sm">Visión general del estado de las comunidades.</p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
                    {/* Community Selector */}
                    <div className="flex items-center gap-2 w-full sm:w-80">
                        <Filter className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                        <div className="flex-1">
                            <SearchableSelect
                                options={[
                                    { value: 'all', label: 'Todas' },
                                    ...communities.map(c => ({
                                        value: String(c.id),
                                        label: `${c.codigo} - ${c.nombre_cdad}`
                                    }))
                                ]}
                                value={selectedCommunity}
                                onChange={(val) => changeCommunity(String(val))}
                                placeholder="Filtrar por comunidad..."
                                className="!py-1"
                            />
                        </div>
                    </div>

                    {/* Period Switcher */}
                    <div className="flex bg-white rounded-lg p-1 border border-neutral-200 shadow-sm w-full sm:w-auto">
                        <button
                            onClick={() => changePeriod('all')}
                            className={`flex-1 md:flex-none px-3 md:px-4 py-1.5 text-xs font-medium rounded-md transition ${period === 'all' ? 'bg-yellow-400 text-neutral-950 shadow-sm' : 'text-neutral-600 hover:bg-neutral-50'}`}
                        >
                            Todo
                        </button>
                        <button
                            onClick={() => changePeriod('30')}
                            className={`flex-1 md:flex-none px-3 md:px-4 py-1.5 text-xs font-medium rounded-md transition ${period === '30' ? 'bg-yellow-400 text-neutral-950 shadow-sm' : 'text-neutral-600 hover:bg-neutral-50'}`}
                        >
                            30 días
                        </button>
                        <button
                            onClick={() => changePeriod('90')}
                            className={`flex-1 md:flex-none px-3 md:px-4 py-1.5 text-xs font-medium rounded-md transition ${period === '90' ? 'bg-yellow-400 text-neutral-950 shadow-sm' : 'text-neutral-600 hover:bg-neutral-50'}`}
                        >
                            90 días
                        </button>
                    </div>

                    {/* PDF Download Button */}
                    <button
                        onClick={generatePDFReport}
                        disabled={loading || isGeneratingPDF}
                        className="flex items-center gap-2 bg-neutral-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-neutral-800 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto justify-center"
                    >
                        {loading || isGeneratingPDF ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <FileDown className="w-4 h-4" />
                        )}
                        {loading ? 'Cargando datos...' : (isGeneratingPDF ? 'Generando...' : 'Descargar PDF')}
                    </button>
                </div>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <KPICard
                    title="Comunidades"
                    value={
                        selectedCommunity === 'all'
                            ? 'Todas'
                            : (() => {
                                const c = communities.find((c) => String(c.id) === selectedCommunity);
                                return c ? `${c.codigo} - ${c.nombre_cdad}` : 'Seleccionada';
                            })()
                    }
                    icon={Building}
                    color="text-blue-500"
                    href="/dashboard/comunidades"
                />
                <KPICard
                    title="Incidencias Pendientes"
                    value={stats.incidenciasPendientes}
                    icon={AlertCircle}
                    color="text-red-500"
                    href="/dashboard/incidencias"
                />
                <KPICard
                    title="Incidencias Resueltas"
                    value={stats.incidenciasResueltas}
                    icon={CheckCircle}
                    color="text-green-500"
                    href="/dashboard/incidencias"
                />
                <KPICard
                    title="Deuda Total"
                    value={`${stats.totalDeuda.toLocaleString()}€`}
                    icon={FileText}
                    color="text-yellow-600"
                    href="/dashboard/deudas"
                />
            </div>

            {/* Charts Row */}
            <div className={`grid grid-cols-1 ${selectedCommunity === 'all' ? 'lg:grid-cols-4' : 'lg:grid-cols-1'} gap-6`}>
                {/* Evolution Chart */}
                <div className={`${selectedCommunity === 'all' ? 'lg:col-span-2' : ''} bg-white p-4 md:p-6 rounded-xl border border-neutral-200 shadow-sm`}>
                    <h3 className="text-base md:text-lg font-bold text-neutral-800 mb-4 md:mb-6 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-neutral-400" />
                        Evolución de Incidencias
                    </h3>
                    <div className="h-[200px] md:h-[300px] w-full" id="chart-evolution">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData.incidenciasEvolution}>
                                <defs>
                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#FACC15" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#FACC15" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 12, fill: '#737373' }}
                                    tickLine={false}
                                    axisLine={false}
                                    dy={10}
                                />
                                <YAxis
                                    tick={{ fontSize: 12, fill: '#737373' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e5e5', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="count"
                                    stroke="#EAB308"
                                    fillOpacity={1}
                                    fill="url(#colorCount)"
                                    activeDot={{ r: 6 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Urgency & Sentiment Pie Charts - Only here if 'all' */}
                {selectedCommunity === 'all' && (
                    <>
                        <div className="bg-white p-4 md:p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col">
                            <h3 className="text-base md:text-lg font-bold text-neutral-800 mb-2">Urgencia</h3>
                            <div className="flex-1 min-h-[300px] md:min-h-[250px] relative" id="chart-urgency">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData.urgencyDistribution}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="60%"
                                            outerRadius="80%"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {chartData.urgencyDistribution.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-white p-4 md:p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col">
                            <h3 className="text-base md:text-lg font-bold text-neutral-800 mb-2">Sentimiento</h3>
                            <div className="flex-1 min-h-[300px] md:min-h-[250px] relative" id="chart-sentiment">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData.sentimentDistribution}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="60%"
                                            outerRadius="80%"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {chartData.sentimentDistribution.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={SENTIMENT_COLORS[entry.name] || '#94a3b8'} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Charts Row 2 & Stats */}
            {selectedCommunity === 'all' && (
                <div className="grid grid-cols-1 gap-6">
                    {/* Top Communities Bar Chart */}
                    <div className="bg-white p-4 md:p-6 rounded-xl border border-neutral-200 shadow-sm">
                        <h3 className="text-base md:text-lg font-bold text-neutral-800 mb-4 md:mb-6">Comunidades con Más Incidencias</h3>
                        <div className="h-[250px] md:h-[300px]" id="chart-top-communities">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={chartData.topComunidades}
                                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E5E5E5" />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        width={100}
                                        tick={{ fontSize: 11, fill: '#525252' }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip cursor={{ fill: '#f5f5f5' }} />
                                    <Bar dataKey="count" fill="#404040" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* Debt Analysis Row */}
            <div className={`grid grid-cols-1 ${selectedCommunity === 'all' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-6`}>
                {selectedCommunity === 'all' ? (
                    <>
                        {/* Debt by Community */}
                        <div className="lg:col-span-2 bg-white p-4 md:p-6 rounded-xl border border-neutral-200 shadow-sm">
                            <h3 className="text-base md:text-lg font-bold text-neutral-800 mb-4 md:mb-6 flex items-center gap-2">
                                <FileText className="w-4 h-4 md:w-5 md:h-5 text-neutral-400" />
                                Deuda por Comunidad
                            </h3>
                            <div className="h-[250px] md:h-[300px]" id="chart-debt-by-community">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={chartData.debtByCommunity}
                                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#525252' }} tickLine={false} axisLine={false} interval={0} />
                                        <YAxis tick={{ fontSize: 11, fill: '#525252' }} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            cursor={{ fill: '#f5f5f5' }}
                                            formatter={(value: any) => [`${value.toLocaleString()}€`, 'Deuda']}
                                        />
                                        <Bar dataKey="value" fill="#CA8A04" radius={[4, 4, 0, 0]} barSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Debt Status */}
                        <div className="bg-white p-4 md:p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col">
                            <h3 className="text-base md:text-lg font-bold text-neutral-800 mb-2">Estado de Deuda</h3>
                            <div className="flex-1 min-h-[300px] md:min-h-[250px] relative" id="chart-debt-status">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData.debtStatus}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="60%"
                                            outerRadius="80%"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {chartData.debtStatus.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={entry.name === 'Pagado' ? '#00C49F' : '#eab308'}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value: any, name: any) => [`${value.toLocaleString()}€`, name]} />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* When a community is selected, we show Urgency and Debt Status side by side to match PDF sizes */}
                        <div className="bg-white p-4 md:p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col">
                            <h3 className="text-base md:text-lg font-bold text-neutral-800 mb-2">Incidencias</h3>
                            <div className="flex-1 min-h-[300px] md:min-h-[250px] relative" id="chart-incident-status">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData.incidenciasStatus}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="60%"
                                            outerRadius="80%"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {chartData.incidenciasStatus.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={entry.name === 'Resuelta' ? '#00C49F' : '#eab308'}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-white p-4 md:p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col">
                            <h3 className="text-base md:text-lg font-bold text-neutral-800 mb-2">Urgencia</h3>
                            <div className="flex-1 min-h-[300px] md:min-h-[250px] relative" id="chart-urgency">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData.urgencyDistribution}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="60%"
                                            outerRadius="80%"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {chartData.urgencyDistribution.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-white p-4 md:p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col">
                            <h3 className="text-base md:text-lg font-bold text-neutral-800 mb-2">Sentimiento</h3>
                            <div className="flex-1 min-h-[300px] md:min-h-[250px] relative" id="chart-sentiment">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData.sentimentDistribution}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="60%"
                                            outerRadius="80%"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {chartData.sentimentDistribution.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={SENTIMENT_COLORS[entry.name] || '#94a3b8'} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-white p-4 md:p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col">
                            <h3 className="text-base md:text-lg font-bold text-neutral-800 mb-2">Estado Deuda</h3>
                            <div className="flex-1 min-h-[300px] md:min-h-[250px] relative" id="chart-debt-status">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData.debtStatus}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="60%"
                                            outerRadius="80%"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {chartData.debtStatus.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={entry.name === 'Pagado' ? '#00C49F' : '#eab308'}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value: any, name: any) => [`${value.toLocaleString()}€`, name]} />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Performance & Global Status */}
            <div className={`grid grid-cols-1 ${selectedCommunity === 'all' ? 'lg:grid-cols-3' : ''} gap-6`}>
                {selectedCommunity === 'all' && (
                    <div className="bg-white p-4 md:p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col">
                        <h3 className="text-base md:text-lg font-bold text-neutral-800 mb-2">Estado de Incidencias</h3>
                        <div className="flex-1 min-h-[300px] md:min-h-[250px] relative" id="chart-incident-status">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartData.incidenciasStatus}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius="60%"
                                        outerRadius="80%"
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {chartData.incidenciasStatus.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.name === 'Resuelta' ? '#00C49F' : '#eab308'}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                <div className={`bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden ${selectedCommunity === 'all' ? 'lg:col-span-2' : ''}`}>
                    <div className="px-4 md:px-6 py-3 md:py-4 border-b border-neutral-100 bg-neutral-50">
                        <h3 className="text-base md:text-lg font-bold text-neutral-900">Rendimiento del Equipo</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white text-neutral-500 font-medium border-b border-neutral-100">
                                <tr>
                                    <th className="px-6 py-3">Usuario</th>
                                    <th className="px-6 py-3 text-center">Incidencias Asignadas</th>
                                    <th className="px-6 py-3 text-center">Resueltas</th>
                                    <th className="px-6 py-3 text-center">Pendientes</th>
                                    <th className="px-6 py-3 text-center">Eficacia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {chartData.userPerformance.map((user, i) => (
                                    <tr key={i} className="hover:bg-neutral-50 transition">
                                        <td className="px-6 py-3 font-medium text-neutral-900">{user.name}</td>
                                        <td className="px-6 py-3 text-center">{user.assigned}</td>
                                        <td className="px-6 py-3 text-center">{user.resolved}</td>
                                        <td className="px-6 py-3 text-center font-medium text-yellow-600">{user.pending}</td>
                                        <td className="px-6 py-3 text-center">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${user.efficiency >= 80 ? 'bg-green-100 text-green-700' :
                                                user.efficiency >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                {user.efficiency}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
