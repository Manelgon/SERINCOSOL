import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    href?: string;
    color?: string; // e.g., 'text-yellow-500'
    trend?: string; // Optional trend indicator logic could be added here
}

export default function KPICard({ title, value, icon: Icon, href, color = 'text-yellow-400' }: KPICardProps) {
    const Content = (
        <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-1">
                        {title}
                    </p>
                    <h3 className="text-3xl font-bold text-neutral-900">
                        {value}
                    </h3>
                </div>
                <div className={`p-3 rounded-full bg-neutral-50 group-hover:bg-neutral-100 transition-colors ${color}`}>
                    <Icon className="w-8 h-8" />
                </div>
            </div>
            {href && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-0 group-hover:opacity-100 transition-opacity text-yellow-500" />
            )}
        </div>
    );

    if (href) {
        return <Link href={href} className="block">{Content}</Link>;
    }

    return Content;
}
