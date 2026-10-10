import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, Users, Activity, CreditCard, 
  Map, Search, Bell, LogOut, ArrowUpRight, Zap, Edit3, CheckCircle2
} from 'lucide-react';
import axios from 'axios';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data States
  const [passengers, setPassengers] = useState([]);
  const [routes, setRoutes] = useState([]);
  
  // RFID Sim State
  const [rfidForm, setRfidForm] = useState({ userId: '', amount: '150' });
  const [rfidStatus, setRfidStatus] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/login');
      return;
    }
    const parsedUser = JSON.parse(storedUser);
    if (parsedUser.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    setAdmin(parsedUser);
    fetchUsers();
    fetchRoutes();
  }, [navigate]);

  const fetchUsers = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/users');
      if (res.data.success) {
        setPassengers(res.data.users);
      }
    } catch (e) {
      console.error("Failed to fetch users");
    }
  };

  const fetchRoutes = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/routes');
      if (res.data.success) {
        setRoutes(res.data.routes);
      }
    } catch (e) {
      console.error("Failed to fetch routes");
    }
  };

  const handleRouteUpdate = async (id, baseFare, perKm) => {
    try {
      const res = await axios.put(`http://localhost:5000/api/routes/${id}`, { baseFare, perKm });
      if (res.data.success) {
        fetchRoutes(); // Re-fetch to confirm update
        alert(`Route ${res.data.route.name} Pricing Updated!`);
      }
    } catch (e) {
      alert("Failed to update route pricing.");
    }
  };

  const handleRfidTap = async (e) => {
    e.preventDefault();
    setRfidStatus({ loading: true });
    try {
      const res = await axios.post('http://localhost:5000/api/rfid/tap', {
        userId: rfidForm.userId,
        amount: Number(rfidForm.amount)
      });
      if (res.data.success) {
        setRfidStatus({ type: 'success', msg: `Payment Rs.${rfidForm.amount} Approved.` });
        fetchUsers(); // Refresh balances
      }
    } catch (e) {
      setRfidStatus({ type: 'error', msg: e.response?.data?.message || 'Error processing RFID tap' });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar - Dark Utility */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col fixed h-full z-10 transition-transform md:translate-x-0 -translate-x-full">
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <ShieldCheck className="text-rail-blue w-6 h-6 mr-2" />
          <span className="font-outfit font-bold text-lg tracking-tight text-white">SmartRail <span className="text-rail-blue">Control</span></span>
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-1">
          <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center px-4 py-3 rounded-sm text-sm font-medium transition-colors ${activeTab === 'overview' ? 'bg-rail-blue/10 text-rail-blue' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Activity className="w-5 h-5 mr-3" /> System Overview
          </button>
          <button onClick={() => setActiveTab('users')} className={`w-full flex items-center px-4 py-3 rounded-sm text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-rail-blue/10 text-rail-blue' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Users className="w-5 h-5 mr-3" /> Manage Users
          </button>
          <button onClick={() => setActiveTab('routes')} className={`w-full flex items-center px-4 py-3 rounded-sm text-sm font-medium transition-colors ${activeTab === 'routes' ? 'bg-rail-blue/10 text-rail-blue' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Map className="w-5 h-5 mr-3" /> Routes & Pricing
          </button>
          <button onClick={() => setActiveTab('rfid')} className={`w-full flex items-center px-4 py-3 rounded-sm text-sm font-medium transition-colors ${activeTab === 'rfid' ? 'bg-rail-blue/10 text-rail-blue' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <CreditCard className="w-5 h-5 mr-3" /> RFID Emulation
          </button>
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center px-4 py-3">
            <div className="w-2 h-2 rounded-full bg-green-500 mr-3 animate-pulse"></div>
            <span className="text-xs font-mono text-slate-400">Server: ONLINE</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-64 flex flex-col min-h-screen relative">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-0">
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input type="text" placeholder="Search..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-sm text-sm focus:outline-none focus:border-rail-blue transition-all" />
          </div>
          <div className="flex items-center gap-6">
            <button onClick={handleLogout} className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
               Sign Out <LogOut className="w-4 h-4 ml-1 opacity-50" />
            </button>
          </div>
        </header>

        <div className="p-8 lg:p-12 space-y-8 flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <motion.div key="overview" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold outfit">System Overview</h1>
                  <p className="text-slate-500 text-sm mt-1">Live metrics from Sri Lanka Railways infrastructure.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-card flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 rounded-sm bg-slate-50 flex items-center justify-center text-rail-blue"><Users className="w-5 h-5" /></div>
                      <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-sm">+12%</span>
                    </div>
                    <div>
                      <h3 className="text-3xl font-bold outfit tracking-tight">{passengers.length || '...'}</h3>
                      <p className="text-sm text-slate-500 font-medium uppercase tracking-wider mt-1">Total Passengers</p>
                    </div>
                  </div>
                  <div className="glass-card">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 rounded-sm bg-slate-50 flex items-center justify-center text-rail-blue"><Map className="w-5 h-5" /></div>
                    </div>
                    <div>
                      <h3 className="text-3xl font-bold outfit tracking-tight">{routes.length || '...'}</h3>
                      <p className="text-sm text-slate-500 font-medium uppercase tracking-wider mt-1">Active Routes</p>
                    </div>
                  </div>
                  <div className="glass-card">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 rounded-sm bg-slate-50 flex items-center justify-center text-rail-blue"><Activity className="w-5 h-5" /></div>
                    </div>
                    <h3 className="text-3xl font-bold outfit tracking-tight text-green-600">Stable</h3>
                    <p className="text-sm text-slate-500 font-medium uppercase tracking-wider mt-1">API Health</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* USERS TAB */}
            {activeTab === 'users' && (
              <motion.div key="users" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h1 className="text-2xl font-bold outfit">Manage Passengers</h1>
                    <p className="text-slate-500 text-sm mt-1">View registered cards and current balances.</p>
                  </div>
                  <button onClick={fetchUsers} className="btn-primary py-2 px-4 text-xs flex items-center gap-2">Refresh Data</button>
                </div>
                
                <div className="glass-card p-0 overflow-hidden">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                      <tr>
                        <th className="px-6 py-4 border-b border-slate-100">Passenger ID</th>
                        <th className="px-6 py-4 border-b border-slate-100">Username</th>
                        <th className="px-6 py-4 border-b border-slate-100 text-right">Card Balance</th>
                        <th className="px-6 py-4 border-b border-slate-100 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {passengers.length === 0 ? (
                        <tr><td colSpan="4" className="text-center py-8 text-slate-400">No passengers found.</td></tr>
                      ) : passengers.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4 font-mono text-xs text-slate-400">SR-{p.id.toString().padStart(4, '0')}</td>
                          <td className="px-6 py-4 font-semibold">{p.username}</td>
                          <td className="px-6 py-4 font-bold font-mono text-right text-rail-blue">Rs. {p.balance}</td>
                          <td className="px-6 py-4 text-center"><span className="bg-green-50 text-green-600 px-2 py-1 rounded-sm text-[10px] uppercase font-bold tracking-widest">Active</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* ROUTES TAB */}
            {activeTab === 'routes' && (
              <motion.div key="routes" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold outfit">Routes & Pricing Engine</h1>
                  <p className="text-slate-500 text-sm mt-1">Configure base fares and per-km rates for the Smart Card billing system.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {routes.map(r => (
                    <div key={r.id} className="glass-card relative overflow-hidden group">
                       <div className="flex justify-between items-start mb-6">
                         <div>
                            <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-sm text-[10px] uppercase font-bold tracking-widest mb-2 inline-block">ID: LK-R{r.id.toString().padStart(2, '0')}</span>
                            <h3 className="text-xl font-bold outfit">{r.name}</h3>
                            <p className="text-sm font-mono text-slate-500 mt-1">{r.stations}</p>
                         </div>
                         <div className="w-10 h-10 rounded-sm bg-rail-blue/5 flex items-center justify-center text-rail-blue"><Map className="w-5 h-5" /></div>
                       </div>

                       <form 
                        onSubmit={(e) => {
                          e.preventDefault();
                          const formData = new FormData(e.target);
                          handleRouteUpdate(r.id, formData.get('baseFare'), formData.get('perKm'));
                        }} 
                        className="space-y-4"
                       >
                         <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-sm border border-slate-100">
                           <div>
                             <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Base Fare (Rs)</label>
                             <input type="number" name="baseFare" defaultValue={r.baseFare} className="input-field py-1 text-sm bg-white" required />
                           </div>
                           <div>
                             <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Per KM (Rs)</label>
                             <input type="number" name="perKm" defaultValue={r.perKm} className="input-field py-1 text-sm bg-white" required />
                           </div>
                         </div>
                         <button type="submit" className="w-full border border-slate-200 text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 font-bold py-2 rounded-sm transition-colors uppercase tracking-widest text-xs flex justify-center items-center gap-2">
                           <Edit3 className="w-3 h-3" /> Update Pricing Schema
                         </button>
                       </form>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* RFID EMULATION TAB */}
            {activeTab === 'rfid' && (
              <motion.div key="rfid" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="space-y-6 max-w-2xl">
                <div>
                  <h1 className="text-2xl font-bold outfit">RFID Terminal Emulator</h1>
                  <p className="text-slate-500 text-sm mt-1">Simulate a hardware ticket barrier tap.</p>
                </div>
                
                <div className="glass-card">
                  <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                    <div className="w-12 h-12 bg-slate-900 rounded-sm flex items-center justify-center text-white">
                      <Zap className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold outfit text-lg">Station Module</h3>
                      <p className="text-xs text-slate-400 font-mono">ID: TERM-FORT-01</p>
                    </div>
                  </div>

                  <form onSubmit={handleRfidTap} className="space-y-4">
                    {rfidStatus && (
                      <div className={`p-3 text-sm font-medium border-l-2 ${rfidStatus.type === 'error' ? 'bg-red-50 text-red-600 border-red-500' : 'bg-green-50 text-green-600 border-green-500'}`}>
                        {rfidStatus.loading ? 'Scanning via hardware...' : rfidStatus.msg}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Passenger ID (Integer)</label>
                        <input type="number" required placeholder="e.g. 1" className="input-field" value={rfidForm.userId} onChange={e => setRfidForm({...rfidForm, userId: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Fare Amount (Rs.)</label>
                        <input type="number" required placeholder="150" className="input-field" value={rfidForm.amount} onChange={e => setRfidForm({...rfidForm, amount: e.target.value})} />
                      </div>
                    </div>
                    <button type="submit" className="w-full bg-slate-900 hover:bg-rail-blue text-white font-bold py-3 rounded-sm transition-colors uppercase tracking-widest text-sm flex justify-center items-center gap-2">
                       Simulate Smart Card Tap
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
