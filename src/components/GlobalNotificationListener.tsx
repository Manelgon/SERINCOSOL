'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Bell } from 'lucide-react';

export default function GlobalNotificationListener() {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Pre-load audio
        audioRef.current = new Audio('/sounds/notification.mp3');

        // Setup listener
        const channel = supabase
            .channel('global_notifications')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                async (payload) => {
                    const newNoti = payload.new as any;

                    // Verify if it's for current user
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user || user.id !== newNoti.user_id) return;

                    // Play sound
                    try {
                        if (audioRef.current) {
                            audioRef.current.currentTime = 0;
                            await audioRef.current.play();
                        }
                    } catch (e) {
                        console.error("Audio play failed", e);
                    }

                    // Show custom toast
                    toast((t) => (
                        <div className="flex items-start gap-3 w-full max-w-sm">
                            <div className="flex-shrink-0 pt-0.5">
                                <div className="h-8 w-8 rounded-full bg-yellow-100 flex items-center justify-center">
                                    <Bell className="h-5 w-5 text-yellow-600" />
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900">
                                    Nuevo Aviso
                                </p>
                                <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                                    {newNoti.title}
                                </p>
                            </div>
                            <div className="flex-shrink-0 border-l border-gray-200 pl-3 ml-2 flex">
                                <button
                                    onClick={() => toast.dismiss(t.id)}
                                    className="w-full border border-transparent rounded-none rounded-r-lg p-2 flex items-center justify-center text-sm font-medium text-gray-400 hover:text-gray-500 focus:outline-none"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    ), {
                        duration: 5000,
                        position: 'top-right',
                        style: {
                            minWidth: '320px',
                        },
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return null;
}
