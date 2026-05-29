import React, { useState, useEffect } from 'react';
import { 
  Home, 
  ShoppingBag, 
  LineChart as LineChartIcon, 
  MessageSquare, 
  User, 
  Leaf, 
  Droplets, 
  Thermometer, 
  FlaskConical,
  Sprout,
  Truck,
  Warehouse,
  Plus,
  ArrowRight,
  ShieldCheck,
  Languages,
  TrendingUp,
  TrendingDown,
  Minus,
  CloudRain,
  MapPin,
  Cpu,
  Settings,
  HelpCircle,
  LogOut,
  Wifi,
  Terminal,
  Activity,
  RefreshCw,
  AlertTriangle,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User as FirebaseUser } from 'firebase/auth';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc, where, orderBy, limit } from 'firebase/firestore';
import { getCropAdvice, getMarketForecast } from './services/gemini';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { ResponsiveContainer, LineChart, Line, YAxis } from 'recharts';
import { SensorSlider } from './components/SensorSlider';
import { translations, languageNames } from './lib/translations';
import type { SupportedLanguage } from './lib/translations';

// --- Sub-components ---

const SensorCard = ({ icon: Icon, label, value, unit, color, historyData, status }: any) => {
  const isPositiveTrend = historyData && historyData.length > 1 && historyData[0].val > historyData[historyData.length - 1].val;
  const isNegativeTrend = historyData && historyData.length > 1 && historyData[0].val < historyData[historyData.length - 1].val;

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'Good': return 'text-emerald-500 bg-emerald-50 border-emerald-100';
      case 'Optimal': return 'text-blue-500 bg-blue-50 border-blue-100';
      case 'Alert': return 'text-amber-500 bg-amber-50 border-amber-100';
      case 'Critical': return 'text-rose-500 bg-rose-50 border-rose-100';
      default: return 'text-slate-400 bg-slate-50 border-slate-100';
    }
  };

  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 relative overflow-hidden"
    >
      <div className="flex justify-between items-start">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shadow-sm`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${getStatusColor(status)}`}>
          {status}
        </div>
      </div>
      
      <div>
        <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{label}</span>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-slate-900">{Math.round(value)}</span>
          <span className="text-slate-400 text-xs font-medium">{unit}</span>
        </div>
      </div>

      {/* Sparkline */}
      <div className="h-12 w-full mt-1">
        {historyData && historyData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historyData}>
              <YAxis hide domain={['auto', 'auto']} />
              <Line 
                type="monotone" 
                dataKey="val" 
                stroke={color.replace('bg-', '') === 'blue-500' ? '#3b82f6' : color.replace('bg-', '') === 'purple-500' ? '#a855f7' : '#f43f5e'} 
                strokeWidth={2} 
                dot={false} 
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full flex items-center justify-center border-t border-slate-50 bg-slate-50/50 rounded-lg">
            <span className="text-[10px] text-slate-400">Initializing...</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 mt-auto">
        {isPositiveTrend ? (
          <TrendingUp className="w-3 h-3 text-emerald-500" />
        ) : isNegativeTrend ? (
          <TrendingDown className="w-3 h-3 text-rose-500" />
        ) : (
          <Minus className="w-3 h-3 text-slate-300" />
        )}
        <span className="text-[10px] text-slate-400 font-medium">Trend</span>
      </div>
    </motion.div>
  );
};

const SectionTitle = ({ children, action }: any) => (
  <div className="flex justify-between items-center mb-4 px-1">
    <h2 className="text-xl font-heading font-bold text-slate-900">{children}</h2>
    {action && (
      <button className="text-sm font-semibold text-emerald-600 flex items-center gap-1">
        {action} <ArrowRight className="w-4 h-4" />
      </button>
    )}
  </div>
);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice (Offline/Pending): ', JSON.stringify(errInfo));
  // Suppress throw on snapshot connection logs to guarantee flawless offline PWA capability
}

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('krushi_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback
      }
    }
    return {
      uid: 'offline_farmer_123',
      displayName: 'Premium Farmer',
      email: 'farmer@krushiconnect.org',
      photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150',
      emailVerified: true,
      isAnonymous: false,
      providerData: [{ providerId: 'google.com', email: 'farmer@krushiconnect.org' }]
    };
  });
  const [role, setRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('home');
  const [language, setLanguage] = useState<SupportedLanguage>(() => (localStorage.getItem('language') as SupportedLanguage) || 'en');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const t = translations[language];
  const [isConnected, setIsConnected] = useState(false);

  const getSoilDetails = (id: 'A' | 'B' | 'C') => {
    switch (id) {
      case 'A':
        return {
          emoji: '🌿',
          name: language === 'hi' ? 'गीली मिट्टी (कम गीली)' : language === 'mr' ? 'कमी ओली माती' : language === 'te' ? 'కొద్దిగా తడి నేల' : language === 'gu' ? 'ઓછી લીલી માટી' : 'Little Wet Soil',
          desc: language === 'hi' ? 'अनुकूल आर्द्र परिवेश (38%)' : language === 'mr' ? 'चांगले तापमान व ओलावा' : language === 'te' ? 'సరైన తేమ' : 'Moist & aerated (38%)',
          color: 'text-emerald-700 bg-emerald-50/50 border-emerald-100',
          indicator: 'bg-emerald-500'
        };
      case 'B':
        return {
          emoji: '🏜️',
          name: language === 'hi' ? 'सूखी मिट्टी' : language === 'mr' ? 'सुकी माती' : language === 'te' ? 'పొడి నేల' : language === 'gu' ? 'સૂકી માટી' : 'Dry Soil',
          desc: language === 'hi' ? 'निर्जलित शुष्क अवस्था (12%)' : language === 'mr' ? 'कमी ओलावा' : language === 'te' ? 'ఎండిపోయిన నేల' : 'Dry, needs water (12%)',
          color: 'text-amber-700 bg-amber-50/50 border-amber-100',
          indicator: 'bg-amber-500 animate-pulse'
        };
      case 'C':
        return {
          emoji: '🌊',
          name: language === 'hi' ? 'जलमग्न / बाढ़ मिट्टी' : language === 'mr' ? 'पाण्याने भरलेली माती' : language === 'te' ? 'వరదలు పారిన నేల' : language === 'gu' ? 'પૂરગ્રસ્ત માટી' : 'Flooded Soil',
          desc: language === 'hi' ? 'अत्यधिक जलभराव (95%)' : language === 'mr' ? 'अतिद्रव धोकादायक' : language === 'te' ? 'అధిక నీరు' : 'Waterlogged flood (95%)',
          color: 'text-blue-700 bg-blue-50/50 border-blue-100',
          indicator: 'bg-blue-500 animate-bounce'
        };
    }
  };
  
  // Raspberry Pi 4 WiFi Link states
  const [piIpAddress, setPiIpAddress] = useState(() => localStorage.getItem('pi_ip_address') || '192.168.1.50');
  const [piPort, setPiPort] = useState(() => localStorage.getItem('pi_port') || '5000');
  const [piEndpoint, setPiEndpoint] = useState(() => localStorage.getItem('pi_endpoint') || '/api/sensor');
  const [isConnectingPi, setIsConnectingPi] = useState(false);
  const [piConnectionError, setPiConnectionError] = useState<string | null>(null);
  const [isPiMocked, setIsPiMocked] = useState(() => {
    const saved = localStorage.getItem('pi_is_mocked');
    return saved === null ? true : saved === 'true';
  });
  const [showPiConnectModal, setShowPiConnectModal] = useState(false);
  const [piConnectionStatus, setPiConnectionStatus] = useState<'idle' | 'scanning' | 'connected' | 'failed'>(() => {
    return localStorage.getItem('pi_connection_status') as 'idle' | 'scanning' | 'connected' | 'failed' || 'idle';
  });

  const [location, setLocation] = useState<{city: string, lat: number, lon: number} | null>(null);
  const [weather, setWeather] = useState<{temp: number, condition: string, icon: string} | null>(null);
  const [isSelectingRole, setIsSelectingRole] = useState(false);
  const [showHardwareGuide, setShowHardwareGuide] = useState(false);
  const [showApkModal, setShowApkModal] = useState(false);
  const [showMarketplaceListing, setShowMarketplaceListing] = useState(false);
  const [activeNode, setActiveNode] = useState<'A' | 'B' | 'C'>('A');
  const [logisticsDetail, setLogisticsDetail] = useState<'transport' | 'storage' | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [nodes, setNodes] = useState<Record<'A' | 'B' | 'C', {
    moisture: number;
    temperature: number;
    ph: number;
    n: number;
    p: number;
    k: number;
    humidity: number;
    tds: number;
    crop: string;
    suggestions: string[];
  }>>({
    A: { moisture: 38, temperature: 25, ph: 6.5, n: 60, p: 45, k: 55, humidity: 60, tds: 800, crop: "Vegetables / Premium Tomatoes", suggestions: ["Optimal moist condition", "Ideal root absorption under damp environment"] },
    B: { moisture: 12, temperature: 31, ph: 7.2, n: 25, p: 20, k: 25, humidity: 35, tds: 300, crop: "Groundnuts & Pulses", suggestions: ["Moisture critical: Soil is too dry", "Requires localized drip irrigation"] },
    C: { moisture: 95, temperature: 21, ph: 5.8, n: 45, p: 35, k: 30, humidity: 95, tds: 1200, crop: "Rice (Paddy) / Water Hydrant sugarcane", suggestions: ["Extreme flood warning: Waterlogged soil", "Aerate soil or irrigate drainage to avert root rot"] }
  });

  const sensorState = nodes[activeNode];

  const updateSensorValue = (key: string, val: number) => {
    setNodes(prev => ({
      ...prev,
      [activeNode]: { ...prev[activeNode], [key]: val }
    }));
  };
  
  const [advice, setAdvice] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [mandiPrices, setMandiPrices] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [marketForecast, setMarketForecast] = useState<string | null>(null);
  const [loadingForecast, setLoadingForecast] = useState(false);

  // States for PWA Mobile App Download Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the app
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If the app is already installed (standalone mode), don't show the banner
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallBanner(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    // We've used the prompt, and can't use it again
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  // States for low NPK alert system (< 30% for 10s)
  const [npkLowSince, setNpkLowSince] = useState<number | null>(null);
  const [highPriorityAlert, setHighPriorityAlert] = useState<{
    message: string;
    details: string;
    elapsed: number;
    active: boolean;
    dismissed: boolean;
  } | null>(null);

  // Geolocation & Weather
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Fallback to simple weather mock or use a public no-key API if possible
          // Open-meteo doesn't require a key
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
          const data = await res.json();
          setWeather({
            temp: data.current_weather.temperature,
            condition: "Clear Sky", // Hardcoded for simplicity as open-meteo uses codes
            icon: "Sun"
          });
          setLocation({ city: "Current Location", lat: latitude, lon: longitude });
        } catch (e) {
          console.error("Weather fetch failed", e);
        }
      });
    }
  }, []);

  // Auth & Role initialization
  useEffect(() => {
    const initAuthAndRole = async () => {
      const savedUser = localStorage.getItem('krushi_user');
      const savedRole = localStorage.getItem('krushi_role');
      
      let currentUser = user;
      if (savedUser) {
        try {
          currentUser = JSON.parse(savedUser);
          setUser(currentUser);
        } catch (e) {
          console.error("Failed to parse saved user", e);
        }
      } else {
        localStorage.setItem('krushi_user', JSON.stringify(currentUser));
      }

      if (savedRole) {
        setRole(savedRole);
      } else if (currentUser) {
        // Soft-fetch role from Firestore if available
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const snap = await getDoc(userRef);
          if (snap.exists() && snap.data().role) {
            const fetchedRole = snap.data().role;
            setRole(fetchedRole);
            localStorage.setItem('krushi_role', fetchedRole);
          } else {
            setIsSelectingRole(true);
          }
        } catch (e) {
          console.warn("Firestore role fetch omitted/failed - defaulting to role builder selection", e);
          setIsSelectingRole(true);
        }
      } else {
        setIsSelectingRole(true);
      }
    };

    initAuthAndRole();
  }, []);

  const handleRoleSelection = async (selectedRole: string) => {
    if (!user) return;
    localStorage.setItem('krushi_role', selectedRole);
    setRole(selectedRole);
    setIsSelectingRole(false);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        role: selectedRole,
        createdAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn("Firestore user profile merge bypassed cleanly.", e);
    }
  };

  // Fetch Mandi Prices from our proxy
  useEffect(() => {
    fetch('/api/mandi-prices')
      .then(res => res.json())
      .then(data => setMandiPrices(data));
    
    // Fetch Market Forecast
    setLoadingForecast(true);
    getMarketForecast().then(data => {
      setMarketForecast(data);
      setLoadingForecast(false);
    });
  }, []);

  // Fetch Marketplace Products (Public)
  useEffect(() => {
    const q = query(collection(db, 'products'));
    return onSnapshot(q, (snapshot) => {
      const p = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(p);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });
  }, []);

  // Fetch History
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'sensorData'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      const h = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(h);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'sensorData');
    });
  }, [user]);

  // Fetch Bookings
  useEffect(() => {
    if (!user || !role) return;
    
    let q;
    if (role === 'farmer') {
      q = query(
        collection(db, 'bookings'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
    } else if (role === 'transporter' || role === 'storage') {
      q = query(
        collection(db, 'bookings'),
        where('type', '==', role === 'transporter' ? 'transport' : 'storage'),
        orderBy('createdAt', 'desc')
      );
    } else {
      return;
    }

    return onSnapshot(q, (snapshot) => {
      const b = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBookings(b);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'bookings');
    });
  }, [user, role]);

  // Fetch Marketplace Listings (Authenticated)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'listings'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    return onSnapshot(q, (snapshot) => {
      const l = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setListings(l);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'listings');
    });
  }, [user]);

  // Connect, Disconnect and Polling helper methods for Raspberry Pi 4
  const connectRaspberryPi = async (ip: string, port: string, endpoint: string, simulated: boolean) => {
    setIsConnectingPi(true);
    setPiConnectionError(null);
    setPiConnectionStatus('scanning');

    // Store in localStorage for persistence
    localStorage.setItem('pi_ip_address', ip);
    localStorage.setItem('pi_port', port);
    localStorage.setItem('pi_endpoint', endpoint);
    localStorage.setItem('pi_is_mocked', String(simulated));
    
    setPiIpAddress(ip);
    setPiPort(port);
    setPiEndpoint(endpoint);
    setIsPiMocked(simulated);

    if (simulated) {
      setTimeout(() => {
        setIsConnectingPi(false);
        setIsConnected(true);
        setPiConnectionStatus('connected');
        localStorage.setItem('pi_connection_status', 'connected');
        setShowPiConnectModal(false);
      }, 1500);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    
    try {
      const urlStr = ip.startsWith('http') ? ip : `http://${ip}`;
      const cleanUrl = `${urlStr}:${port}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
      
      const res = await fetch(cleanUrl, { 
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors'
      });
      
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setNodes(prev => ({
            ...prev,
            [activeNode]: {
              moisture: typeof data.moisture === 'number' ? data.moisture : prev[activeNode].moisture,
              temperature: typeof data.temperature === 'number' ? data.temperature : prev[activeNode].temperature,
              ph: typeof data.ph === 'number' ? data.ph : prev[activeNode].ph,
              n: typeof data.n === 'number' ? data.n : prev[activeNode].n,
              p: typeof data.p === 'number' ? data.p : prev[activeNode].p,
              k: typeof data.k === 'number' ? data.k : prev[activeNode].k,
              humidity: typeof data.humidity === 'number' ? data.humidity : (prev[activeNode].humidity || 50),
              tds: typeof data.tds === 'number' ? data.tds : (prev[activeNode].tds || 400),
              crop: typeof data.crop === 'string' ? data.crop : (prev[activeNode].crop || "Vegetables / Mixed Crop"),
              suggestions: Array.isArray(data.suggestions) ? data.suggestions : (prev[activeNode].suggestions || []),
            }
          }));
        }
        setIsConnectingPi(false);
        setIsConnected(true);
        setPiConnectionStatus('connected');
        localStorage.setItem('pi_connection_status', 'connected');
        setShowPiConnectModal(false);
      } else {
        throw new Error(`Device returned HTTP status ${res.status}`);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      setIsConnectingPi(false);
      setPiConnectionStatus('failed');
      localStorage.setItem('pi_connection_status', 'failed');
      
      let errorMsg = `Unable to reach your Raspberry Pi at http://${ip}:${port}${endpoint}.`;
      
      if (window.location.protocol === 'https:') {
        errorMsg += `\n\n🛡️ HTTPS Mixed Content Security: Because this client app is loaded over secure HTTPS, browsers automatically block standard HTTP calls to local IP addresses. To pair successfully:\n1. Enable the "Fallback to Simulated Link" checkbox below to preview the live graphs immediately, OR\n2. Configure your browser to "Allow insecure content" under Site Settings for this address, OR\n3. Run your Flask service on the Raspberry Pi with a self-signed SSL certificate so it answers to HTTPS.`;
      } else {
        errorMsg += `\n\nEnsure both devices are on the exact same WiFi network, your copy-paste Python Flask service is running, and the IP matches.`;
      }
      
      setPiConnectionError(errorMsg);
    }
  };

  const disconnectRaspberryPi = () => {
    setIsConnected(false);
    setPiConnectionStatus('idle');
    localStorage.setItem('pi_connection_status', 'idle');
  };

  // Poll Real Raspberry Pi readings / Simulate if mocked
  useEffect(() => {
    if (!isConnected) return;

    let interval: any;

    if (isPiMocked) {
      interval = setInterval(() => {
        setNodes(prev => {
          const current = prev[activeNode];
          
          // 1. Stabilized simulation using a slow drift / random walk from current state
          const clamp = (val: number, min = 0, max = 100) => Math.max(min, Math.min(max, val));
          
          const prev_ph = current.ph || 6.5;
          let ph_value = prev_ph + (Math.random() - 0.5) * 0.08;
          ph_value = parseFloat(Math.max(5.0, Math.min(8.5, ph_value)).toFixed(2));

          const prev_tds = current.tds || 800;
          let tds_ppm = prev_tds + (Math.random() - 0.5) * 40;
          tds_ppm = Math.round(Math.max(200, Math.min(1800, tds_ppm)));

          const prev_moist = current.moisture || 42;
          let moisture_percent = prev_moist + (Math.random() - 0.5) * 1.5;
          moisture_percent = parseFloat(clamp(moisture_percent, 5, 95).toFixed(1));

          const prev_temp = current.temperature || 26.0;
          let temperature = prev_temp + (Math.random() - 0.5) * 0.4;
          temperature = parseFloat(Math.max(15, Math.min(38, temperature)).toFixed(1));

          const prev_hum = current.humidity || 50.0;
          let humidity = prev_hum + (Math.random() - 0.5) * 1.0;
          humidity = parseFloat(Math.max(20, Math.min(95, humidity)).toFixed(1));

          // Estimate NPK % based on User formulas
          let nitrogen = (tds_ppm / 1500) * 100;
          if (moisture_percent < 20) nitrogen *= 0.7;
          if (ph_value < 5.5 || ph_value > 8) nitrogen *= 0.8;

          let phosphorus = (tds_ppm / 1800) * 100;
          if (ph_value >= 6 && ph_value <= 7.5) {
            phosphorus *= 1.1;
          } else {
            phosphorus *= 0.8;
          }

          let potassium = (tds_ppm / 1300) * 100;
          if (moisture_percent > 40) potassium *= 1.1;

          const n_val = Math.round(clamp(nitrogen));
          const p_val = Math.round(clamp(phosphorus));
          const k_val = Math.round(clamp(potassium));

          const recommendCropSim = (ph: number, m: number, t: number) => {
            if (ph >= 5.5 && ph <= 7 && m > 45) return "Rice";
            if (ph >= 6 && ph <= 7.5 && m < 50) return "Wheat";
            if (ph >= 5.5 && ph <= 7 && t >= 20 && t <= 35) return "Tomato";
            if (ph > 7) return "Cotton";
            return "Vegetables / Mixed Crop";
          };

          const suggestionsList: string[] = [];
          if (n_val < 40) suggestionsList.push("Add nitrogen fertilizer");
          if (p_val < 40) suggestionsList.push("Add phosphorus fertilizer");
          if (k_val < 40) suggestionsList.push("Add potash");
          if (ph_value < 5.5) suggestionsList.push("Soil is acidic");
          else if (ph_value > 8) suggestionsList.push("Soil is alkaline");

          return {
            ...prev,
            [activeNode]: {
              ...current,
              moisture: parseFloat(moisture_percent.toFixed(1)),
              temperature: parseFloat(temperature.toFixed(1)),
              ph: parseFloat(ph_value.toFixed(2)),
              n: n_val,
              p: p_val,
              k: k_val,
              humidity: parseFloat(humidity.toFixed(1)),
              tds: Math.round(tds_ppm),
              crop: recommendCropSim(ph_value, moisture_percent, temperature),
              suggestions: suggestionsList
            }
          };
        });
      }, 3000);
    } else {
      const fetchPiData = async () => {
        const controller = new AbortController();
        const tId = setTimeout(() => controller.abort(), 2500);
        try {
          const urlStr = piIpAddress.startsWith('http') ? piIpAddress : `http://${piIpAddress}`;
          const cleanUrl = `${urlStr}:${piPort}${piEndpoint.startsWith('/') ? piEndpoint : '/' + piEndpoint}`;
          
          const res = await fetch(cleanUrl, { signal: controller.signal });
          clearTimeout(tId);
          if (res.ok) {
            const data = await res.json();
            if (data) {
              setNodes(prev => ({
                ...prev,
                [activeNode]: {
                  moisture: typeof data.moisture === 'number' ? data.moisture : prev[activeNode].moisture,
                  temperature: typeof data.temperature === 'number' ? data.temperature : prev[activeNode].temperature,
                  ph: typeof data.ph === 'number' ? data.ph : prev[activeNode].ph,
                  n: typeof data.n === 'number' ? data.n : prev[activeNode].n,
                  p: typeof data.p === 'number' ? data.p : prev[activeNode].p,
                  k: typeof data.k === 'number' ? data.k : prev[activeNode].k,
                  humidity: typeof data.humidity === 'number' ? data.humidity : (prev[activeNode].humidity || 50),
                  tds: typeof data.tds === 'number' ? data.tds : (prev[activeNode].tds || 400),
                  crop: typeof data.crop === 'string' ? data.crop : (prev[activeNode].crop || "Vegetables / Mixed Crop"),
                  suggestions: Array.isArray(data.suggestions) ? data.suggestions : (prev[activeNode].suggestions || []),
                }
              }));
              setPiConnectionStatus('connected');
            }
          }
        } catch (e) {
          clearTimeout(tId);
          console.warn("Background polling of Raspberry Pi failed:", e);
        }
      };

      fetchPiData();
      interval = setInterval(fetchPiData, 5000);
    }

    return () => clearInterval(interval);
  }, [isConnected, isPiMocked, activeNode, piIpAddress, piPort, piEndpoint]);

  // Check if N, P, or K is below threshold (30%)
  useEffect(() => {
    // We only trigger this monitoring if Pi is actively connected and returning data
    if (!isConnected) {
      setNpkLowSince(null);
      setHighPriorityAlert(null);
      return;
    }

    const n = sensorState?.n ?? 100;
    const p = sensorState?.p ?? 100;
    const k = sensorState?.k ?? 100;

    const isBelowThreshold = n < 30 || p < 30 || k < 30;

    if (isBelowThreshold) {
      if (!npkLowSince) {
        setNpkLowSince(Date.now());
      }
    } else {
      setNpkLowSince(null);
      setHighPriorityAlert(null);
    }
  }, [sensorState?.n, sensorState?.p, sensorState?.k, isConnected, npkLowSince]);

  // Alert countdown trigger (checks elapsed time)
  useEffect(() => {
    if (!npkLowSince) {
      // If of fine state, reset dismissed condition too
      return;
    }

    const interval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - npkLowSince) / 1000);
      const n = sensorState?.n ?? 100;
      const p = sensorState?.p ?? 100;
      const k = sensorState?.k ?? 100;

      if (elapsedSeconds >= 10) {
        const triggers: string[] = [];
        if (n < 30) triggers.push(`Nitrogen (${n}%)`);
        if (p < 30) triggers.push(`Phosphorus (${p}%)`);
        if (k < 30) triggers.push(`Potassium (${k}%)`);

        // Check if there is already an active alert. If dismissed, don't re-show immediately unless values change or time increases
        setHighPriorityAlert(prev => {
          if (prev && prev.dismissed) {
            return {
              ...prev,
              elapsed: elapsedSeconds, // keep updating elapsed in background
            };
          }
          return {
            message: `⚠️ CRITICAL: Nutrient Deficit Detected!`,
            details: `Sensor on active Node ${activeNode} has registered deficient levels: ${triggers.join(', ')} falling below 30% threshold for over ${elapsedSeconds} seconds. Immediate fertilizer injection or soil treatment is recommended to prevent crop stunt.`,
            elapsed: elapsedSeconds,
            active: true,
            dismissed: false
          };
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [npkLowSince, sensorState?.n, sensorState?.p, sensorState?.k, activeNode]);

  const handleLogin = async () => {
    const mockUser = {
      uid: 'offline_farmer_123',
      displayName: 'Premium Farmer',
      email: 'farmer@krushiconnect.org',
      photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150',
      emailVerified: true,
      isAnonymous: false,
      providerData: [{ providerId: 'google.com', email: 'farmer@krushiconnect.org' }]
    };
    localStorage.setItem('krushi_user', JSON.stringify(mockUser));
    setUser(mockUser);
  };

  const fetchAdvice = async () => {
    if (!isConnected) return;
    setLoadingAdvice(true);
    const result = await getCropAdvice(sensorState, "Wheat");
    
    // Save to Firestore with NODE ID
    try {
      await addDoc(collection(db, 'sensorData'), {
        userId: user!.uid,
        nodeId: activeNode,
        moisture: sensorState.moisture,
        temperature: sensorState.temperature,
        ph: sensorState.ph,
        n: sensorState.n,
        p: sensorState.p,
        k: sensorState.k,
        advice: result,
        location: location ? {
          lat: location.lat,
          lon: location.lon,
          city: location.city
        } : null,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Error saving record:", e);
      handleFirestoreError(e, OperationType.CREATE, 'sensorData');
    }

    setAdvice(result);
    setLoadingAdvice(false);
    setActiveTab('advisor');
  };

  const handleBooking = async (type: 'transport' | 'storage', details: string, price: string) => {
    if (!user) return;
    setIsBooking(true);
    try {
      await addDoc(collection(db, 'bookings'), {
        userId: user.uid,
        userName: user.displayName,
        type,
        details,
        price,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setBookingSuccess(true);
      setTimeout(() => {
        setBookingSuccess(false);
        setLogisticsDetail(null);
      }, 2000);
    } catch (e) {
      console.error("Booking failed", e);
      handleFirestoreError(e, OperationType.CREATE, 'bookings');
    } finally {
      setIsBooking(false);
    }
  };

  const updateBookingStatus = async (bookingId: string, newStatus: string) => {
    try {
      await setDoc(doc(db, 'bookings', bookingId), {
        status: newStatus
      }, { merge: true });
    } catch (e) {
      console.error("Status update failed", e);
      handleFirestoreError(e, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  const handleListCrop = async (listingData: any) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'listings'), {
        ...listingData,
        userId: user.uid,
        userName: user.displayName,
        userPhoto: user.photoURL,
        status: 'available',
        createdAt: serverTimestamp()
      });
      setShowMarketplaceListing(false);
    } catch (e) {
      console.error("Listing failed", e);
      handleFirestoreError(e, OperationType.CREATE, 'listings');
    }
  };

  const getRecentTrend = (key: string) => {
    return history.slice(0, 10).map(h => ({ val: h[key] })).reverse();
  };

  const getStatus = (key: string, val: number) => {
    if (key === 'moisture') {
      if (val < 20) return 'Critical';
      if (val < 35) return 'Alert';
      if (val < 65) return 'Optimal';
      return 'Alert'; // Too wet
    }
    if (key === 'ph') {
      if (val >= 6.0 && val <= 7.0) return 'Good';
      if (val >= 5.5 && val <= 7.5) return 'Alert';
      return 'Critical';
    }
    // Generic for NPK
    if (val > 100) return 'Optimal';
    if (val > 50) return 'Good';
    return 'Alert';
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-900 overflow-x-hidden relative">
        {/* Floating Language Switcher for Landing Screen */}
        <div className="absolute top-4 right-4 z-50">
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/80 shadow-md transition-all font-black text-[10px] text-slate-700 uppercase"
            >
              <Languages className="w-4 h-4 text-emerald-600 animate-spin-slow" />
              <span>{languageNames[language].native}</span>
            </button>
            <AnimatePresence>
              {showLangMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-36 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 py-1 overflow-hidden"
                  >
                    {(Object.keys(languageNames) as SupportedLanguage[]).map(langKey => (
                      <button
                        key={langKey}
                        onClick={() => {
                          setLanguage(langKey);
                          setShowLangMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-[11px] font-bold transition-colors hover:bg-slate-50 flex items-center justify-between ${
                          language === langKey ? 'text-emerald-600 bg-emerald-50' : 'text-slate-700'
                        }`}
                      >
                        <span>{languageNames[langKey].native}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">{langKey}</span>
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Hero Section */}
        <div className="relative h-[60vh] flex flex-col justify-end p-6 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img 
              src="https://images.unsplash.com/photo-1500382017468-9049fee74a62?auto=format&fit=crop&q=80&w=2000" 
              className="w-full h-full object-cover"
              alt="Farm landscape"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/40 to-transparent" />
          </div>
          
          <motion.div 
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative z-10 space-y-2"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-600/30">
                <Sprout className="w-5 h-5 text-white" />
              </div>
              <span className="font-heading font-bold text-emerald-800 tracking-tight">{t.appName}</span>
            </div>
            <h1 className="text-4xl font-heading font-black text-slate-900 leading-[0.95] tracking-tighter uppercase">
              {t.smartFarming}<br />
              <span className="text-emerald-600">{t.pureProgress}</span>
            </h1>
            <p className="text-slate-600 text-sm font-medium max-w-[280px] leading-relaxed">
              {t.empowermentDesc}
            </p>
          </motion.div>
        </div>

        {/* Benefits Section */}
        <div className="px-6 py-10 space-y-10 bg-white relative z-10">
          <div className="grid grid-cols-2 gap-4">
            <FeatureCard 
              icon={Leaf} 
              title={t.aiAdvisor} 
              desc={t.expertAdviceYourLang} 
              color="bg-emerald-50 text-emerald-600"
            />
            <FeatureCard 
              icon={ShoppingBag} 
              title={t.directSell} 
              desc={t.sellCropsNoMiddlemen} 
              color="bg-orange-50 text-orange-600"
            />
            <FeatureCard 
              icon={LineChartIcon} 
              title={t.liveMandi} 
              desc={t.trackPricesInIndia} 
              color="bg-blue-50 text-blue-600"
            />
            <FeatureCard 
              icon={FlaskConical} 
              title={t.soilIot} 
              desc={t.realTimeNutrientTracking} 
              color="bg-purple-50 text-purple-600"
            />
          </div>

          <div className="space-y-4">
            <button 
              onClick={handleLogin}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-5 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {t.getStartedGoogle}
            </button>
            <p className="text-center text-[11px] text-slate-400 font-medium uppercase tracking-widest text-[#10b981]">
              {t.joinFarmers}
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-8 bg-slate-50 border-t border-slate-100">
           <div className="flex justify-between items-center opacity-60 grayscale scale-90">
             <div className="text-[10px] font-bold text-slate-400">SUPPORTED BY</div>
             <img src="https://upload.wikimedia.org/wikipedia/commons/5/55/Digital_India_logo.svg" className="h-6" alt="Digital India" referrerPolicy="no-referrer" />
             <div className="font-heading font-black text-xs">AGMARKNET</div>
           </div>
        </div>
      </div>
    );
  }

function FeatureCard({ icon: Icon, title, desc, color }: any) {
  return (
    <div className={`p-5 rounded-3xl ${color.split(' ')[0]} border border-white flex flex-col gap-3 shadow-sm`}>
      <Icon className={`w-6 h-6 ${color.split(' ')[1]}`} />
      <div>
        <h4 className="font-heading font-bold text-slate-900 text-sm">{title}</h4>
        <p className="text-[10px] text-slate-500 leading-tight mt-1">{desc}</p>
      </div>
    </div>
  );
}

function HardwareItem({ num, title, desc }: any) {
  return (
    <div className="flex gap-4 items-start">
      <div className="text-emerald-500 font-black text-sm">{num}</div>
      <div>
        <h4 className="text-xs font-bold text-white mb-0.5">{title}</h4>
        <p className="text-[10px] text-emerald-300 font-medium leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function MenuButton({ icon: Icon, label }: any) {
  return (
    <button className="w-full flex justify-between items-center p-5 bg-white border border-slate-50 rounded-3xl group active:scale-[0.98] transition-all shadow-sm">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-emerald-600 transition-colors">
          <Icon size={20} />
        </div>
        <span className="font-bold text-slate-700">{label}</span>
      </div>
      <ArrowRight size={18} className="text-slate-300" />
    </button>
  );
}

  if (isSelectingRole) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm">
          <h2 className="text-2xl font-heading font-black mb-1 uppercase tracking-tight">{t.identifyTitle}</h2>
          <p className="text-slate-500 text-sm mb-8">{t.identifyDesc}</p>
          <div className="space-y-3">
            {[
              { id: 'farmer', name: t.farmer, icon: Sprout, color: 'bg-emerald-50 text-emerald-600' },
              { id: 'buyer', name: t.buyer, icon: ShoppingBag, color: 'bg-blue-50 text-blue-600' },
              { id: 'transporter', name: t.transporter, icon: Truck, color: 'bg-orange-50 text-orange-600' },
              { id: 'storage', name: t.storage, icon: Warehouse, color: 'bg-purple-50 text-purple-600' },
            ].map(r => (
              <button 
                key={r.id}
                onClick={() => handleRoleSelection(r.id)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 transition-all text-left"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${r.color}`}>
                  <r.icon className="w-6 h-6" />
                </div>
                <span className="font-bold text-slate-800">{r.name}</span>
               </button>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden md:flex md:flex-row">
      
      {/* Desktop Responsive Navigation Sidebar */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200/80 h-screen fixed top-0 left-0 z-[45] p-6 flex-shrink-0 justify-between">
        <div className="space-y-6">
          {/* Brand Logo and Title */}
          <div className="flex items-center gap-3 px-1">
            <div className="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
              <Sprout className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-heading font-black text-xs tracking-tight uppercase leading-none text-emerald-800 truncate">{t.appName}</span>
              <span className="text-[9px] items-center flex gap-1 text-slate-400 font-bold uppercase mt-1">
                <ShieldCheck size={11} className="text-emerald-500 shrink-0" /> <span className="truncate">{role === 'farmer' ? t.farmer : role === 'buyer' ? t.buyer : role === 'transporter' ? t.transporter : t.storage} {t.mandiPort}</span>
              </span>
            </div>
          </div>

          {/* User Status Profile Details */}
          <div className="bg-slate-50/70 rounded-[1.5rem] p-4 border border-slate-100/80 flex items-center gap-3">
            <img 
              src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
              className="w-10 h-10 rounded-full ring-2 ring-emerald-100 object-cover shrink-0" 
              alt="Profile"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0 flex-1">
              <h4 className="font-heading font-black text-xs text-slate-900 truncate leading-none mb-1">{user.displayName}</h4>
              <p className="text-[10px] text-slate-400 font-bold truncate leading-none">{user.email}</p>
            </div>
          </div>

          {/* Interactive Navigation Sidebar Buttons */}
          <nav className="space-y-1 pt-1">
            <SidebarButton 
              icon={Home} 
              active={activeTab === 'home'} 
              onClick={() => setActiveTab('home')} 
              label={language === 'hi' ? 'मुख्य पृष्ठ' : language === 'mr' ? 'मुख्य' : language === 'te' ? 'హోమ్' : language === 'gu' ? 'મુખ્ય' : 'Home'} 
            />

            {role === 'farmer' && (
              <>
                <SidebarButton 
                  icon={ShoppingBag} 
                  active={activeTab === 'market'} 
                  onClick={() => setActiveTab('market')} 
                  label={language === 'hi' ? 'फसल बाजार' : language === 'mr' ? 'बाजार' : language === 'te' ? 'మార్కెట్' : language === 'gu' ? 'બજાર' : 'Marketplace'} 
                />
                <SidebarButton 
                  icon={LineChartIcon} 
                  active={activeTab === 'mandi'} 
                  onClick={() => setActiveTab('mandi')} 
                  label={language === 'hi' ? 'मंडी भाव' : language === 'mr' ? 'मंडी' : language === 'te' ? 'మండి' : language === 'gu' ? 'મંડી' : 'Live Mandi'} 
                />
                <SidebarButton 
                  icon={MessageSquare} 
                  active={activeTab === 'advisor'} 
                  onClick={() => setActiveTab('advisor')} 
                  label={language === 'hi' ? 'एआई चिकित्सक' : language === 'mr' ? 'सल्लागार' : language === 'te' ? 'సలహాదారు' : language === 'gu' ? 'સલાહકાર' : 'AI Crop Doctor'} 
                />
              </>
            )}

            {role === 'buyer' && (
              <>
                <SidebarButton 
                  icon={ShoppingBag} 
                  active={activeTab === 'market'} 
                  onClick={() => setActiveTab('market')} 
                  label={language === 'hi' ? 'फसल खरीदें' : language === 'mr' ? 'खरेदी' : language === 'te' ? 'కొనుగోలు' : language === 'gu' ? 'ખરીદો' : 'Buy Crops'} 
                />
                <SidebarButton 
                  icon={LineChartIcon} 
                  active={activeTab === 'mandi'} 
                  onClick={() => setActiveTab('mandi')} 
                  label={language === 'hi' ? 'मंडी भाव व भाव' : language === 'mr' ? 'मंडी' : language === 'te' ? 'మండి' : language === 'gu' ? 'મંડી' : 'Mandi Rates'} 
                />
              </>
            )}

            <SidebarButton 
              icon={User} 
              active={activeTab === 'profile'} 
              onClick={() => setActiveTab('profile')} 
              label={language === 'hi' ? 'माई प्रोफाइल' : language === 'mr' ? 'प्रोफाइल' : language === 'te' ? 'ప్రొఫైల్' : language === 'gu' ? 'પ્રોફાઇલ' : 'My Profile'} 
            />
          </nav>
        </div>

        {/* Sidebar Footer Settings */}
        <div className="space-y-4">
          <div className="space-y-1.5 bg-slate-50/50 rounded-2xl p-3 border border-slate-100">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Language / भाषा</span>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(languageNames) as SupportedLanguage[]).map(langKey => (
                <button
                  key={langKey}
                  onClick={() => setLanguage(langKey)}
                  className={`px-2 py-1.5 rounded-xl text-[10px] font-bold transition-all border flex items-center justify-between ${
                    language === langKey 
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
                    : 'text-slate-500 bg-white border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{languageNames[langKey].native}</span>
                  <span className="text-[7px] text-slate-400 font-bold uppercase shrink-0">{langKey}</span>
                </button>
              ))}
            </div>
          </div>

          <button 
            onClick={() => {
              localStorage.removeItem('krushi_role');
              setRole(null);
              setIsSelectingRole(true);
            }} 
            className="w-full flex items-center justify-center gap-2 p-3 bg-rose-50 hover:bg-rose-100 border border-rose-100 text-rose-600 rounded-2xl font-bold text-xs transition-transform active:scale-95"
          >
            <LogOut size={15} />
            <span>
              {language === 'hi' ? 'भूमिका बदलें' : language === 'mr' ? 'भूमिका बदला' : 'Change Role'}
            </span>
          </button>
        </div>
      </aside>

      {/* Main Responsive Right-side Workspace content */}
      <div className="flex-1 min-w-0 md:pl-72 flex flex-col min-h-screen">
        {/* PWA Mobile App Install Bar */}
        <AnimatePresence>
          {showInstallBanner && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white border-b border-emerald-700 overflow-hidden sticky top-0 z-50 shadow-md"
          >
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="bg-white/10 p-1.5 rounded-lg border border-white/20 shrink-0">
                  <Smartphone className="w-4 h-4 text-emerald-300 animate-pulse" />
                </div>
                <div>
                  <span className="font-black text-[13px] block">Download Mobile App</span>
                  <p className="text-[11px] text-emerald-100 font-semibold">
                    Install Krushi Connect as a real mobile app on your Android or iOS device!
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleInstallClick}
                  className="px-3.5 py-1.5 bg-white text-emerald-800 hover:bg-emerald-50 font-black rounded-lg text-[10px] uppercase shadow-md transition-transform active:scale-95"
                >
                  Install Now
                </button>
                <button
                  onClick={() => setShowInstallBanner(false)}
                  className="px-3 py-1.5 bg-emerald-700/50 hover:bg-emerald-700/80 rounded-lg text-[10.px] uppercase text-emerald-100 transition-all font-bold border border-white/10"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* High Priority Real-time NPK Deficit Alert Toast */}
      <AnimatePresence>
        {highPriorityAlert && highPriorityAlert.active && !highPriorityAlert.dismissed && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 left-4 right-4 md:left-auto md:right-4 md:w-[400px] bg-red-600 text-white rounded-2xl shadow-2xl p-4 z-50 border border-red-500 overflow-hidden"
          >
            {/* Pulsing countdown timeline bar */}
            <div className="absolute top-0 left-0 h-1 bg-amber-400 w-full animate-pulse" />
            
            <div className="flex gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0 border border-white/20">
                <AlertTriangle className="w-5 h-5 text-amber-300 animate-bounce" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-xs text-red-100 uppercase tracking-wider">
                    {highPriorityAlert.message}
                  </h4>
                  <span className="text-[9px] uppercase font-black px-1.5 py-0.5 bg-red-700/80 rounded-full border border-red-400/30 whitespace-nowrap">
                    Deficit: {highPriorityAlert.elapsed}s
                  </span>
                </div>
                <p className="text-[11px] text-red-100 mt-1 leading-relaxed font-semibold">
                  {highPriorityAlert.details}
                </p>
                
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setHighPriorityAlert(prev => prev ? { ...prev, dismissed: true } : null);
                    }}
                    className="px-2.5 py-1 bg-red-700 hover:bg-red-800 transition-colors rounded-lg text-[9px] font-black text-white uppercase tracking-wider"
                  >
                    Dismiss Alert
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('advisor');
                      setHighPriorityAlert(prev => prev ? { ...prev, dismissed: true } : null);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-neutral-50 text-red-700 transition-colors rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm"
                  >
                    View Soil Advice
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header (Mobile-only, hidden on Desktop since sidebar is active) */}
      <header className="flex md:hidden p-5 justify-between items-center bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <Sprout className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-heading font-black text-xs uppercase leading-none text-emerald-800">{t.appName}</span>
            <span className="text-[10px] items-center flex gap-1 text-slate-400 font-bold uppercase">
              <ShieldCheck size={10} className="text-emerald-500" /> {role === 'farmer' ? t.farmer : role === 'buyer' ? t.buyer : role === 'transporter' ? t.transporter : t.storage} {t.mandiPort}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {weather && (
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-full border border-slate-100">
               <CloudRain className="w-3.5 h-3.5 text-blue-500" />
               <span className="text-[10px] font-bold">{Math.round(weather.temp)}°C</span>
            </div>
          )}

          {/* Language Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-1 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-full border border-slate-100 transition-colors font-black text-[10px] text-slate-700 uppercase"
            >
              <Languages className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{languageNames[language].native}</span>
            </button>
            <AnimatePresence>
              {showLangMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-36 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 py-1 overflow-hidden"
                  >
                    {(Object.keys(languageNames) as SupportedLanguage[]).map(langKey => (
                      <button
                        key={langKey}
                        onClick={() => {
                          setLanguage(langKey);
                          setShowLangMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-[11px] font-bold transition-colors hover:bg-slate-50 flex items-center justify-between ${
                          language === langKey ? 'text-emerald-600 bg-emerald-50' : 'text-slate-700'
                        }`}
                      >
                        <span>{languageNames[langKey].native}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">{langKey}</span>
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <img 
            src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
            className="w-8 h-8 rounded-full ring-2 ring-emerald-100" 
            alt="Profile"
          />
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 w-full flex-1 pb-24 md:pb-8">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center px-1 mb-6">
                <div>
                  <h2 className="text-2xl font-heading font-black text-slate-900 leading-none">
                    {t.helloUser}, {user.displayName?.split(' ')[0]}!
                  </h2>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mt-1">
                    {format(new Date(), 'EEEE, do MMMM')}
                  </p>
                </div>
                
                {role === 'farmer' && (
                  <div className="flex bg-white p-1 rounded-2xl border border-slate-200 max-w-full overflow-x-auto whitespace-nowrap scrollbar-none gap-0.5">
                    {(['A', 'B', 'C'] as const).map(id => {
                      const details = getSoilDetails(id);
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            setActiveNode(id);
                            if (!isConnected) {
                              setIsConnected(true);
                              setIsPiMocked(true);
                              setPiConnectionStatus('connected');
                              localStorage.setItem('pi_connection_status', 'connected');
                              localStorage.setItem('pi_is_mocked', 'true');
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-1.5 shrink-0 ${
                            activeNode === id 
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 font-black' 
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>{details.emoji}</span>
                          <span className="tracking-wide">{details.name.split(' (')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Role-Specific Home Content */}
              {role === 'farmer' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-1">
                    {(['A', 'B', 'C'] as const).map(id => {
                      const details = getSoilDetails(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setActiveNode(id);
                            if (!isConnected) {
                              setIsConnected(true);
                              setIsPiMocked(true);
                              setPiConnectionStatus('connected');
                              localStorage.setItem('pi_connection_status', 'connected');
                              localStorage.setItem('pi_is_mocked', 'true');
                            }
                          }}
                          className={`p-4 rounded-[2rem] border text-left transition-all relative overflow-hidden flex flex-col justify-between group ${
                            activeNode === id 
                            ? 'bg-emerald-50/60 border-emerald-500/20 ring-2 ring-emerald-500/10 shadow-md shadow-emerald-600/5' 
                            : 'bg-white border-slate-200/50 hover:bg-slate-50/50 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex justify-between items-start w-full gap-2 mb-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-2xl shrink-0">{details.emoji}</span>
                              <div className="flex flex-col min-w-0">
                                <span className={`text-[8px] font-black uppercase tracking-widest ${activeNode === id ? 'text-emerald-700' : 'text-slate-400'}`}>
                                  {t.node} {id}
                                </span>
                                <span className="font-heading font-black text-xs text-slate-800 tracking-tight mt-0.5 truncate leading-tight">
                                  {details.name}
                                </span>
                              </div>
                            </div>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${details.indicator}`} />
                          </div>

                          <div className="text-[10px] text-slate-400 font-medium leading-normal mb-3">
                            {details.desc}
                          </div>

                          <div className="flex items-baseline justify-between w-full mt-auto">
                            <div>
                              <span className="text-3xl font-black text-slate-900 leading-none">{Math.round(nodes[id].moisture)}%</span>
                              <span className="text-[9px] text-slate-400 font-bold uppercase block tracking-wider mt-1">
                                {t.soilMoisture}
                              </span>
                            </div>
                            <span className={`text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-wider ${
                              nodes[id].moisture < 20 
                              ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                              : nodes[id].moisture > 80 
                              ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                              : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                            }`}>
                              {nodes[id].moisture < 20 ? 'Critical Dry' : nodes[id].moisture > 80 ? 'Flooded' : 'Moist/Wet'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Manual Calibration / Simulation Panel */}
                  {isConnected && (
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-5">
                        <Settings size={60} />
                      </div>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                          <Settings size={14} />
                        </div>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calibration: Node {activeNode}</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-3">
                        <SensorSlider 
                          label="Soil Moisture" 
                          value={sensorState.moisture} 
                          unit="%" 
                          onChange={(v) => updateSensorValue('moisture', v)} 
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <SensorSlider 
                            label="Soil Temp" 
                            value={sensorState.temperature} 
                            unit="°C" 
                            max={50}
                            onChange={(v) => updateSensorValue('temperature', v)} 
                          />
                          <SensorSlider 
                            label="pH level" 
                            value={sensorState.ph} 
                            unit="" 
                            min={0} max={14}
                            onChange={(v) => updateSensorValue('ph', v)} 
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sensor Status */}
                  {isConnected ? (
                    <div className="bg-emerald-600 rounded-[2rem] p-6 text-white shadow-xl shadow-emerald-600/20 overflow-hidden relative">
                      <div className="relative z-10">
                        <div className="flex justify-between items-start mb-1">
                          <h2 className="text-emerald-100 text-sm font-bold uppercase tracking-widest">{t.liveSoilData}</h2>
                          <span className="text-[10px] bg-white/20 px-2.5 py-1 rounded-full border border-white/25 flex items-center gap-1.5 font-bold">
                            <div className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" />
                            {isPiMocked ? t.simulatedMode : t.livePiMode}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-5xl font-black">{Math.round(sensorState.moisture)}%</span>
                          <span className="text-emerald-200 font-bold uppercase text-xs">{t.soilMoisture}</span>
                        </div>

                        <div className="flex items-center gap-1 text-[10px] text-emerald-100/80 mt-1 mb-5 font-semibold bg-emerald-700/40 py-1.5 px-3 rounded-xl border border-white/5 inline-flex">
                          <Wifi size={12} className="shrink-0" />
                          <span>{isPiMocked ? t.simulatedSameWifi : `${t.wifiConnected}: ${piIpAddress}:${piPort}`}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="flex flex-col gap-1 p-3 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-md">
                            <Thermometer className="w-4 h-4 text-emerald-200" />
                            <span className="text-lg font-bold">{Math.round(sensorState.temperature ?? 0)}°C</span>
                            <span className="text-[10px] text-emerald-200 opacity-70 uppercase font-black tracking-wider">Air Temp</span>
                          </div>
                          <div className="flex flex-col gap-1 p-3 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-md">
                            <Activity className="w-4 h-4 text-emerald-200" />
                            <span className="text-lg font-bold">{Math.round(sensorState.humidity ?? 50)}%</span>
                            <span className="text-[10px] text-emerald-200 opacity-70 uppercase font-black tracking-wider">Air Humidity</span>
                          </div>
                          <div className="flex flex-col gap-1 p-3 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-md">
                            <FlaskConical className="w-4 h-4 text-emerald-200" />
                            <span className="text-lg font-bold">{sensorState.ph ?? 7.0}</span>
                            <span className="text-[10px] text-emerald-200 opacity-70 uppercase font-black tracking-wider">pH Level A0</span>
                          </div>
                          <div className="flex flex-col gap-1 p-3 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-md">
                            <Cpu className="w-4 h-4 text-emerald-200" />
                            <span className="text-lg font-bold">{Math.round(sensorState.tds ?? 400)} <span className="text-[10px]">ppm</span></span>
                            <span className="text-[10px] text-emerald-200 opacity-70 uppercase font-black tracking-wider">TDS Level A1</span>
                          </div>
                        </div>

                        {/* User Python Target Crop Suitability */}
                        <div className="mt-4 p-3 bg-emerald-700/50 rounded-2xl border border-white/10 backdrop-blur-md text-xs">
                          <div className="font-bold text-emerald-100 uppercase text-[9px] tracking-wider mb-1 flex items-center gap-1">
                            <Sprout className="w-3.5 h-3.5 text-emerald-300" /> RECOMMENDED CROP BY PI 4
                          </div>
                          <div className="font-black text-sm text-white">{sensorState.crop || "Detecting..."}</div>
                        </div>

                        {/* Action Suggestions and Alarms */}
                        {sensorState.suggestions && sensorState.suggestions.length > 0 && (
                          <div className="mt-3 p-3 bg-amber-500/10 rounded-2xl border border-amber-300/30 text-xs">
                            <div className="font-bold text-amber-300 uppercase text-[9px] tracking-wider mb-1">
                              Action Suggestions (Pi 4 Alarms)
                            </div>
                            <ul className="list-disc pl-4 space-y-0.5 text-amber-100 text-[11px] font-semibold">
                              {sensorState.suggestions.map((s, idx) => (
                                <li key={idx}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="mt-6 flex gap-2">
                        <button 
                          onClick={() => setShowPiConnectModal(true)}
                          aria-label="WiFi Connection Settings"
                          className="p-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-white transition-all flex items-center justify-center active:scale-95"
                        >
                          <Settings size={18} />
                        </button>
                        <button 
                          onClick={() => disconnectRaspberryPi()}
                          className="flex-1 py-4 rounded-2xl font-bold bg-white text-emerald-700 shadow-md hover:shadow-lg active:scale-95 transition-all text-sm uppercase tracking-wider text-center"
                        >
                          Disconnect Link
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {history.length > 0 && (
                        <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-xl overflow-hidden relative">
                          <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-3">
                              <ShieldCheck className="w-4 h-4 text-emerald-400" />
                              <h2 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Last Soil Health Check</h2>
                            </div>
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-3xl font-black text-emerald-400">GOOD</div>
                                <p className="text-[10px] text-slate-500 font-medium whitespace-nowrap">Checked: {format(history[0].timestamp?.toDate() || new Date(), 'MMM d, p')}</p>
                              </div>
                              <button 
                                onClick={() => setActiveTab('advisor')}
                                className="p-3 bg-slate-800 rounded-full border border-slate-700 hover:bg-slate-700 transition-colors"
                              >
                                <ArrowRight className="w-5 h-5 text-emerald-400" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-white p-8 rounded-[2rem] border-2 border-dashed border-slate-200 text-center relative overflow-hidden group">
                        <div className="relative z-10">
                          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Wifi className="w-8 h-8 text-emerald-600 animate-pulse" />
                          </div>
                          <h3 className="font-heading font-black text-xl mb-1 uppercase tracking-tight">Sync Raspberry Pi 4</h3>
                          <p className="text-xs text-slate-400 max-w-[240px] mx-auto mt-1 mb-5 leading-relaxed">
                            Establish a direct link to your local Raspberry Pi 4 B soil sensor nodes over WiFi.
                          </p>
                          <button 
                            onClick={() => setShowPiConnectModal(true)}
                            className="bg-emerald-600 text-white px-10 py-4 rounded-2xl font-black text-sm shadow-xl shadow-emerald-600/30 active:scale-95 transition-all w-full flex items-center justify-center gap-2 uppercase tracking-wider"
                          >
                            <Wifi size={16} /> CONNECT VIA WIFI
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isConnected && (
                    <div className="grid grid-cols-3 gap-3">
                      <SensorCard icon={FlaskConical} label="Nitrogen" value={sensorState.n} unit="mg" color="bg-blue-500" historyData={getRecentTrend('n')} status={getStatus('n', sensorState.n)} />
                      <SensorCard icon={FlaskConical} label="Phos" value={sensorState.p} unit="mg" color="bg-purple-500" historyData={getRecentTrend('p')} status={getStatus('p', sensorState.p)} />
                      <SensorCard icon={FlaskConical} label="Potas" value={sensorState.k} unit="mg" color="bg-rose-500" historyData={getRecentTrend('k')} status={getStatus('k', sensorState.k)} />
                    </div>
                  )}

                  <SectionTitle action="Get Match">Crop Suitability</SectionTitle>
                  <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                        <MapPin className="w-8 h-8" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-heading font-bold text-slate-800">Local Soil Match</h4>
                        <p className="text-[10px] text-slate-500 font-medium">Find the best crops for {location?.city || 'your area'}</p>
                      </div>
                      <button 
                        onClick={fetchAdvice}
                        disabled={!isConnected || loadingAdvice}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-200 disabled:opacity-50"
                      >
                        {loadingAdvice ? 'Checking...' : 'Check Match'}
                      </button>
                    </div>

                    {advice && (
                      <div className="mt-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                        <div className="flex items-center gap-2 mb-2">
                          <Sprout className="w-4 h-4 text-emerald-600" />
                          <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">Top Soil Recommendations</span>
                        </div>
                        <div className="text-xs text-emerald-800 line-clamp-2 italic leading-relaxed">
                          {advice.split('### 2. Suitable Crops')[1]?.split('###')[0] || "Analysis in progress..."}
                        </div>
                        <button 
                          onClick={() => setActiveTab('advisor')}
                          className="mt-2 text-[10px] font-bold text-emerald-600 underline"
                        >
                          Read full report
                        </button>
                      </div>
                    )}
                  </div>

                  <SectionTitle action="See all">Farming Insights</SectionTitle>
                  <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
                    <div className="min-w-[240px] bg-amber-50 border border-amber-100 p-5 rounded-3xl space-y-3">
                      <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><CloudRain className="w-5 h-5 text-amber-600" /></div>
                      <h4 className="font-heading font-bold text-slate-800">Monsoon Forecast</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Expected rainfall increased by 15% this week. Prepare drainage.</p>
                    </div>
                    <div className="min-w-[240px] bg-indigo-50 border border-indigo-100 p-5 rounded-3xl space-y-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center"><Leaf className="w-5 h-5 text-indigo-600" /></div>
                      <h4 className="font-heading font-bold text-slate-800">Organic Pesticides</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Use Neem oil mixture for organic protection against white flies.</p>
                    </div>
                  </div>

                  <SectionTitle action="Sell Now">Direct Marketplace</SectionTitle>
                  <div className="bg-emerald-900 rounded-[2rem] p-6 text-white shadow-xl relative overflow-hidden mb-6">
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-4">
                        <TrendingUp className="text-emerald-400" />
                        <h3 className="font-heading font-bold text-lg">Marketplace</h3>
                      </div>
                      <p className="text-xs text-emerald-200 mb-6 leading-relaxed">List your harvest directly to wholesalers and get better prices with zero commissions.</p>
                      <button 
                        onClick={() => setShowMarketplaceListing(true)}
                        className="bg-emerald-500 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                      >
                        List Crop for Sale
                      </button>
                    </div>
                    <div className="absolute right-[-30px] bottom-[-30px] opacity-10">
                      <ShoppingBag size={180} />
                    </div>
                  </div>

                  {/* Marketplace Listing Modal */}
                  <AnimatePresence>
                    {showMarketplaceListing && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4"
                      >
                        <motion.div 
                          initial={{ y: 100 }}
                          animate={{ y: 0 }}
                          className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 max-h-[90vh] overflow-y-auto"
                        >
                          <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-heading font-black text-slate-900 uppercase tracking-tight">Sell Your Crop</h2>
                            <button onClick={() => setShowMarketplaceListing(false)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-900">
                              <Plus className="rotate-45" />
                            </button>
                          </div>

                          <form className="space-y-6" onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            handleListCrop({
                              crop: formData.get('crop'),
                              quantity: formData.get('quantity'),
                              price: formData.get('price'),
                              location: formData.get('location'),
                            });
                          }}>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Crop Name</label>
                              <input name="crop" required placeholder="e.g., Organic Wheat" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Quantity (Qtl)</label>
                                <input name="quantity" required type="number" placeholder="50" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none" />
                              </div>
                              <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Price (per Qtl)</label>
                                <input name="price" required type="number" placeholder="₹2400" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none" />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Pickup Location</label>
                              <input name="location" required placeholder="e.g., Barnala, Punjab" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none" />
                            </div>
                            <button type="submit" className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl">
                              Publish Listing
                            </button>
                          </form>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {bookings.length > 0 && (
                    <>
                      <SectionTitle>My Bookings</SectionTitle>
                      <div className="space-y-3 mb-6">
                        {bookings.slice(0, 2).map((booking, idx) => (
                          <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${booking.type === 'transport' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                                {booking.type === 'transport' ? <Truck size={20} /> : <Warehouse size={20} />}
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-800">{booking.details}</div>
                                <div className="text-[10px] text-slate-400 font-medium">{booking.price} • {booking.status}</div>
                              </div>
                            </div>
                            <div className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${booking.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                              {booking.status}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <SectionTitle>Agri Logistics</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setLogisticsDetail('transport')}
                      className="bg-white p-5 rounded-[2rem] border border-slate-100 flex flex-col gap-4 shadow-sm text-left active:scale-95 transition-transform"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center"><Truck size={24} /></div>
                      <div>
                        <div className="font-bold text-lg mb-0.5">Transport</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Bookings Open</div>
                      </div>
                    </button>
                    <button 
                      onClick={() => setLogisticsDetail('storage')}
                      className="bg-white p-5 rounded-[2rem] border border-slate-100 flex flex-col gap-4 shadow-sm text-left active:scale-95 transition-transform"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center"><Warehouse size={24} /></div>
                      <div>
                        <div className="font-bold text-lg mb-0.5">Cold Storage</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">12 Hubs Nearby</div>
                      </div>
                    </button>
                  </div>

                  {/* Logistics Detail Modal */}
                  <AnimatePresence>
                    {logisticsDetail && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4"
                      >
                        <motion.div 
                          initial={{ y: 100 }}
                          animate={{ y: 0 }}
                          className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 max-h-[80vh] overflow-y-auto"
                        >
                          <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-heading font-black text-slate-900 uppercase tracking-tight">
                              {logisticsDetail === 'transport' ? 'Transport System' : 'Cold Storage Network'}
                            </h2>
                            <button onClick={() => setLogisticsDetail(null)} className="p-2 bg-slate-100 rounded-full"><Plus className="rotate-45" /></button>
                          </div>

                          {logisticsDetail === 'transport' ? (
                            <div className="space-y-6">
                              <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100">
                                <h3 className="font-bold text-orange-900 mb-2">Nearby Vehicles</h3>
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center p-3 bg-white rounded-xl shadow-sm">
                                    <div className="flex items-center gap-3">
                                      <Truck size={18} className="text-orange-500" />
                                      <div>
                                        <div className="text-xs font-bold">12ft Truck (Eicher)</div>
                                        <div className="text-[10px] text-slate-400">2.4km away • 5 ton capacity</div>
                                      </div>
                                    </div>
                                    <div className="text-xs font-black text-orange-600">₹25/km</div>
                                  </div>
                                  <div className="flex justify-between items-center p-3 bg-white rounded-xl shadow-sm">
                                    <div className="flex items-center gap-3">
                                      <Truck size={18} className="text-orange-500" />
                                      <div>
                                        <div className="text-xs font-bold">Small Pickup (Tata Ace)</div>
                                        <div className="text-[10px] text-slate-400">0.8km away • 1.5 ton</div>
                                      </div>
                                    </div>
                                    <div className="text-xs font-black text-orange-600">₹18/km</div>
                                  </div>
                                </div>
                              </div>
                              <button 
                                onClick={() => handleBooking('transport', '12ft Truck (Eicher)', '₹25/km')}
                                disabled={isBooking || bookingSuccess}
                                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all ${
                                  bookingSuccess ? 'bg-emerald-500 text-white' : 'bg-orange-600 text-white'
                                }`}
                              >
                                {isBooking ? 'Processing...' : bookingSuccess ? 'BOOKED! 🎉' : 'Book a Vehicle'}
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-6">
                              <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                                <h3 className="font-bold text-blue-900 mb-2">Available Capacity</h3>
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center p-3 bg-white rounded-xl shadow-sm">
                                    <div className="flex items-center gap-3">
                                      <Warehouse size={18} className="text-blue-500" />
                                      <div>
                                        <div className="text-xs font-bold">SafeHarvest Hub - A</div>
                                        <div className="text-[10px] text-slate-400">4.2km away • 40% free</div>
                                      </div>
                                    </div>
                                    <div className="text-xs font-black text-blue-600">₹0.50/kg/month</div>
                                  </div>
                                  <div className="flex justify-between items-center p-3 bg-white rounded-xl shadow-sm">
                                    <div className="flex items-center gap-3">
                                      <Warehouse size={18} className="text-blue-500" />
                                      <div>
                                        <div className="text-xs font-bold">AgriCool Center - 2</div>
                                        <div className="text-[10px] text-slate-400">6.1km away • 15% free</div>
                                      </div>
                                    </div>
                                    <div className="text-xs font-black text-blue-600">₹0.65/kg/month</div>
                                  </div>
                                </div>
                              </div>
                              <button 
                                onClick={() => handleBooking('storage', 'SafeHarvest Hub - A', '₹0.50/kg')}
                                disabled={isBooking || bookingSuccess}
                                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all ${
                                  bookingSuccess ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'
                                }`}
                              >
                                {isBooking ? 'Processing...' : bookingSuccess ? 'RESERVED! 🧊' : 'Reserve Space'}
                              </button>
                            </div>
                          )}
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}

              {role === 'buyer' && (
                <div className="space-y-6">
                  <div className="bg-blue-600 rounded-[2rem] p-6 text-white shadow-xl shadow-blue-600/20 overflow-hidden relative">
                    <h2 className="text-3xl font-heading font-black uppercase mb-2 leading-none">Find fresh<br/><span className="text-blue-200">Produce</span></h2>
                    <p className="text-blue-100 text-xs mb-6 font-medium">Buy directly from farmers across India.</p>
                    <button onClick={() => setActiveTab('market')} className="bg-white text-blue-700 px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-wider">Browse Marketplace</button>
                  </div>
                  <SectionTitle>Top Crop Categories</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center">
                       <Sprout className="mx-auto mb-2 text-emerald-500" />
                       <span className="font-bold text-sm">Grains</span>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center">
                       <ShoppingBag className="mx-auto mb-2 text-orange-500" />
                       <span className="font-bold text-sm">Vegetables</span>
                    </div>
                  </div>
                </div>
              )}

              {role === 'transporter' && (
                <div className="space-y-6">
                  <div className="bg-orange-600 rounded-[2rem] p-6 text-white shadow-xl shadow-orange-600/20">
                     <h2 className="text-2xl font-heading font-black uppercase mb-1">Your Fleet</h2>
                     <p className="text-orange-100 text-xs mb-6">Manage bookings and price settings.</p>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/10 p-4 rounded-2xl border border-white/10">
                           <span className="text-2xl font-black">12</span>
                           <p className="text-[10px] uppercase font-black">Active Trips</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl border border-white/10">
                           <span className="text-2xl font-black">₹4.2k</span>
                           <p className="text-[10px] uppercase font-black">Today's Revenue</p>
                        </div>
                     </div>
                  </div>

                  <SectionTitle action="View All">Pending Requests</SectionTitle>
                  <div className="space-y-3">
                    {bookings.length === 0 ? (
                      <div className="p-8 text-center bg-white rounded-3xl border border-slate-100 italic text-slate-400 text-xs">
                        No active transport requests.
                      </div>
                    ) : (
                      bookings.map((booking: any) => (
                        <div key={booking.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                              <MapPin size={18} />
                            </div>
                            <div>
                              <div className="text-sm font-bold truncate max-w-[120px]">{booking.userName}</div>
                              <div className="text-[10px] text-slate-400 font-medium">{booking.details} • {booking.price}</div>
                            </div>
                          </div>
                          {booking.status === 'pending' ? (
                            <button 
                              onClick={() => updateBookingStatus(booking.id, 'confirmed')}
                              className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-sm active:scale-95 transition-transform"
                            >
                              Accept
                            </button>
                          ) : (
                            <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{booking.status}</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <SectionTitle>Service Pricing Model</SectionTitle>
                  <TransportPricing />
                </div>
              )}

              {role === 'storage' && (
                <div className="space-y-6">
                  <div className="bg-purple-600 rounded-[2rem] p-6 text-white shadow-xl shadow-purple-600/20">
                     <h2 className="text-2xl font-heading font-black uppercase mb-1">Storage Hub</h2>
                     <p className="text-purple-100 text-xs mb-6">Control capacity and cooling units.</p>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/10 p-4 rounded-2xl border border-white/10">
                           <span className="text-2xl font-black">84%</span>
                           <p className="text-[10px] uppercase font-black">Capacity Used</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl border border-white/10">
                           <span className="text-2xl font-black">4°C</span>
                           <p className="text-[10px] uppercase font-black">Current Temp</p>
                        </div>
                     </div>
                  </div>

                  <SectionTitle action="Manage">Current Inventory</SectionTitle>
                  <div className="bg-white p-6 rounded-3xl border border-slate-100">
                    <div className="space-y-4">
                      {bookings.length === 0 ? (
                        <p className="text-xs text-slate-400 italic text-center">No inventory tracked yet.</p>
                      ) : (
                        bookings.map((booking: any) => (
                          <div key={booking.id} className="p-4 border border-slate-50 rounded-2xl bg-slate-50/30">
                             <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-slate-900">{booking.userName}'s Store</span>
                               <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                 {booking.status}
                               </span>
                             </div>
                             <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                               <span>{booking.details}</span>
                               <button 
                                 onClick={() => updateBookingStatus(booking.id, booking.status === 'pending' ? 'confirmed' : 'completed')}
                                 className="text-emerald-600 font-black hover:underline"
                               >
                                 Update Status
                               </button>
                             </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <SectionTitle>Storage Rates</SectionTitle>
                  <StoragePricing />
                </div>
              )}

              {role === 'buyer' && (
                <div className="space-y-6">
                  <div className="bg-blue-600 rounded-[2rem] p-6 text-white shadow-xl shadow-blue-600/20 relative overflow-hidden">
                    <div className="relative z-10">
                      <h2 className="text-2xl font-heading font-black uppercase mb-1">Wholesale Hub</h2>
                      <p className="text-blue-100 text-xs mb-6">Source quality crops directly from verified farms.</p>
                      <div className="flex gap-4">
                        <div className="bg-white/10 p-3 rounded-2xl border border-white/10 flex-1">
                          <span className="text-xl font-black">{listings.length}</span>
                          <p className="text-[10px] uppercase font-black">Live Listings</p>
                        </div>
                        <div className="bg-white/10 p-3 rounded-2xl border border-white/10 flex-1">
                          <span className="text-xl font-black">4.9</span>
                          <p className="text-[10px] uppercase font-black">Trust Score</p>
                        </div>
                      </div>
                    </div>
                    <div className="absolute right-[-20px] bottom-[-20px] opacity-10">
                       <ShoppingBag size={140} />
                    </div>
                  </div>

                  <SectionTitle action="Browse All">Marketplace Feed</SectionTitle>
                  <div className="space-y-4">
                    {listings.length === 0 ? (
                      <div className="p-8 text-center bg-white rounded-3xl border border-slate-100 italic text-slate-400 text-xs">
                        No active crop listings available right now.
                      </div>
                    ) : (
                      listings.map((listing: any) => (
                        <div key={listing.id} className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-4">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <img src={listing.userPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${listing.userId}`} className="w-10 h-10 rounded-full border-2 border-slate-50" />
                              <div>
                                <div className="text-sm font-black text-slate-900">{listing.crop}</div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase">{listing.userName} • {listing.location}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-black text-emerald-600">₹{listing.price}</div>
                              <div className="text-[10px] text-slate-400 font-bold">per Quintal</div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                             <div className="bg-slate-50 px-3 py-1.5 rounded-xl text-[10px] font-black text-slate-500 uppercase">Qty: {listing.quantity} Qtl</div>
                             <div className="bg-emerald-50 px-3 py-1.5 rounded-xl text-[10px] font-black text-emerald-600 uppercase">Verified Crop</div>
                          </div>

                          <div className="flex gap-2">
                            <button className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all">
                              Place Order
                            </button>
                            <button className="w-12 h-12 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:text-emerald-600 transition-colors">
                              <HelpCircle size={20} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              <div className="pb-10" />
            </motion.div>
          )}

          {activeTab === 'market' && (
            <motion.div 
              key="market"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder={language === 'hi' ? 'अपने आस-पास की फसलें खोजें...' : language === 'mr' ? 'तुमच्या जवळील पिके शोधा...' : language === 'te' ? 'మీ సమీపంలో పంటలను వెతకండి...' : language === 'gu' ? 'તમારી નજીકના પાક શોધો...' : 'Search crops near you...'} 
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
                <button className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <SectionTitle>{language === 'hi' ? 'हालिया प्रविष्टियां' : language === 'mr' ? 'अलीकडील नोंदी' : language === 'te' ? 'ఇటీవలి ప్రకటనలు' : language === 'gu' ? 'તાજેતરની યાદીઓ' : 'Recent Listings'}</SectionTitle>
              <div className="space-y-4">
                {products.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl text-center border-2 border-dashed border-slate-200">
                    <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-2 font-normal" />
                    <p className="text-slate-500 text-sm font-semibold">{t.noListingsYet}</p>
                    <button 
                      onClick={() => {
                        if (!user) return;
                        addDoc(collection(db, 'products'), {
                          farmerId: user.uid,
                          farmerName: user.displayName || 'Verified Farmer',
                          cropName: 'Organic Sona Masoori Rice',
                          price: 4500,
                          quantity: '10 Quintals',
                          location: 'Hingoli, Maharashtra',
                          status: 'available',
                          createdAt: serverTimestamp()
                        })
                      }}
                      className="mt-4 text-emerald-600 font-bold text-sm underline hover:text-emerald-700"
                    >
                      {language === 'hi' ? 'नमूना प्रविष्टि पोस्ट करें' : language === 'mr' ? 'नमुना यादी पोस्ट करा' : language === 'te' ? 'నమూనా ప్రకటనను పోస్ట్ చేయి' : language === 'gu' ? 'નમૂના યાદી પોસ્ટ કરો' : 'Post Sample Listing'}
                    </button>
                  </div>
                ) : (
                  products.map(item => (
                    <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex gap-4 hover:border-slate-200 transition-colors">
                      <div className="w-20 h-20 bg-emerald-50 rounded-xl flex items-center justify-center">
                        <ShoppingBag className="w-8 h-8 text-emerald-300" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-900">{item.cropName}</h4>
                        <p className="text-xs text-slate-500 mb-2">{item.location}</p>
                        <div className="flex justify-between items-center">
                          <span className="text-emerald-600 font-bold">₹{item.price}<span className="text-[10px] text-slate-400 font-normal"> / {language === 'hi' ? 'क्विंटल' : language === 'mr' ? 'क्विंटल' : language === 'te' ? 'क्विंटాల్' : 'quintal'}</span></span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold">{item.quantity}</span>
                        </div>
                        <button className="mt-3 w-full border border-slate-200 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors text-slate-700">
                          {language === 'hi' ? 'किसान से संपर्क करें' : language === 'mr' ? 'शेतकऱ्यांशी संपर्क साधा' : language === 'te' ? 'రైతును సంప్రదించండి' : language === 'gu' ? 'ખેડૂતનો સંપર્ક કરો' : 'Contact Farmer'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'advisor' && (
            <motion.div 
              key="advisor"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              {/* Latest Advice */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm min-h-[400px]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold">{language === 'hi' ? 'जमीन बुद्धिमत्ता रिपोर्ट' : language === 'mr' ? 'माती बुद्धिमत्ता अहवाल' : language === 'te' ? 'నేల విશ્లేషణ నిвеదిక' : language === 'gu' ? 'જમીન બુદ્ધિમત્તા અહેવાલ' : 'Soil Intelligence Report'}</h3>
                    <p className="text-[10px] text-slate-400">{language === 'hi' ? 'जेमिनी एआई द्वारा संचालित • सक्रिय सत्र' : language === 'mr' ? 'जेमिनी एआय द्वारा संचालित • सक्रिय सत्र' : language === 'te' ? 'జెమిని AI ఆధారితం • శీఘ్ర సెషన్' : 'Powered by Gemini AI • Active Session'}</p>
                  </div>
                </div>
                
                {advice ? (
                  <div className="prose prose-sm text-slate-700 max-w-none">
                    <ReactMarkdown>{advice}</ReactMarkdown>
                    <button 
                      onClick={() => setAdvice(null)}
                      className="mt-8 w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-sm"
                    >
                      {language === 'hi' ? 'नया विश्लेषण शुरू करें' : language === 'mr' ? 'नवीन विश्लेषण सुरू करा' : language === 'te' ? 'కొత్త విశ్లేషణ ప్రారంభించు' : 'Conduct New Analysis'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[300px] text-center space-y-4">
                    <div className="bg-slate-50 p-6 rounded-full">
                      <MessageSquare className="w-12 h-12 text-slate-200" />
                    </div>
                    <p className="text-slate-500 text-sm max-w-[200px] font-semibold">{language === 'hi' ? 'कोई सक्रिय विश्लेषण नहीं। जब आपका सेंसर कनेक्टेड हो, मुख्य पृष्ठ पर "एआई सलाह देखें" बटन दबाएं।' : language === 'mr' ? 'कोणतेही सक्रिय विश्लेषण उपलब्ध नाही. सेन्सर कनेक्ट झाल्यावर मुख्य स्क्रीनवरून विश्लेषण मिळवा.' : language === 'te' ? 'విశ్లేషణ ఏదీ లేదు. హోమ్ పేజీలో నేల సలహా పొందండి.' : 'No active analysis. Please check back when your Node is active.'}</p>
                  </div>
                )}
              </div>

              {/* History Section */}
              <div className="space-y-4">
                <SectionTitle>{language === 'hi' ? 'पिछले रिकॉर्ड' : language === 'mr' ? 'मागील नोंदी' : language === 'te' ? 'ఇటీवलि పరీక్షలు' : 'Previous Records'}</SectionTitle>
                {history.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl text-center border border-slate-100">
                    <p className="text-slate-400 text-sm">{language === 'hi' ? 'कोई पुराना रिकॉर्ड उपलब्ध नहीं है।' : language === 'mr' ? 'कोणताही मागील डेटा उपलब्ध नाही.' : 'No historical data available.'}</p>
                  </div>
                ) : (
                  history.slice(advice ? 1 : 0).map((record) => (
                    <div key={record.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                          <span className="text-sm font-bold text-slate-900">
                            {record.timestamp ? format(record.timestamp.toDate(), 'PPP p') : 'Pending...'}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-full">
                            M: {Math.round(record.moisture)}% • T: {Math.round(record.temperature)}°C
                          </div>
                          {record.location && (
                            <div className="text-[10px] text-slate-400 font-medium flex items-center gap-0.5">
                              <MapPin size={8} /> {record.location.city || 'Unknown'}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-slate-600 line-clamp-3 mb-4 italic">
                        "{record.advice?.substring(0, 150)}..."
                      </div>
                      <button 
                        onClick={() => setAdvice(record.advice)}
                        className="text-xs font-bold text-emerald-600 border border-emerald-100 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
                      >
                        View Full Report
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'mandi' && (
            <motion.div 
                key="mandi"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
            >
                {/* Market Forecast / Price Increase Predictions */}
                <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-xl overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <TrendingUp size={80} />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-5 h-5 text-emerald-400" />
                      <h2 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">AI Market Outlook</h2>
                    </div>
                    <h3 className="text-xl font-heading font-black mb-4 leading-tight uppercase">Price Hike Predictions</h3>
                    
                    {loadingForecast ? (
                      <div className="space-y-3">
                        <div className="h-4 bg-slate-800 rounded animate-pulse w-3/4" />
                        <div className="h-4 bg-slate-800 rounded animate-pulse w-1/2" />
                        <div className="h-4 bg-slate-800 rounded animate-pulse w-2/3" />
                      </div>
                    ) : (
                      <div className="text-xs text-slate-300 space-y-4 prose-invert prose-emerald max-w-none">
                        <ReactMarkdown>{marketForecast || ""}</ReactMarkdown>
                      </div>
                    )}
                    
                    <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 font-medium">Updated for Next Quarter</span>
                      <div className="flex gap-1">
                         <div className="w-1 h-1 rounded-full bg-emerald-500" />
                         <div className="w-1 h-1 rounded-full bg-emerald-500 opacity-50" />
                         <div className="w-1 h-1 rounded-full bg-emerald-500 opacity-20" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.mandiTitle}</span>
                        <div className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" /> {language === 'hi' ? 'लाइव' : language === 'mr' ? 'लाइव्ह' : language === 'te' ? 'లైవ్' : language === 'gu' ? 'લાઇવ' : 'Live'}
                        </div>
                    </div>
                    <div className="space-y-3">
                        {mandiPrices.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center font-bold text-emerald-700 text-xs">
                                        {item.crop[0]}
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm">
                                          {language === 'hi' && item.crop === 'Wheat' ? 'गेहूं' :
                                           language === 'hi' && item.crop === 'Rice' ? 'चावल' :
                                           language === 'hi' && item.crop === 'Tomato' ? 'टमाटर' :
                                           language === 'hi' && item.crop === 'Onion' ? 'प्याज' :
                                           language === 'mr' && item.crop === 'Wheat' ? 'गहू' :
                                           language === 'mr' && item.crop === 'Rice' ? 'तांदूळ' :
                                           language === 'mr' && item.crop === 'Tomato' ? 'टोमॅटो' :
                                           language === 'mr' && item.crop === 'Onion' ? 'कांदा' :
                                           language === 'te' && item.crop === 'Wheat' ? 'గోధుమలు' :
                                           language === 'te' && item.crop === 'Rice' ? 'వరి' :
                                           language === 'te' && item.crop === 'Tomato' ? 'టమాటా' :
                                           language === 'te' && item.crop === 'Onion' ? 'ఉల్లిపాయ' :
                                           language === 'gu' && item.crop === 'Wheat' ? 'ઘઉં' :
                                           language === 'gu' && item.crop === 'Rice' ? 'ચોખા' :
                                           language === 'gu' && item.crop === 'Tomato' ? 'ટામેટા' :
                                           language === 'gu' && item.crop === 'Onion' ? 'ડુંગળી' :
                                           item.crop}
                                        </div>
                                        <div className="text-[10px] text-slate-400">{item.mandi} {language === 'hi' ? 'मंडी' : language === 'mr' ? 'मंडी' : language === 'te' ? 'మండి' : language === 'gu' ? 'મંડી' : 'Mandi'}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-sm">₹{item.price} / {language === 'hi' ? 'क्विंटल' : language === 'mr' ? 'क्विंटल' : language === 'te' ? 'క్వింటాల్' : 'Quintal'}</div>
                                    <div className={`text-[10px] flex items-center justify-end gap-1 font-bold ${item.trend === 'up' ? 'text-emerald-500' : item.trend === 'down' ? 'text-rose-500' : 'text-slate-400'}`}>
                                        {item.trend === 'up' 
                                          ? (language === 'hi' ? '▲ तेजी' : language === 'mr' ? '▲ तेजी' : language === 'te' ? '▲ పెరిగింది' : language === 'gu' ? '▲ તેજી' : '▲ Up')
                                          : item.trend === 'down'
                                            ? (language === 'hi' ? '▼ मंदी' : language === 'mr' ? '▼ मंदी' : language === 'te' ? '▼ తగ్గింది' : language === 'gu' ? '▼ મંદી' : '▼ Down')
                                            : (language === 'hi' ? '● स्थिर' : language === 'mr' ? '● स्थिर' : language === 'te' ? '● స్థిరంగా' : language === 'gu' ? '● સ્થિર' : '● Stable')
                                        }
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <SectionTitle>MSP 2024-25</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl text-center">
                        <div className="text-emerald-800 font-bold mb-1">Wheat</div>
                        <div className="text-xl font-bold text-slate-900">₹2,275</div>
                        <div className="text-[10px] text-emerald-600 font-medium">Per Quintal</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-center">
                        <div className="text-amber-800 font-bold mb-1">Rice (Paddy)</div>
                        <div className="text-xl font-bold text-slate-900">₹2,183</div>
                        <div className="text-[10px] text-amber-600 font-medium">Per Quintal</div>
                    </div>
                </div>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-[2rem] border border-slate-100 text-center shadow-sm">
                <div className="relative inline-block mb-4">
                  <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} className="w-24 h-24 rounded-full ring-4 ring-emerald-50 shadow-lg" alt="Profile" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 border-4 border-white rounded-full" />
                </div>
                <h2 className="text-xl font-heading font-black text-slate-900 leading-none">{user.displayName}</h2>
                <p className="text-slate-400 text-xs font-bold uppercase mt-2 tracking-widest">{role} • Verified</p>
                <div className="mt-6 pt-6 border-t border-slate-50 flex justify-around">
                   <div className="text-center">
                     <div className="text-lg font-black text-slate-900">12</div>
                     <div className="text-[10px] text-slate-400 uppercase font-bold">Records</div>
                   </div>
                   <div className="text-center">
                     <div className="text-lg font-black text-slate-900">4.8</div>
                     <div className="text-[10px] text-slate-400 uppercase font-bold">Soil Score</div>
                   </div>
                </div>
              </div>

              <SectionTitle>Hardware Setup</SectionTitle>
              <div className="bg-emerald-900 rounded-[2rem] p-6 text-white shadow-xl relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <Cpu className="text-emerald-400" />
                    <h3 className="font-heading font-bold text-lg">IoT Sensor Guide</h3>
                  </div>
                  <p className="text-xs text-emerald-200 mb-6 leading-relaxed">Learn how to build and connect your own live soil monitoring hardware.</p>
                  
                  <div className="space-y-4">
                    <HardwareItem 
                      num="01" 
                      title="Required Sensors" 
                      desc="NPK (RS485), pH Probe, Moisture, and Temperature sensors." 
                    />
                    <HardwareItem 
                      num="02" 
                      title="The Controller" 
                      desc="Use an ESP32 or Arduino with a WiFi/Bluetooth module." 
                    />
                    <HardwareItem 
                      num="03" 
                      title="Cloud Sync" 
                      desc="Connect to Firebase to see live data in this dashboard." 
                    />
                  </div>
                  
                  <button 
                    onClick={() => setShowHardwareGuide(true)}
                    className="w-full mt-6 py-4 bg-emerald-500 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
                  >
                    View DIY Guide
                  </button>
                </div>
                <div className="absolute right-[-20px] bottom-[-20px] opacity-10">
                  <Settings size={180} />
                </div>
              </div>

              {/* Hardware Guide Modal */}
              <AnimatePresence>
                {showHardwareGuide && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4"
                  >
                    <motion.div 
                      initial={{ y: 100 }}
                      animate={{ y: 0 }}
                      className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 max-h-[80vh] overflow-y-auto"
                    >
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-heading font-black text-slate-900 uppercase tracking-tight">DIY Sensor Guide</h2>
                        <button onClick={() => setShowHardwareGuide(false)} className="p-2 bg-slate-100 rounded-full"><Plus className="rotate-45" /></button>
                      </div>

                      <div className="space-y-8">
                        <div>
                          <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Cpu size={16} /> Your Pi 4 + ADS1115 Setup
                          </h3>
                          <div className="grid grid-cols-1 gap-3">
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm font-black text-emerald-600">01</div>
                              <div>
                                <div className="font-bold text-slate-800 text-sm">ADS1115 (I2C ADC)</div>
                                <div className="text-[10px] text-slate-400">Pins: SDA (Pin 3), SCL (Pin 5), 3.3V (Pin 1), GND (Pin 6)</div>
                              </div>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm font-black text-blue-600">02</div>
                              <div>
                                <div className="font-bold text-slate-800 text-sm">Analog Core Sensors</div>
                                <div className="text-[10px] text-slate-400">pH (ADS1115 A0), TDS (ADS1115 A1), Moisture (ADS1115 A2)</div>
                              </div>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm font-black text-teal-600">03</div>
                              <div>
                                <div className="font-bold text-slate-800 text-sm">DHT11 Temperature & Humidity</div>
                                <div className="text-[10px] text-slate-400">Connect Data pin to GPIO4 (Pin 7), VCC to 3.3V, GND to GND</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Settings size={16} /> Connection Architecture
                          </h3>
                          <div className="space-y-4">
                            <div className="flex gap-4">
                              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-black shrink-0">1</div>
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                <span className="font-bold text-slate-800">I2C Protocol:</span> Enable I2C config in <code className="font-mono bg-slate-100 px-1 rounded py-0.5">sudo raspi-config</code> so the Pi 4 B can communicate with your ADS1115 ADC converter.
                              </p>
                            </div>
                            <div className="flex gap-4">
                              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-black shrink-0">2</div>
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                <span className="font-bold text-slate-800">TDS/NPK Nutrient Proxy:</span> The TDS readings (dissolved minerals) are mapped to proxy nitrogen (N), phosphorus (P), and potassium (K) levels in the Python web-service.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-black text-purple-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Cpu size={16} /> Python Sensor Probe Code
                          </h3>
                          <div className="bg-slate-900 rounded-2xl p-4 font-mono text-[9px] text-emerald-400 overflow-x-auto">
                            <pre>{`import time
import board
import busio
import adafruit_dht
import adafruit_ads1x15.ads1115 as ADS
from adafruit_ads1x15.analog_in import AnalogIn

# Connect I2C & ADS1115
i2c = busio.I2C(board.SCL, board.SDA)
ads = ADS.ADS1115(i2c)

# Create analog input channels
ph_sensor = AnalogIn(ads, 0)        # pH on A0
tds_sensor = AnalogIn(ads, 1)       # TDS on A1
moisture_sensor = AnalogIn(ads, 2)  # Moisture on A2

# DHT11 on GPIO4 (Pin 7)
dht_device = adafruit_dht.DHT11(board.D4)

def clamp(value, min_value=0, max_value=100):
    return max(min_value, min(value, max_value))

def estimate_npk_percent(ph, tds, moisture):
    nitrogen = (tds / 1500) * 100
    if moisture < 20:
        nitrogen *= 0.7
    if ph < 5.5 or ph > 8:
        nitrogen *= 0.8

    phosphorus = (tds / 1800) * 100
    if 6 <= ph <= 7.5:
        phosphorus *= 1.1
    else:
        phosphorus *= 0.8

    potassium = (tds / 1300) * 100
    if moisture > 40:
        potassium *= 1.1

    return (
        clamp(nitrogen),
        clamp(phosphorus),
        clamp(potassium)
    )

while True:
    try:
        ph_voltage = ph_sensor.voltage
        tds_voltage = tds_sensor.voltage
        moisture_voltage = moisture_sensor.voltage

        # Normalized pH Calibration
        ph_value = 7 + ((1.0 - ph_voltage) * 1.5)
        ph_value = max(5.0, min(8.5, ph_value))

        # TDS in PPM
        tds_ppm = tds_voltage * 500

        # Moisture percentage
        moisture_percent = clamp((moisture_voltage / 3.3) * 100)

        # DHT11
        try:
            temperature = dht_device.temperature
            humidity = dht_device.humidity
        except Exception:
            temperature = 0
            humidity = 0

        # Estimate NPK
        n, p, k = estimate_npk_percent(ph_value, tds_ppm, moisture_percent)

        print(f"pH: {ph_value:.2f} | TDS: {tds_ppm:.0f} ppm | Moisture: {moisture_percent:.1f}%")
        print(f"NPK (%): Temp: {temperature}C | Nitrogen: {n:.1f}% | Phosphorus: {p:.1f}%")
        
    except KeyboardInterrupt:
        break
    time.sleep(3.0)`}</pre>
                          </div>
                        </div>

                        <button 
                          onClick={() => setShowHardwareGuide(false)}
                          className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl"
                        >
                          Got it, Thanks!
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              <SectionTitle>
                {language === 'hi' ? 'मोबाइल ऐप और एपीके' : 
                 language === 'mr' ? 'मोबाईल ॲप आणि एपीके' : 
                 language === 'te' ? 'మొబైల్ యాప్ & APK' : 
                 language === 'gu' ? 'મોબાઇલ એપ અને APK' : 
                 'Mobile App & APK'}
              </SectionTitle>
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-[2rem] p-6 text-white shadow-xl relative overflow-hidden mb-6">
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <Smartphone className="text-emerald-300 animate-pulse" />
                    <h3 className="font-heading font-bold text-lg">
                      {language === 'hi' ? 'कृषि कनेक्ट मोबाइल' : 
                       language === 'mr' ? 'कृषी कनेक्ट मोबाईल' : 
                       language === 'te' ? 'కృషి కనెక్ట్ మొబైల్' : 
                       language === 'gu' ? 'કૃષિ કનેક્ટ મોબાઇલ' : 
                       'Krushi Connect Mobile'}
                    </h3>
                  </div>
                  <p className="text-xs text-emerald-100 mb-6 leading-relaxed">
                    {language === 'hi' ? 'अपने फोन पर ऐप इंस्टॉल करें या ऑफ़लाइन वितरण के लिए सीधे अपनी पसंद का एपीके फ़ाइल गाइड कॉन्फ़िगर करें।' : 
                     language === 'mr' ? 'तुमच्या फोनवर ॲप इंस्टॉल करा किंवा ऑफलाइन वितरणासाठी थेट मूळ एपीके फाईल मार्गदर्शिका कॉन्फिगर करा.' : 
                     language === 'te' ? 'మీ మొబైల్లో యాప్ इన్‌స్టాల్ చేయండి లేదా ఆఫ్‌లైన్ వినియోగం కొరకు APK గైడ్ చూడండి.' : 
                     language === 'gu' ? 'તમારા ફોન પર એપ ઇન્સ્ટોલ કરો અથવા ઓફલાઇન વિતરણ માટે સીધા એપીકે ગાઇડ કન્ફિગર કરો.' : 
                     'Install the official app safely on your phone or check guides to pack your own offline native installer APK.'}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleInstallClick}
                      className="py-3 px-2 bg-white text-emerald-800 font-bold rounded-2xl text-xs active:scale-95 transition-transform shadow-md flex items-center justify-center gap-1.5"
                    >
                      <Smartphone size={14} />
                      {language === 'hi' ? 'स्थापित करें' : language === 'mr' ? 'स्थापित करा' : language === 'te' ? 'ఇన్‌స్టాల్ చేయండి' : language === 'gu' ? 'ઇન્સ્ટોલ કરો' : 'Install PWA'}
                    </button>
                    <button
                      onClick={() => setShowApkModal(true)}
                      className="py-3 px-2 bg-emerald-800/60 hover:bg-emerald-800/80 text-white font-bold rounded-2xl text-xs active:scale-95 transition-transform border border-white/10 flex items-center justify-center gap-1.5"
                    >
                      <Settings size={14} />
                      {language === 'hi' ? 'एपीके विवरण' : language === 'mr' ? 'एपीके मार्गदर्शिका' : language === 'te' ? 'APK వివరాలు' : language === 'gu' ? 'APK વિગતો' : 'APK Guide'}
                    </button>
                  </div>
                </div>
                <div className="absolute right-[-20px] bottom-[-20px] opacity-10">
                  <Smartphone size={180} />
                </div>
              </div>

              {/* APK & Mobile Installation Modal */}
              <AnimatePresence>
                {showApkModal && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4"
                  >
                    <motion.div 
                      key="apk-modal-content"
                      initial={{ y: 100 }}
                      animate={{ y: 0 }}
                      className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 max-h-[85vh] overflow-y-auto relative shadow-2xl"
                    >
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <h2 className="text-xl font-heading font-black text-slate-900 uppercase tracking-tight">
                            {language === 'hi' ? 'एपीके और मोबाइल ऐप केंद्र' : 
                             language === 'mr' ? 'एपीके आणि मोबाईल ॲप केंद्र' : 
                             language === 'te' ? 'APK & మొబైల్ యాప్ కేంద్రం' : 
                             'APK & Mobile Center'}
                          </h2>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-1">
                            Official Mobile Resource Center
                          </p>
                        </div>
                        <button onClick={() => setShowApkModal(false)} className="p-2.5 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                          <Plus className="rotate-45 text-slate-600 w-5 h-5" />
                        </button>
                      </div>

                      {/* Interactive Section 1: Scan & Open */}
                      <div className="bg-emerald-50 rounded-3xl p-5 border border-emerald-100/50 mb-6 font-medium">
                        <div className="flex items-start gap-4">
                          <div className="bg-emerald-100 p-2.5 rounded-2xl text-emerald-700 shrink-0">
                            <Activity size={20} className="animate-pulse" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm">
                              {language === 'hi' ? '1. क्यूआर कोड स्कैन करें' : 
                               language === 'mr' ? '1. क्यूआर कोड स्कॅन करा' : 
                               '1. Scan to Load on Phone'}
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                              {language === 'hi' ? 'अपने फोन के कैमरे से इस बारकोड को स्कैन करें ताकि सीधे अपने फोन पर हमारी लाइव सेवा लोड कर सकें।' : 
                               language === 'mr' ? 'तुमच्या फोनच्या कॅमेऱ्याने हा बारकोड स्कॅन करून थेट मोबाईलवर सेवा उघडा.' : 
                               'Scan this QR representation with your phone camera to open and use the application on the go.'}
                            </p>
                          </div>
                        </div>

                        {/* Pixel-perfect Simulated SVG QR Code */}
                        <div className="flex flex-col items-center justify-center mt-6 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm max-w-[200px] mx-auto">
                          <div className="w-28 h-28 bg-slate-900 rounded-lg p-2.5 flex flex-wrap gap-[3px] justify-between relative">
                            <div className="w-8 h-8 border-4 border-white rounded bg-slate-900 shrink-0" />
                            <div className="w-8 h-8 border-4 border-white rounded bg-slate-900 shrink-0 ml-auto" />
                            <div className="w-full h-1 bg-white/20 my-1 rounded" />
                            <div className="w-8 h-8 border-4 border-white rounded bg-slate-900 shrink-0 mt-auto" />
                            <div className="w-4 h-4 bg-emerald-400 absolute top-12 left-12 rounded animate-pulse" />
                            <div className="w-full flex justify-around gap-1 mt-1">
                              <span className="w-1.5 h-1.5 bg-white rounded-full" />
                              <span className="w-1.5 h-1.5 bg-white rounded-full" />
                              <span className="w-1.5 h-1.5 bg-white rounded-full" />
                            </div>
                          </div>
                          <span className="text-[9px] font-mono text-slate-400 font-bold tracking-widest uppercase mt-3">SCAN NOW</span>
                        </div>
                        <div className="text-center mt-3">
                          <code className="text-[10px] bg-white border border-slate-200 text-emerald-700 font-bold px-2.5 py-1 rounded-full select-all font-mono">
                            {window.location.origin}
                          </code>
                        </div>
                      </div>

                      {/* Section 2: How to save as APK via PWA (Self compiling) */}
                      <div className="bg-blue-50/50 rounded-3xl p-5 border border-blue-100/50 mb-6 font-medium">
                        <div className="flex gap-4">
                          <div className="bg-blue-100 p-2.5 rounded-2xl text-blue-700 shrink-0 h-10 w-10 flex items-center justify-center">
                            <Smartphone size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm">
                              {language === 'hi' ? '2. सुरक्षित प्रोग्रेसिव WebAPK विधि (सर्वश्रेष्ठ)' : 
                               language === 'mr' ? '2. सुरक्षित प्रोग्रेसिव WebAPK पद्धत (सर्वोत्तम)' : 
                               '2. Secure Progressive WebAPK'}
                            </h3>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {language === 'hi' ? 'यह ऐप एक पूरी तरह से PWA है। जब आप क्रोम में "होम स्क्रीन पर जोड़ें" दबाते हैं, तो आपका फोन खुद एक सुरक्षित, ऑक्टिमाइज्ड एपीके बनाकर इंस्टॉल कर देता है।' : 
                               language === 'mr' ? 'हे ॲप एक पूर्ण PWA आहे. जेव्हा तुम्ही क्रोममध्ये "होम स्क्रीनवर जोडा" दाबता तेव्हा तुमचा फोन स्वतःच एक सुरक्षित एपीके तयार करतो.' : 
                               'Android compiles a beautiful system-integrated WebAPK on your device when saving to Home Screen. Highly optimized for memory & battery.'}
                            </p>
                          </div>
                        </div>

                        {/* Direct installation controls within PWA support */}
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <button
                            onClick={() => {
                              handleInstallClick();
                              setShowApkModal(false);
                            }}
                            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-widest shadow-md transition-all active:scale-[0.98]"
                          >
                            <Smartphone size={14} />
                            {language === 'hi' ? 'अभी अपने फ़ोन में इंस्टॉल करें' : 'Install Live PWA App'}
                          </button>
                        </div>
                      </div>

                      {/* Section 3: Native Offline Custom APK Compiling */}
                      <div className="bg-purple-50 rounded-3xl p-5 border border-purple-100/40 mb-6 font-medium">
                        <div className="flex gap-4 mb-4">
                          <div className="bg-purple-100 p-2.5 rounded-2xl text-purple-700 shrink-0 h-10 w-10 flex items-center justify-center">
                            <Terminal size={18} />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm">
                              {language === 'hi' ? '3. खुद का ऑफलाइन एपीके (.APK) फाइल बनाएं' : 
                               language === 'mr' ? '3. स्वतःची ऑफलाइन एपीके (.APK) फाइल तयार करा' : 
                               '3. Build Standalone Offline APK'}
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                              {language === 'hi' ? 'अगर आपको दूसरों के साथ शेयर करने (SHAREit / ब्लूटूथ) के लिए एक भौतिक `.apk` फ़ाइल की आवश्यकता है, तो इन कमांड्स का उपयोग करें:' : 
                               language === 'mr' ? 'तुम्हाला शेअरसाठी वास्तविक `.apk` फाईल हवी असल्यास, तुमच्या काँप्युटरवर हे कमांड वापरा:' : 
                               'To build a physical installable compilation package for standalone distribution, use Google Bubblewrap CLI commands on your terminal:'}
                            </p>
                          </div>
                        </div>

                        {/* Interactive Terminal Code Block */}
                        <div className="bg-slate-900 rounded-2xl p-4 font-mono text-[10px] text-emerald-400 overflow-x-auto shadow-inner">
                          <div className="flex items-center justify-between text-slate-500 border-b border-white/5 pb-2 mb-2 text-[8px]">
                            <span>ANDROID COMPILE SYSTEM</span>
                            <span className="text-rose-400">READY</span>
                          </div>
                          <pre>{`# Install google package bundler
npm i -g @bubblewrap/cli

# Setup manifest compilation configuration
bubblewrap init --manifest=${window.location.origin}/manifest.json

# Build your production signed APK
bubblewrap build`}</pre>
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 text-[9px] text-purple-600 font-bold">
                          <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-ping" />
                          <span>{language === 'hi' ? 'यह आपके लिए एक "app-release-signed.apk" फ़ाइल उत्पन्न करेगा।' : 'This outputs "app-release-signed.apk" ready to sideload.'}</span>
                        </div>
                      </div>

                      {/* Close or back button */}
                      <button 
                        onClick={() => setShowApkModal(false)}
                        className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-colors"
                      >
                        {language === 'hi' ? 'वापस जाएँ' : language === 'mr' ? 'मागे जा' : 'Close Guide'}
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-3">
                <MenuButton icon={Settings} label="System Calibration" />
                <MenuButton icon={HelpCircle} label="Technical Support" />
                <button 
                  onClick={() => {
                    localStorage.removeItem('krushi_role');
                    setRole(null);
                    setIsSelectingRole(true);
                  }} 
                  className="w-full flex items-center gap-4 p-5 bg-rose-50 text-rose-600 rounded-3xl font-bold transition-all active:scale-[0.98]"
                >
                  <LogOut size={20} />
                  <span>
                    {language === 'hi' ? 'भूमिका बदलें / खाता रीसेट' : 
                     language === 'mr' ? 'भूमिका बदला / रीसेट' : 
                     language === 'te' ? 'పాత్ర మార్చండి / రీసెట్' : 
                     language === 'gu' ? 'ભૂમિકા બદલો / રીસેટ' : 
                     'Change Role / Reset App'}
                  </span>
                </button>
              </div>
              <div className="pb-10" />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation Bar (Mobile-only, hidden on Desktop since sidebar is active) */}
      <nav className="flex md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-slate-100 px-6 py-4 justify-between items-center z-50">
        <TabButton icon={Home} active={activeTab === 'home'} onClick={() => setActiveTab('home')} label={language === 'hi' ? 'मुख्य' : language === 'mr' ? 'मुख्य' : language === 'te' ? 'హోమ్' : language === 'gu' ? 'મુખ્ય' : 'Home'} />
        
        {role === 'farmer' && (
          <>
            <TabButton icon={ShoppingBag} active={activeTab === 'market'} onClick={() => setActiveTab('market')} label={language === 'hi' ? 'बाजार' : language === 'mr' ? 'बाजार' : language === 'te' ? 'మార్కెట్' : language === 'gu' ? 'બજાર' : 'Market'} />
            <TabButton icon={LineChartIcon} active={activeTab === 'mandi'} onClick={() => setActiveTab('mandi')} label={language === 'hi' ? 'मंडी' : language === 'mr' ? 'मंडी' : language === 'te' ? 'మండి' : language === 'gu' ? 'મંડી' : 'Mandi'} />
            <TabButton icon={MessageSquare} active={activeTab === 'advisor'} onClick={() => setActiveTab('advisor')} label={language === 'hi' ? 'सलाहकार' : language === 'mr' ? 'सल्लागार' : language === 'te' ? 'సలహాదారు' : language === 'gu' ? 'સલાહકાર' : 'Advisor'} />
          </>
        )}

        {role === 'buyer' && (
          <>
            <TabButton icon={ShoppingBag} active={activeTab === 'market'} onClick={() => setActiveTab('market')} label={language === 'hi' ? 'खरीदें' : language === 'mr' ? 'खरेदी' : language === 'te' ? 'కొనుగోలు' : language === 'gu' ? 'ખરીદો' : 'Buy'} />
            <TabButton icon={LineChartIcon} active={activeTab === 'mandi'} onClick={() => setActiveTab('mandi')} label={language === 'hi' ? 'मंडी' : language === 'mr' ? 'मंडी' : language === 'te' ? 'మండి' : language === 'gu' ? 'મંડી' : 'Mandi'} />
          </>
        )}

        <TabButton icon={User} active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} label={language === 'hi' ? 'प्रोफ़ाइल' : language === 'mr' ? 'प्रोफाइल' : language === 'te' ? 'ప్రొఫైల్' : language === 'gu' ? 'પ્રોફાઇલ' : 'Profile'} />
      </nav>

      {/* Raspberry Pi 4 B WiFi Pairing Wizard */}
      <AnimatePresence>
        {showPiConnectModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: 50, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 50, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="absolute top-0 right-0 p-6">
                <button 
                  onClick={() => {
                    setShowPiConnectModal(false);
                    setPiConnectionError(null);
                  }} 
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                >
                  <Plus className="rotate-45" />
                </button>
              </div>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                  <Wifi size={24} className={isConnectingPi ? "animate-bounce" : ""} />
                </div>
                <div>
                  <h2 className="text-xl font-heading font-black text-slate-900 uppercase tracking-tight">Pi 4 WiFi Manager</h2>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Same sub-network WiFi transceiver</p>
                </div>
              </div>

              <div className="space-y-5 overflow-y-auto flex-1 pr-1">
                {piConnectionError && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 text-xs leading-relaxed space-y-2">
                    <div className="flex items-center gap-2 font-black uppercase text-[10px] tracking-wider text-amber-600">
                      <AlertTriangle size={14} /> Link Blocked / Unreachable
                    </div>
                    <p className="whitespace-pre-line text-slate-700">{piConnectionError}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label htmlFor="modal-pi-ip" className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Raspberry Pi Hostname / Local IP</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Terminal size={14} />
                      </div>
                      <input 
                        type="text" 
                        defaultValue={piIpAddress}
                        id="modal-pi-ip"
                        placeholder="192.168.1.50 or raspberrypi.local"
                        className="w-full pl-9 pr-4 py-3 bg-slate-50 rounded-2xl border border-slate-100 font-mono text-sm focus:outline focus:outline-emerald-500"
                        required 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="modal-pi-port" className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Port</label>
                      <input 
                        type="text" 
                        defaultValue={piPort}
                        id="modal-pi-port"
                        placeholder="5000"
                        className="w-full px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100 font-mono text-sm focus:outline focus:outline-emerald-500"
                        required 
                      />
                    </div>
                    <div>
                      <label htmlFor="modal-pi-endpoint" className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">API Endpoint</label>
                      <input 
                        type="text" 
                        defaultValue={piEndpoint}
                        id="modal-pi-endpoint"
                        placeholder="/api/sensor"
                        className="w-full px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100 font-mono text-sm focus:outline focus:outline-emerald-500"
                        required 
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-slate-800 font-heading">Fallback Simulated Link</div>
                        <div className="text-[10px] text-slate-400 max-w-[280px]">Allows demoing sensor analytics securely immediately without hot Raspberry Pi nodes.</div>
                      </div>
                      <input 
                        type="checkbox"
                        defaultChecked={isPiMocked}
                        id="modal-pi-mock"
                        className="w-5 h-5 rounded accent-emerald-600 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1 font-heading">
                    <Cpu size={14} className="text-emerald-600" /> Host Microservice on Pi 4
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                    Ensure your Raspberry Pi 4 B and your phone/computer are connected to the <span className="font-bold text-slate-700">SAME WiFi network</span>, and that this copy-pasteable Flask script is running:
                  </p>
                  <div className="bg-slate-950 rounded-2xl p-4 font-mono text-[9px] text-emerald-400 overflow-x-auto select-all max-h-48">
                    <pre>{`import time
import board
import busio
import adafruit_dht
import adafruit_ads1x15.ads1115 as ADS
from adafruit_ads1x15.analog_in import AnalogIn
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
# CORS is mandatory so the web browser can fetch across WiFi!
CORS(app) 

# Connect I2C & ADS1115 ADC Module
i2c = busio.I2C(board.SCL, board.SDA)
ads = ADS.ADS1115(i2c)

# Create analog input channels
ph_sensor = AnalogIn(ads, 0)        # pH on A0
tds_sensor = AnalogIn(ads, 1)       # TDS on A1
moisture_sensor = AnalogIn(ads, 2)  # Moisture on A2

# DHT11 Temperature & Humidity on GPIO4 (Pin 7)
dht_device = adafruit_dht.DHT11(board.D4)

def clamp(value, min_value=0, max_value=100):
    return max(min_value, min(value, max_value))

def estimate_npk_percent(ph, tds, moisture):
    nitrogen = (tds / 1500) * 100
    if moisture < 20:
        nitrogen *= 0.7
    if ph < 5.5 or ph > 8:
        nitrogen *= 0.8

    phosphorus = (tds / 1800) * 100
    if 6 <= ph <= 7.5:
        phosphorus *= 1.1
    else:
        phosphorus *= 0.8

    potassium = (tds / 1300) * 100
    if moisture > 40:
        potassium *= 1.1

    return (
        clamp(nitrogen),
        clamp(phosphorus),
        clamp(potassium)
    )

@app.route('/api/sensor')
def sensor():
    try:
        ph_voltage = ph_sensor.voltage
        tds_voltage = tds_sensor.voltage
        moisture_voltage = moisture_sensor.voltage

        # 1. Normalize pH (Calibration values)
        ph_value = 7 + ((1.0 - ph_voltage) * 1.5)
        ph_value = max(5.0, min(8.5, ph_value))

        # 2. TDS PPM Calibration
        tds_ppm = tds_voltage * 500

        # 3. Moisture Percent Calibration
        moisture_percent = clamp((moisture_voltage / 3.3) * 100)

        # 4. DHT11 Air Temperature & Humidity
        try:
            temperature = dht_device.temperature
            humidity = dht_device.humidity
            if temperature is None:
                temperature = 0.0
            if humidity is None:
                humidity = 0.0
        except Exception:
            temperature = 0.0
            humidity = 0.0

        # 5. Estimate NPK Components
        nitrogen, phosphorus, potassium = estimate_npk_percent(
            ph_value, tds_ppm, moisture_percent
        )

        # 6. Crop Recommendation & Action Suggestions
        def recommend_crop(ph, moisture, temp):
            if 5.5 <= ph <= 7 and moisture > 45:
                return "Rice"
            elif 6 <= ph <= 7.5 and moisture < 50:
                return "Wheat"
            elif 5.5 <= ph <= 7 and 20 <= temp <= 35:
                return "Tomato"
            elif ph > 7:
                return "Cotton"
            return "Vegetables / Mixed Crop"

        crop = recommend_crop(ph_value, moisture_percent, temperature)

        suggestion = []
        if nitrogen < 40:
            suggestion.append("Add nitrogen fertilizer")
        if phosphorus < 40:
            suggestion.append("Add phosphorus fertilizer")
        if potassium < 40:
            suggestion.append("Add potash")
        if ph_value < 5.5:
            suggestion.append("Soil is acidic")
        elif ph_value > 8:
            suggestion.append("Soil is alkaline")

        return jsonify({
            'moisture': round(moisture_percent, 1),
            'temperature': round(temperature, 1),
            'humidity': round(humidity, 1),
            'ph': round(ph_value, 2),
            'tds': round(tds_ppm, 1),
            'n': round(nitrogen, 1),
            'p': round(phosphorus, 1),
            'k': round(potassium, 1),
            'crop': crop,
            'suggestions': suggestion
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Bind to 0.0.0.0 so other devices on same WiFi connect!
    app.run(host='0.0.0.0', port=5000, debug=True)`}</pre>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 bg-white">
                <button 
                  onClick={async () => {
                    const ip = (document.getElementById('modal-pi-ip') as HTMLInputElement)?.value || '192.168.1.50';
                    const port = (document.getElementById('modal-pi-port') as HTMLInputElement)?.value || '5000';
                    const endpoint = (document.getElementById('modal-pi-endpoint') as HTMLInputElement)?.value || '/api/sensor';
                    const mock = (document.getElementById('modal-pi-mock') as HTMLInputElement)?.checked;
                    await connectRaspberryPi(ip, port, endpoint, mock);
                  }}
                  disabled={isConnectingPi}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isConnectingPi ? (
                    <>
                      <RefreshCw className="animate-spin" size={16} /> Scanning local network...
                    </>
                  ) : (
                    <>
                      <Wifi size={16} /> Connect Raspberry Pi
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
  );
}

function TransportPricing() {
  const [distance, setDistance] = useState(50);
  const [truckSize, setTruckSize] = useState('Medium');
  
  const baseRates: any = { 'Small': 15, 'Medium': 25, 'Large': 40 };
  const estimatedCost = distance * baseRates[truckSize];

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase text-slate-400">Truck Capacity</label>
        <div className="flex gap-2">
          {['Small', 'Medium', 'Large'].map(size => (
            <button 
              key={size}
              onClick={() => setTruckSize(size)}
              className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all ${truckSize === size ? 'bg-orange-600 text-white' : 'bg-slate-50 text-slate-500'}`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <label className="text-[10px] font-black uppercase text-slate-400">Distance (km)</label>
          <span className="text-lg font-black text-slate-900">{distance} km</span>
        </div>
        <input 
          type="range" 
          min="1" 
          max="500" 
          value={distance} 
          onChange={(e) => setDistance(parseInt(e.target.value))}
          className="w-full accent-orange-600"
        />
      </div>
      <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
        <span className="text-sm font-bold text-slate-500">Estimated Cost</span>
        <span className="text-2xl font-black text-orange-600">₹{estimatedCost.toLocaleString()}</span>
      </div>
    </div>
  );
}

function StoragePricing() {
  const [days, setDays] = useState(7);
  const [units, setUnits] = useState(10);
  const ratePerUnitDay = 5; // e.g., ₹5 per quintal per day
  const totalCost = days * units * ratePerUnitDay;

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-6">
       <div className="space-y-4">
        <div className="flex justify-between items-end">
          <label className="text-[10px] font-black uppercase text-slate-400">Total Units (Quintal)</label>
          <span className="text-lg font-black text-slate-900">{units} Qtl</span>
        </div>
        <input 
          type="range" 
          min="1" 
          max="100" 
          value={units} 
          onChange={(e) => setUnits(parseInt(e.target.value))}
          className="w-full accent-purple-600"
        />
      </div>
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <label className="text-[10px] font-black uppercase text-slate-400">Duration (Days)</label>
          <span className="text-lg font-black text-slate-900">{days} Days</span>
        </div>
        <input 
          type="range" 
          min="1" 
          max="90" 
          value={days} 
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="w-full accent-purple-600"
        />
      </div>
      <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
        <span className="text-sm font-bold text-slate-500">Reservation Estimate</span>
        <span className="text-2xl font-black text-purple-600">₹{totalCost.toLocaleString()}</span>
      </div>
    </div>
  );
}

function TabButton({ icon: Icon, active, onClick, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 transition-all relative ${active ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
    >
      {active && (
        <motion.div 
          layoutId="activeTab"
          className="absolute -top-4 w-6 h-1 bg-emerald-600 rounded-full"
        />
      )}
      <Icon className={`w-6 h-6 ${active ? 'fill-emerald-50' : ''}`} />
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function SidebarButton({ icon: Icon, active, onClick, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-xs uppercase tracking-wider relative group ${
        active 
        ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-600/20 font-black' 
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
      }`}
    >
      <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
      <span className="truncate">{label}</span>
      {active && (
        <motion.div 
          layoutId="sidebarActiveIndicator"
          className="absolute right-3.5 w-1.5 h-1.5 bg-white rounded-full"
        />
      )}
    </button>
  );
}
