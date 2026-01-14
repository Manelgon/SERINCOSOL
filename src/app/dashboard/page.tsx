'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import KPICard from '@/components/KPICard';
import { Building, AlertCircle, FileText, CheckCircle, TrendingUp, Users } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { toast } from 'react-hot-toast';

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
    }>({
        incidenciasEvolution: [],
        urgencyDistribution: [],
        topComunidades: [],
        userPerformance: [],
        debtByCommunity: [],
        debtStatus: []
    });

    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('30'); // Default to '30'
    const [isInitialized, setIsInitialized] = useState(false);

    // Load period from localStorage on mount
    useEffect(() => {
        const savedPeriod = localStorage.getItem('dashboard_period');
        if (savedPeriod && ['30', '90', 'all'].includes(savedPeriod)) {
            setPeriod(savedPeriod);
        }
        setIsInitialized(true);
    }, []);

    // Save period to localStorage when it changes
    const changePeriod = (newPeriod: string) => {
        setPeriod(newPeriod);
        localStorage.setItem('dashboard_period', newPeriod);
    };

    useEffect(() => {
        if (isInitialized) {
            fetchDashboardData();
        }
    }, [period, isInitialized]);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Basic Counts
            const { count: countComunidades } = await supabase.from('comunidades').select('*', { count: 'exact', head: true });

            // 2. Fetch Incidencias (All for heavy aggregations, optimizing later if needed)
            // Note: In a real large app, create RPC functions for this.

            // Filter by date if needed
            let query = supabase.from('incidencias').select(`
                id, created_at, resuelto, urgencia, sentimiento, gestor_asignado, comunidad_id,
                comunidades (nombre_cdad),
                profiles:gestor_asignado (nombre)
            `);

            if (period !== 'all') {
                const date = new Date();
                date.setDate(date.getDate() - parseInt(period));
                query = query.gte('created_at', date.toISOString());
            }

            const { data: incidencias, error: incError } = await query;
            if (incError) throw incError;

            // 3. Fetch Morosidad
            const { data: morosidad, error: morError } = await supabase.from('morosidad').select('importe, estado, comunidad_id, comunidades(nombre_cdad)');
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

            // Charts: Evolution (Group by Day/Week)
            // Simplified grouping by Date
            const evolutionMap = new Map<string, number>();
            incidencias?.forEach(inc => {
                const date = new Date(inc.created_at).toLocaleDateString();
                evolutionMap.set(date, (evolutionMap.get(date) || 0) + 1);
            });
            const evolutionData = Array.from(evolutionMap.entries())
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .slice(-14); // Last 14 points for cleanliness

            // Charts: Urgency Distribution
            const urgencyMap = { 'Baja': 0, 'Media': 0, 'Alta': 0 };
            incidencias?.forEach(inc => {
                if (inc.urgencia && urgencyMap.hasOwnProperty(inc.urgencia)) {
                    // @ts-ignore
                    urgencyMap[inc.urgencia]++;
                }
            });
            const urgencyData = Object.entries(urgencyMap).map(([name, value]) => ({ name, value }));

            // Charts: Top Comunidades (Most Incidents)
            const comMap = new Map<string, number>();
            incidencias?.forEach(inc => {
                // @ts-ignore
                const name = inc.comunidades?.nombre_cdad || 'Desconocida';
                comMap.set(name, (comMap.get(name) || 0) + 1);
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

                const userName = profileData?.nombre || 'Sin Asignar';
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
            const debtStatusMap = { 'Pendiente': 0, 'Pagado': 0, 'En disputa': 0 };
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
                debtStatus
            });

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            toast.error('Error al cargar datos del dashboard');
        } finally {
            setLoading(false);
        }
    };

    const COLORS = ['#00C49F', '#FFBB28', '#FF8042']; // Green, Yellow, Orange/Red

    return (
        <div className="space-y-8 pb-10">
            {/* Header / Filter */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Panel de Control</h1>
                    <p className="text-neutral-500 text-sm">Visión general del estado de las comunidades.</p>
                </div>
                <div className="flex bg-white rounded-lg p-1 border border-neutral-200 shadow-sm">
                    <button
                        onClick={() => changePeriod('all')}
                        className={`px-4 py-1.5 text-xs font-medium rounded-md transition ${period === 'all' ? 'bg-yellow-400 text-neutral-950 shadow-sm' : 'text-neutral-600 hover:bg-neutral-50'}`}
                    >
                        Todo
                    </button>
                    <button
                        onClick={() => changePeriod('30')}
                        className={`px-4 py-1.5 text-xs font-medium rounded-md transition ${period === '30' ? 'bg-yellow-400 text-neutral-950 shadow-sm' : 'text-neutral-600 hover:bg-neutral-50'}`}
                    >
                        Últimos 30 días
                    </button>
                    <button
                        onClick={() => changePeriod('90')}
                        className={`px-4 py-1.5 text-xs font-medium rounded-md transition ${period === '90' ? 'bg-yellow-400 text-neutral-950 shadow-sm' : 'text-neutral-600 hover:bg-neutral-50'}`}
                    >
                        Trimestre
                    </button>
                </div>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KPICard
                    title="Comunidades"
                    value={stats.totalComunidades}
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
                    href="/dashboard/morosidad"
                />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Evolution Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
                    <h3 className="text-lg font-bold text-neutral-800 mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-neutral-400" />
                        Evolución de Incidencias
                    </h3>
                    <div className="h-[300px] w-full">
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

                {/* Urgency Pie Chart */}
                <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col">
                    <h3 className="text-lg font-bold text-neutral-800 mb-2">Urgencia</h3>
                    <div className="flex-1 min-h-[250px] relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData.urgencyDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
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
                        {/* Centered Text Logic could go here */}
                    </div>
                </div>
            </div>

            {/* Charts Row 2 & Stats */}
            <div className="grid grid-cols-1 gap-6">
                {/* Top Communities Bar Chart */}
                <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
                    <h3 className="text-lg font-bold text-neutral-800 mb-6">Comunidades con Más Incidencias</h3>
                    <div className="h-[300px]">
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

            {/* Debt Analysis Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Debt by Community */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
                    <h3 className="text-lg font-bold text-neutral-800 mb-6 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-neutral-400" />
                        Deuda por Comunidad
                    </h3>
                    <div className="h-[300px]">
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
                <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col">
                    <h3 className="text-lg font-bold text-neutral-800 mb-2">Estado de Deuda</h3>
                    <div className="flex-1 min-h-[250px] relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData.debtStatus}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {chartData.debtStatus.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.name === 'Pagado' ? '#22c55e' : entry.name === 'Pendiente' ? '#eab308' : '#ef4444'}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: any) => [`${value.toLocaleString()}€`, 'Importe']} />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>


            </div>

            {/* Performance Table */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50">
                    <h3 className="text-lg font-bold text-neutral-900">Rendimiento del Equipo</h3>
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
    );
}
