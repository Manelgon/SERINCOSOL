"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Bell } from 'lucide-react';

type Noti = {
    id: string;
    title: string;
    body: string | null;
    entity_type: string | null;
    entity_id: number | null;
    is_read: boolean;
    created_at: string;
};


interface NotificationsBellProps {
    align?: 'left' | 'right';
}

export default function NotificationsBell({ align = 'right' }: NotificationsBellProps) {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<Noti[]>([]);
    const [unread, setUnread] = useState(0);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const load = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from("notifications")
            .select("id,title,body,entity_type,entity_id,is_read,created_at")
            .eq('user_id', user.id)
            .order("created_at", { ascending: false })
            .limit(10);

        if (data) {
            setItems(data as Noti[]);
            // Count unread from the fetched 10 is not accurate for total count, 
            // but for "badge" usually we want total unread count.
            // Let's fetch total count separately or just rely on these 10?
            // Better to fetch count.

            const { count } = await supabase
                .from("notifications")
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('is_read', false);

            setUnread(count || 0);
        }
    };

    useEffect(() => {
        load();

        // click outside to close
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);

        // Realtime: nuevos avisos
        const ch = supabase
            .channel("notifications_live")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "notifications" },
                () => load()
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "notifications" },
                () => load()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(ch);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const markOne = async (id: string) => {
        // Optimistic update
        setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnread(prev => Math.max(0, prev - 1));

        await fetch("/api/notifications/read", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id }),
        });
        // load(); // No need to reload immediately if optimistic is fine, but maybe safer to sync
    };

    const markAll = async () => {
        setItems(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnread(0);

        await fetch("/api/notifications/read-all", { method: "POST" });
        load();
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setOpen(v => !v)}
                className="relative flex h-10 w-10 items-center justify-center rounded-md bg-black text-yellow-400 hover:bg-neutral-900 transition-colors"
                aria-label="Avisos"
            >
                <Bell className="w-5 h-5" />

                {unread > 0 && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-yellow-400 px-1.5 py-0.5 text-xs font-bold text-black min-w-[1.25rem]">
                        {unread}
                    </span>
                )}
            </button>

            {open && (
                <div className={`absolute mt-2 w-80 md:w-96 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl z-50 ${align === 'left' ? 'left-0' : 'right-0'
                    }`}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
                        <div className="text-sm font-bold text-neutral-900">Avisos</div>
                        {unread > 0 && (
                            <button
                                onClick={markAll}
                                className="text-xs font-semibold text-yellow-600 hover:text-yellow-700 hover:underline"
                            >
                                Marcar todo como leído
                            </button>
                        )}
                    </div>

                    <div className="max-h-[28rem] overflow-y-auto">
                        {items.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-neutral-500">
                                No tienes avisos recientes.
                            </div>
                        ) : (
                            items.map((n) => {
                                const href =
                                    n.entity_type === "incidencias" && n.entity_id
                                        ? `/dashboard/incidencias/${n.entity_id}`
                                        : "#";

                                return (
                                    <Link
                                        key={n.id}
                                        href={href}
                                        onClick={() => { markOne(n.id); setOpen(false); }}
                                        className={`block border-b border-neutral-50 px-4 py-3 hover:bg-neutral-50 transition-colors last:border-0 ${n.is_read ? "opacity-60 bg-white" : "bg-yellow-50/30"
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <span
                                                className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${n.is_read ? "bg-neutral-300" : "bg-yellow-400"
                                                    }`}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className={`text-sm ${n.is_read ? 'font-medium text-neutral-700' : 'font-bold text-neutral-900'}`}>
                                                    {n.title}
                                                </div>
                                                {n.body && (
                                                    <div className="mt-1 line-clamp-2 text-xs text-neutral-600">
                                                        {n.body}
                                                    </div>
                                                )}
                                                <div className="mt-1.5 text-[10px] text-neutral-400 font-medium">
                                                    {new Date(n.created_at).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })
                        )}
                    </div>

                    <div className="border-t border-neutral-200 px-4 py-3 bg-neutral-50">
                        <Link
                            href="/dashboard/avisos"
                            onClick={() => setOpen(false)}
                            className="block w-full text-center text-sm font-semibold text-neutral-900 hover:text-yellow-600 transition-colors"
                        >
                            Ver todos los avisos
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

