import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, TrainTrack, Clock, Activity, ArrowLeft, ArrowRight, MapPin } from 'lucide-react';

// Realistic Sri Lanka Railway Data from Official Timetables
const initialTrains = [
  { id: '1015', name: 'Udarata Menike', line: 'Main Line', from: 'Colombo Fort', to: 'Badulla', depTime: '08:30 AM', arrTime: '07:17 PM', status: 'On Time', delay: 0, progress: 45 },
  { id: '1005', name: 'Podi Menike', line: 'Main Line', from: 'Colombo Fort', to: 'Badulla', depTime: '05:55 AM', arrTime: '04:06 PM', status: 'Arriving', delay: 10, progress: 95 },
  { id: '8058', name: 'Ruhunu Kumari', line: 'Coast Line', from: 'Maradana', to: 'Matara', depTime: '03:40 PM', arrTime: '07:05 PM', status: 'Delayed', delay: 15, progress: 60 },
  { id: '8056', name: 'Galu Kumari', line: 'Coast Line', from: 'Maradana', to: 'Beliatta', depTime: '02:00 PM', arrTime: '06:05 PM', status: 'On Time', delay: 0, progress: 30 },
  { id: '4089', name: 'Yal Devi', line: 'Northern Line', from: 'Mount Lavinia', to: 'KKS (Jaffna)', depTime: '05:10 AM', arrTime: '01:30 PM', status: 'Departed', delay: 0, progress: 15 },
  { id: '4017', name: 'Uttara Devi', line: 'Northern Line', from: 'Colombo Fort', to: 'KKS (Jaffna)', depTime: '11:50 AM', arrTime: '07:00 PM', status: 'On Time', delay: 0, progress: 80 },
  { id: '9150', name: 'KV Commuter', line: 'Kelani Valley Line', from: 'Maradana', to: 'Avissawella', depTime: '04:30 PM', arrTime: '06:45 PM', status: 'On Time', delay: 0, progress: 10 },
  { id: '6011', name: 'Udaya Devi', line: 'Batticaloa Line', from: 'Colombo Fort', to: 'Batticaloa', depTime: '06:05 AM', arrTime: '02:45 PM', status: 'Delayed', delay: 20, progress: 55 },
  { id: '7022', name: 'Night Mail', line: 'Trincomalee Line', from: 'Colombo Fort', to: 'Trincomalee', depTime: '07:00 PM', arrTime: '05:30 AM', status: 'On Time', delay: 0, progress: 5 },
  { id: '5045', name: 'Puttalam Office', line: 'Puttalam Line', from: 'Colombo Fort', to: 'Puttalam', depTime: '05:15 PM', arrTime: '08:45 PM', status: 'On Time', delay: 0, progress: 0 },
];

const Routes = () => {
  const navigate = useNavigate();
  const [trains, setTrains] = useState(initialTrains);
  const [filter, setFilter] = useState('All');

  // Real-time Simulation Engine
  useEffect(() => {
    const interval = setInterval(() => {
      setTrains(prevTrains => prevTrains.map(train => {
        let newProgress = train.progress + (Math.random() * 2);
        let newStatus = train.status;
        let newDelay = train.delay;
        
        if (newProgress >= 100) {
          newProgress = 100;
          newStatus = 'Arrived';
        } else if (newProgress > 90) {
          newStatus = 'Arriving';
        } else {
          if (Math.random() > 0.9 && newStatus === 'On Time') {
            newStatus = 'Delayed';
            newDelay = Math.floor(Math.random() * 20) + 5;
          }
        }

        return { ...train, progress: newProgress, status: newStatus, delay: newDelay };
      }));
    }, 5000); 

    return () => clearInterval(interval);
  }, []);

  const lines = [
    'All', 
    'Main Line', 
    'Coast Line', 
    'Northern Line', 
    'Kelani Valley Line', 
    'Puttalam Line', 
    'Batticaloa Line', 
    'Trincomalee Line', 
    'Matale Line', 
    'Talaimannar Line'
  ];
  const filteredTrains = filter === 'All' ? trains : trains.filter(t => t.line === filter);

  return (
    <div className="min-h-screen bg-slate-50 relative pb-20">
      
      {/* Top Nav */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-50 shadow-sm flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="font-outfit font-bold text-lg tracking-tight text-slate-900">Live Network Status</h1>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Sri Lanka Railways Timetable
          </p>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-4 md:p-8 mt-4">
        
        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
          {lines.map(line => (
            <button
              key={line}
              onClick={() => setFilter(line)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filter === line ? 'bg-rail-blue text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              {line}
            </button>
          ))}
        </div>

        {/* Live Tracking Cards */}
        <div className="space-y-6 mt-6">
          <AnimatePresence>
            {filteredTrains.map(train => (
              <motion.div 
                key={train.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white border border-slate-200 rounded-sm p-6 shadow-sm relative overflow-hidden"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider rounded-sm">
                        {train.line}
                      </span>
                      <span className="text-xs font-mono text-slate-400">No. {train.id}</span>
                    </div>
                    <h2 className="text-xl font-bold outfit text-slate-900">{train.name}</h2>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden md:block">
                      <p className="text-sm font-bold text-slate-900">{train.from}</p>
                      <p className="text-xs text-slate-500">{train.depTime}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 hidden md:block" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">{train.to}</p>
                      <p className="text-xs text-slate-500">{train.arrTime}</p>
                    </div>
                    
                    <div className="w-px h-10 bg-slate-200 mx-4 hidden md:block"></div>
                    
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-sm text-[10px] uppercase font-bold tracking-wider ${
                        train.status === 'On Time' || train.status === 'Departed' ? 'bg-green-50 text-green-700' :
                        train.status === 'Delayed' ? 'bg-orange-50 text-orange-700' :
                        train.status === 'Arriving' ? 'bg-blue-50 text-blue-700' : 
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {train.status === 'Delayed' ? `Delayed (${train.delay}m)` : train.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress Track */}
                <div className="relative mt-8">
                  <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      className={`h-full ${train.status === 'Delayed' ? 'bg-orange-400' : 'bg-rail-blue'}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${train.progress}%` }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                    />
                  </div>
                  
                  {/* Train Icon moving on track */}
                  <motion.div 
                    className="absolute top-1/2 -mt-3.5 shadow-md flex items-center justify-center w-7 h-7 bg-white border-2 border-slate-900 rounded-full z-10"
                    animate={{ left: `calc(${train.progress}% - 14px)` }}
                    transition={{ duration: 1.5, ease: 'easeOut' }}
                  >
                    <Activity className={`w-3 h-3 ${train.status === 'Delayed' ? 'text-orange-500' : 'text-slate-900'}`} />
                  </motion.div>

                  {/* Stations */}
                  <div className="absolute top-[-4px] left-0 w-2 h-2 rounded-full bg-slate-300"></div>
                  <div className="absolute top-[-4px] right-0 w-2 h-2 rounded-full bg-slate-300"></div>
                </div>

              </motion.div>
            ))}
          </AnimatePresence>
        </div>

      </main>
    </div>
  );
};

export default Routes;
