import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CreditCard, History, MapPin, Zap, LogOut, ArrowRight, TrainFront, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isToppingUp, setIsToppingUp] = useState(false);
  const [topUpSuccess, setTopUpSuccess] = useState(false);
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/login');
      return;
    }
    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);
    fetchHistory(parsedUser.id);
  }, [navigate]);

  const fetchHistory = async (userId) => {
    setIsLoadingHistory(true);
    try {
      const res = await axios.get(`http://localhost:5000/api/history/${userId}`);
      if (res.data.success) {
        setHistory(res.data.history);
      }
    } catch (e) {
      console.error("Failed to fetch history");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleTopUp = async () => {
    if (isToppingUp) return;
    setIsToppingUp(true);
    try {
      const response = await axios.post('http://localhost:5000/api/topup', {
        userId: user.id,
        amount: 500
      });

      if (response.data.success) {
        const updatedUser = { ...user, balance: response.data.balance };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser)); 
        
        setTopUpSuccess(true);
        fetchHistory(user.id);
        setTimeout(() => setTopUpSuccess(false), 2000); 
      }
    } catch (err) {
      console.error("Top up failed", err);
    } finally {
      setIsToppingUp(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navbar Minimalist */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <TrainFront className="text-rail-blue w-6 h-6" />
          <span className="font-outfit font-bold text-lg tracking-tight">SmartRail</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-sm font-medium text-slate-500 hidden md:block">
            Passenger ID: SR-{user.id.toString().padStart(4, '0')}
          </span>
          <button 
            onClick={handleLogout}
            className="text-slate-400 hover:text-rail-red transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <LogOut size={16} />
            <span className="hidden sm:block">Sign Out</span>
          </button>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 lg:p-12">
        
        {/* Hero Video Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative h-[300px] md:h-[450px] w-full overflow-hidden mb-12 rounded-2xl shadow-2xl border-4 border-white"
        >
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute top-0 left-0 w-full h-full object-cover"
          >
            <source src="/edit.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent flex flex-col justify-center px-8 md:px-12">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h1 className="text-4xl md:text-6xl font-black text-white outfit uppercase tracking-tighter leading-none">
                SmartRail <br />
                <span className="text-rail-blue">Innovators</span>
              </h1>
              <div className="h-1 w-24 bg-rail-blue mt-4 mb-6"></div>
              <p className="text-white/80 text-lg md:text-xl font-medium max-w-md leading-relaxed">
                Experience the next generation of railway ticketing. Seamless, fast, and secure.
              </p>
            </motion.div>
          </div>
          
          {/* Decorative Overlay */}
          <div className="absolute bottom-0 right-0 p-6 flex gap-4">
             <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                <TrainFront className="text-white w-6 h-6" />
             </div>
          </div>
        </motion.section>

        {/* Header Greeting */}
        <header className="mb-10">
          <motion.h1 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-4xl font-bold outfit text-slate-900"
          >
            Good Morning, <span className="text-rail-blue capitalize">{user.username}</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.1 }}
            className="text-slate-500 mt-2"
          >
            Your smart card is active and ready for travel.
          </motion.p>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column (Primary Tools - Card & Actions) */}
          <div className="lg:col-span-5 space-y-8">
            
            {/* The Smart Card Visual */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-slate-900 rounded-sm p-8 text-white relative overflow-hidden shadow-2xl group"
            >
              {/* Accents */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-rail-blue opacity-20 blur-[50px] group-hover:bg-blue-400 transition-colors duration-700"></div>
              
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Current Balance</p>
                  <h2 className="text-5xl font-bold outfit tracking-tight flex items-center gap-2">
                    <span className="text-2xl font-normal text-slate-400">Rs.</span>
                    {user.balance || 0}
                    {topUpSuccess && <CheckCircle2 className="w-5 h-5 text-green-400 ml-2" />}
                  </h2>
                </div>
                <Zap className="text-rail-blue w-6 h-6" />
              </div>

              <div className="relative z-10 mt-12 flex items-end justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-mono mb-1">UID: SR-{user.id.toString().padStart(4, '0')}-CARD</p>
                  <p className="text-sm font-medium uppercase tracking-wider">{user.username}</p>
                </div>
                <CreditCard className="w-8 h-8 opacity-50" />
              </div>
            </motion.div>

            {/* Quick Actions */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="grid grid-cols-2 gap-4"
            >
              <button 
                onClick={handleTopUp}
                disabled={isToppingUp}
                className="glass-card hover:border-rail-blue hover:shadow-md transition-all flex flex-col items-center justify-center p-6 gap-3 group text-left disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                  <CreditCard className="text-rail-blue w-5 h-5" />
                </div>
                <span className="font-semibold text-sm">{isToppingUp ? 'Processing...' : '+ Rs.500'}</span>
              </button>
              
              <button 
                onClick={() => navigate('/routes')}
                className="glass-card hover:border-rail-blue transition-colors flex flex-col items-center justify-center p-6 gap-3 group text-left"
              >
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                  <MapPin className="text-rail-blue w-5 h-5" />
                </div>
                <span className="font-semibold text-sm">View Routes</span>
              </button>
            </motion.div>

          </div>

          {/* Right Column (History & Logs) */}
          <div className="lg:col-span-7">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="glass-card h-full"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <History className="text-slate-400 w-5 h-5" />
                  <h3 className="text-lg font-bold outfit">Recent Journeys</h3>
                </div>
                <button className="text-sm font-medium text-rail-blue hover:underline flex items-center gap-1">
                  View All <ArrowRight size={14} />
                </button>
              </div>

              <div className="space-y-4">
                {isLoadingHistory ? (
                   <div className="py-12 text-center text-slate-400 animate-pulse font-bold uppercase tracking-widest text-xs">Fetching Logs...</div>
                ) : history.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">No recent journeys found.</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 rounded-sm border border-slate-100 hover:border-slate-200 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className={`w-2 h-2 mt-2 rounded-full ${item.type === 'credit' ? 'bg-green-500' : 'bg-rail-blue'}`}></div>
                        <div>
                          <p className="font-semibold text-slate-900">{item.title}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase">{item.date}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold font-mono ${item.type === 'credit' ? 'text-green-600' : 'text-slate-900'}`}>
                          {item.type === 'credit' ? '+' : '-'}Rs. {item.amount}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default Dashboard;
