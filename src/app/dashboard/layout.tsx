'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import { Menu } from 'lucide-react';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="h-screen bg-neutral-950 text-white overflow-hidden flex">
            {/* Sidebar with mobile state */}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main content area */}
            <div className="flex-1 flex flex-col bg-white text-neutral-900 overflow-hidden">
                {/* Fixed Navbar with hamburger button */}
                <div className="border-b border-neutral-200 bg-white">
                    <div className="flex items-center gap-4 px-4 md:px-6 py-4">
                        {/* Navbar component */}
                        <div className="flex-1">
                            <Navbar />
                        </div>

                        {/* Hamburger button - visible only on mobile */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="md:hidden p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                            aria-label="Open menu"
                        >
                            <Menu className="w-5 h-5 text-neutral-700" />
                        </button>
                    </div>
                </div>

                {/* Scrollable content with responsive padding */}
                <main className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
