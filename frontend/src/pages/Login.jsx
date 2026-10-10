import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Train, Shield, User, ArrowRight, Loader2, ArrowLeft } from 'lucide-react';
import axios from 'axios';

const Login = () => {
  const navigate = useNavigate();
  const [isFlipped, setIsFlipped] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState({ username: '', password: '' });

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    setError('');
    setIsRegistering(false);
    setCredentials({ username: '', password: '' });
  };

  const handleSubmit = async (e, role) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const endpoint = isRegistering && role === 'user' ? '/api/register' : '/api/login';
      const response = await axios.post(`http://localhost:5000${endpoint}`, {
        username: credentials.username,
        password: credentials.password,
      });

      if (response.data.success) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        if (response.data.user.role === 'admin' && role === 'admin') {
          navigate('/admin');
        } else if (response.data.user.role === 'user' && role === 'user') {
          navigate('/dashboard');
        } else {
          setError(`Account found, but lacks ${role} privileges.`);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Server connection failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-100 flex items-center justify-center p-4 antialiased overflow-hidden">
      
      {/* 3D Perspective Container */}
      <div className="relative w-full max-w-[420px] aspect-[4/5] max-h-[600px]" style={{ perspective: '1200px' }}>
        
        <motion.div
          className="w-full h-full relative"
          initial={false}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.8, type: "spring", stiffness: 60, damping: 15 }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          
          {/* FRONT FACE: Passenger Login */}
          <div 
            className="absolute inset-0 w-full h-full bg-white shadow-2xl border border-slate-200 rounded-lg flex flex-col pt-8 pb-6 px-8"
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
          >
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-6 text-rail-blue mx-auto">
                <Train className="w-8 h-8" />
                <h1 className="text-xl font-bold outfit tracking-tight text-slate-900">SmartRail</h1>
              </div>

              <div className="text-center mb-8">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] uppercase font-bold tracking-widest">
                  <User size={12} /> Passenger
                </span>
                <h2 className="text-2xl font-bold outfit mt-4 text-slate-900">
                  {isRegistering ? 'Create Account' : 'Welcome Back'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {isRegistering ? 'Register for your Smart Card.' : 'Ready for your next journey?'}
                </p>
              </div>

              {error && !isFlipped && (
                <div className="mb-4 p-2 bg-red-50 border-l-2 border-red-500 text-red-600 text-xs font-medium">{error}</div>
              )}

              <form onSubmit={(e) => handleSubmit(e, 'user')} className="space-y-4">
                <input 
                  type="text" 
                  placeholder={isRegistering ? "Choose a Username" : "Username (e.g. nirmal)"}
                  className="input-field py-2.5 text-sm"
                  required disabled={isLoading}
                  value={isFlipped ? '' : credentials.username}
                  onChange={(e) => setCredentials({...credentials, username: e.target.value})}
                />
                <input 
                  type="password" 
                  placeholder={isRegistering ? "Create Password" : "Password"}
                  className="input-field py-2.5 text-sm"
                  required disabled={isLoading}
                  onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                />
                <button type="submit" disabled={isLoading} className="w-full btn-primary py-2.5 flex justify-center items-center">
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : (isRegistering ? 'Register Now' : 'Log In')}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button 
                  type="button" 
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="text-xs text-rail-blue font-medium hover:underline"
                >
                  {isRegistering ? 'Already have an account? Log in' : "Don't have a Smart Card? Register"}
                </button>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-center">
              <button onClick={handleFlip} type="button" className="text-xs text-slate-500 hover:text-rail-blue font-medium flex items-center gap-1 transition-colors">
                Switch to Admin Login <ArrowRight size={14} />
              </button>
            </div>
          </div>


          {/* BACK FACE: Admin Login */}
          <div 
            className="absolute inset-0 w-full h-full bg-slate-900 shadow-2xl border border-slate-700 rounded-lg flex flex-col pt-8 pb-6 px-8 text-white"
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-6 text-rail-blue mx-auto">
                <Shield className="w-8 h-8" />
                <h1 className="text-xl font-bold outfit tracking-tight">System Control</h1>
              </div>

              <div className="text-center mb-8">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rail-blue/20 text-rail-blue rounded-full text-[10px] uppercase font-bold tracking-widest">
                  <Shield size={12} /> Administrator
                </span>
                <h2 className="text-2xl font-bold outfit mt-4">Authorized Access</h2>
                <p className="text-sm text-slate-400 mt-1 font-mono">Verify identity to proceed.</p>
              </div>

              {error && isFlipped && (
                <div className="mb-4 p-2 bg-red-900/50 border-l-2 border-red-500 text-red-200 text-xs font-medium">{error}</div>
              )}

              <form onSubmit={(e) => handleSubmit(e, 'admin')} className="space-y-4">
                <input 
                  type="text" 
                  placeholder="Admin ID (e.g. admin)"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-sm focus:border-rail-blue focus:ring-1 focus:ring-rail-blue/20 text-sm text-white placeholder:text-slate-500"
                  required disabled={isLoading}
                  value={isFlipped ? credentials.username : ''}
                  onChange={(e) => setCredentials({...credentials, username: e.target.value})}
                />
                <input 
                  type="password" 
                  placeholder="Passcode"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-sm focus:border-rail-blue focus:ring-1 focus:ring-rail-blue/20 text-sm text-white placeholder:text-slate-500"
                  required disabled={isLoading}
                  onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                />
                <button type="submit" disabled={isLoading} className="w-full bg-slate-100 text-slate-900 font-bold hover:bg-white py-2.5 rounded-sm flex justify-center items-center transition-colors">
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Authenticate'}
                </button>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-center">
              <button onClick={handleFlip} type="button" className="text-xs text-slate-400 hover:text-white font-medium flex items-center gap-1 transition-colors">
                <ArrowLeft size={14} /> Back to Passenger Login
              </button>
            </div>
          </div>

        </motion.div>
      </div>

    </div>
  );
};

export default Login;
