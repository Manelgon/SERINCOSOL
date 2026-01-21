
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);

    // Load remembered credentials on mount
    useEffect(() => {
        const saved = localStorage.getItem('remembered_credentials');
        if (saved) {
            try {
                const { email: savedEmail, password: savedPassword, timestamp } = JSON.parse(saved);
                const thirtyDays = 30 * 24 * 60 * 60 * 1000;

                if (Date.now() - timestamp < thirtyDays) {
                    setEmail(savedEmail);
                    setPassword(savedPassword);
                    setRememberMe(true);
                } else {
                    localStorage.removeItem('remembered_credentials');
                }
            } catch (e) {
                localStorage.removeItem('remembered_credentials');
            }
        }
    }, []);

    // Clear credentials if rememberMe is unchecked
    useEffect(() => {
        if (!rememberMe) {
            localStorage.removeItem('remembered_credentials');
        }
    }, [rememberMe]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            // Handle credential persistence
            if (!error && rememberMe) {
                const dataToSave = {
                    email,
                    password,
                    timestamp: Date.now()
                };
                localStorage.setItem('remembered_credentials', JSON.stringify(dataToSave));

                await supabase.auth.updateUser({
                    data: { remember_me: true }
                });
            } else if (!error && !rememberMe) {
                localStorage.removeItem('remembered_credentials');
            }

            if (error) {
                toast.error('Error al iniciar sesión: ' + error.message);
            } else {
                toast.success('Sesión iniciada correctamente');
                router.push('/dashboard');
            }
        } catch (error) {
            toast.error('Ocurrió un error inesperado');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100 w-full max-w-md">
            <div className="mb-6 text-center">
                <div className="flex justify-center mb-6">
                    <img
                        src="/serincosol-logo.png"
                        alt="Serincosol Logo"
                        className="h-20 w-auto object-contain"
                    />
                </div>
                <h1 className="text-2xl font-bold text-gray-800">Iniciar Sesión</h1>
                <p className="text-sm text-gray-500 mt-2">Accede al panel de administración</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                        type="email"
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                        placeholder="usuario@ejemplo.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                    <input
                        type="password"
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>

                <div className="flex items-center">
                    <input
                        type="checkbox"
                        id="rememberMe"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 text-yellow-400 border-gray-300 rounded focus:ring-yellow-400"
                    />
                    <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-700">
                        Recuérdame
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-neutral-950 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Entrando...' : 'Entrar'}
                </button>
            </form>

            <div className="mt-6 text-center text-sm">
                <span className="text-gray-500">¿No tienes cuenta?</span>{' '}
                {/* Link to signup if needed, but usually admin created. Leaving placeholder or just text. */}
                <span className="text-yellow-600 font-medium cursor-not-allowed opacity-70" title="Contacta con el administrador">
                    Contacta con soporte
                </span>
            </div>
        </div>
    );
}
