import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="h-screen bg-neutral-950 text-white overflow-hidden flex">
            {/* Fixed Sidebar */}
            <Sidebar />

            {/* Main content area */}
            <div className="flex-1 flex flex-col bg-white text-neutral-900 overflow-hidden">
                {/* Fixed Navbar */}
                <Navbar />

                {/* Scrollable content */}
                <main className="flex-1 overflow-y-auto px-6 py-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
