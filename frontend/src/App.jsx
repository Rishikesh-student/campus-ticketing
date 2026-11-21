import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import AuthPage from './components/AuthPage';
import ResourcesTab from './components/ResourcesTab';
import EventsAndTicketsTab from './components/EventsAndTicketsTab';
import GateScannerTab from './components/GateScannerTab';
import AdminDashboardTab from './components/AdminDashboardTab';
import { LogOut, Ticket, Building2, QrCode, ShieldCheck } from 'lucide-react';
import AiHelperWidget from './components/AiHelperWidget';

export default function App() {
  const { user, logoutUser } = useAuth();
  const [activeTab, setActiveTab] = useState('events');

  if (!user) return <AuthPage />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold">
              C
            </div>
            <div>
              <h1 className="font-bold text-sm sm:text-base leading-none">CampusHub</h1>
              <span className="text-[11px] text-slate-400">Resource & Ticketing Engine</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs sm:text-sm">
            <button
              onClick={() => setActiveTab('events')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'events' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Ticket className="w-4 h-4" /> Events & Passes
            </button>

            <button
              onClick={() => setActiveTab('resources')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'resources' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-4 h-4" /> Campus Resources
            </button>

            {(user.role === 'organizer' || user.role === 'admin') && (
              <button
                onClick={() => setActiveTab('scanner')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                  activeTab === 'scanner' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                }`}
              >
                <QrCode className="w-4 h-4" /> Gate Scanner
              </button>
            )}

            {user.role === 'admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                  activeTab === 'admin' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                }`}
              >
                <ShieldCheck className="w-4 h-4" /> Admin Panel
              </button>
            )}
          </nav>

          {/* User Badge + Logout */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold">{user.name}</p>
              <p className="text-[11px] text-indigo-400 uppercase">{user.role}</p>
            </div>
            <button
              onClick={logoutUser}
              title="Logout"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {activeTab === 'events' && <EventsAndTicketsTab />}
        {activeTab === 'resources' && <ResourcesTab />}
        {activeTab === 'scanner' && <GateScannerTab />}
        {activeTab === 'admin' && <AdminDashboardTab />}
      </main>

      <AiHelperWidget />
    </div>
  );
}