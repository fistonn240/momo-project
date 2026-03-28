/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useMemo, Component } from 'react';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  User, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit, 
  addDoc, 
  getDocs,
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, Transaction, OperationType, FirestoreErrorInfo } from './types';
import { 
  Wallet, 
  Send, 
  History, 
  Plus, 
  Minus, 
  LogOut, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Search, 
  Smartphone,
  AlertCircle,
  CheckCircle2,
  Loader2,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Error Handling Helper
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified || undefined,
      isAnonymous: auth.currentUser?.isAnonymous || undefined,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const ErrorBoundaryFallback = ({ error }: { error: any }) => (
  <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
    <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
      <p className="text-gray-600 mb-6">
        {error?.message?.startsWith('{') 
          ? "A database error occurred. Please check your connection or permissions." 
          : error?.message || "An unexpected error occurred."}
      </p>
      <button 
        onClick={() => window.location.reload()}
        className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
      >
        Reload Application
      </button>
    </div>
  </div>
);

const MomoApp = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [phoneNumberInput, setPhoneNumberInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [receiverPhoneInput, setReceiverPhoneInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Test connection on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    const profileRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(profileRef, (snapshot) => {
      if (snapshot.exists()) {
        setProfile(snapshot.data() as UserProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  useEffect(() => {
    if (!user || !isAuthReady || !profile) return;

    const q = query(
      collection(db, 'transactions'),
      where('senderId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const q2 = query(
      collection(db, 'transactions'),
      where('receiverId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsub1 = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      setTransactions(prev => {
        const combined = [...txs, ...prev.filter(p => p.senderId !== user.uid)];
        return combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    const unsub2 = onSnapshot(q2, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      setTransactions(prev => {
        const combined = [...txs, ...prev.filter(p => p.receiverId !== user.uid)];
        return combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [user, isAuthReady, profile]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setActionLoading(true);
    try {
      // Check if phone number is already taken
      const q = query(collection(db, 'users'), where('phoneNumber', '==', phoneNumberInput));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setMessage({ type: 'error', text: 'Phone number already registered.' });
        setActionLoading(false);
        return;
      }

      const newProfile: UserProfile = {
        uid: user.uid,
        phoneNumber: phoneNumberInput,
        displayName: user.displayName || 'Momo User',
        balance: 1000, // Starting bonus
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setMessage({ type: 'success', text: 'Account created! You received a 1000 bonus.' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransaction = async (type: 'transfer' | 'deposit' | 'withdrawal') => {
    if (!user || !profile) return;
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
      setMessage({ type: 'error', text: 'Invalid amount.' });
      return;
    }

    if ((type === 'transfer' || type === 'withdrawal') && amount > profile.balance) {
      setMessage({ type: 'error', text: 'Insufficient balance.' });
      return;
    }

    setActionLoading(true);
    try {
      let receiverProfile: UserProfile | null = null;
      if (type === 'transfer') {
        const q = query(collection(db, 'users'), where('phoneNumber', '==', receiverPhoneInput));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
          setMessage({ type: 'error', text: 'Receiver not found.' });
          setActionLoading(false);
          return;
        }
        receiverProfile = querySnapshot.docs[0].data() as UserProfile;
        if (receiverProfile.uid === user.uid) {
          setMessage({ type: 'error', text: 'Cannot send money to yourself.' });
          setActionLoading(false);
          return;
        }
      }

      const tx: Omit<Transaction, 'id'> = {
        senderId: type === 'deposit' ? null : user.uid,
        receiverId: type === 'withdrawal' ? null : (type === 'transfer' ? receiverProfile!.uid : user.uid),
        amount,
        type,
        status: 'completed',
        timestamp: new Date().toISOString(),
        senderPhone: profile.phoneNumber,
        receiverPhone: type === 'transfer' ? receiverPhoneInput : (type === 'deposit' ? profile.phoneNumber : undefined),
      };

      await addDoc(collection(db, 'transactions'), tx);

      // Update balances
      if (type === 'deposit') {
        await updateDoc(doc(db, 'users', user.uid), { balance: profile.balance + amount });
      } else if (type === 'withdrawal') {
        await updateDoc(doc(db, 'users', user.uid), { balance: profile.balance - amount });
      } else if (type === 'transfer' && receiverProfile) {
        await updateDoc(doc(db, 'users', user.uid), { balance: profile.balance - amount });
        await updateDoc(doc(db, 'users', receiverProfile.uid), { balance: receiverProfile.balance + amount });
      }

      setMessage({ type: 'success', text: `${type.charAt(0).toUpperCase() + type.slice(1)} successful!` });
      setShowSendModal(false);
      setShowDepositModal(false);
      setShowWithdrawModal(false);
      setAmountInput('');
      setReceiverPhoneInput('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center"
        >
          <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Wallet className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Momo System</h1>
          <p className="text-gray-500 mb-8">Secure, fast, and reliable mobile money transfers.</p>
          <button 
            onClick={handleLogin}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-200"
          >
            <img src="https://www.gstatic.com/firebase/static/bin/urls/google.png" alt="Google" className="w-6 h-6" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Complete Setup</h2>
          <p className="text-gray-500 mb-6">Please enter your phone number to activate your Momo wallet.</p>
          <form onSubmit={handleCreateProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number</label>
              <div className="relative">
                <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  type="tel" 
                  required
                  placeholder="e.g. 0712345678"
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={phoneNumberInput}
                  onChange={(e) => setPhoneNumberInput(e.target.value)}
                />
              </div>
            </div>
            <button 
              type="submit"
              disabled={actionLoading}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Activate Wallet'}
            </button>
          </form>
          {message && (
            <div className={`mt-4 p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <p className="text-sm font-medium">{message.text}</p>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-6 h-6 text-blue-600" />
            <span className="font-bold text-xl text-slate-900">Momo</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-bold text-slate-900">{profile.displayName}</span>
              <span className="text-xs text-slate-500">{profile.phoneNumber}</span>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Balance Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-600 rounded-[2rem] p-8 text-white shadow-2xl shadow-blue-200 mb-8 relative overflow-hidden"
        >
          <div className="relative z-10">
            <p className="text-blue-100 font-medium mb-2">Available Balance</p>
            <h2 className="text-5xl font-black mb-8">
              {profile.balance.toLocaleString()} <span className="text-2xl font-normal text-blue-200">RWF</span>
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <button 
                onClick={() => setShowSendModal(true)}
                className="bg-white/20 backdrop-blur-md hover:bg-white/30 p-4 rounded-2xl flex flex-col items-center gap-2 transition-all"
              >
                <Send className="w-6 h-6" />
                <span className="text-xs font-bold">Send</span>
              </button>
              <button 
                onClick={() => setShowDepositModal(true)}
                className="bg-white/20 backdrop-blur-md hover:bg-white/30 p-4 rounded-2xl flex flex-col items-center gap-2 transition-all"
              >
                <Plus className="w-6 h-6" />
                <span className="text-xs font-bold">Deposit</span>
              </button>
              <button 
                onClick={() => setShowWithdrawModal(true)}
                className="bg-white/20 backdrop-blur-md hover:bg-white/30 p-4 rounded-2xl flex flex-col items-center gap-2 transition-all"
              >
                <Minus className="w-6 h-6" />
                <span className="text-xs font-bold">Withdraw</span>
              </button>
            </div>
          </div>
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl"></div>
        </motion.div>

        {/* Transactions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              Recent Transactions
            </h3>
          </div>

          <div className="space-y-3">
            {transactions.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-slate-100">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <History className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-slate-500">No transactions yet.</p>
              </div>
            ) : (
              transactions.map((tx) => (
                <motion.div 
                  key={tx.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      tx.type === 'deposit' ? 'bg-green-100 text-green-600' : 
                      tx.type === 'withdrawal' ? 'bg-red-100 text-red-600' : 
                      tx.senderId === user.uid ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {tx.type === 'deposit' ? <ArrowDownLeft className="w-6 h-6" /> : 
                       tx.type === 'withdrawal' ? <ArrowUpRight className="w-6 h-6" /> : 
                       tx.senderId === user.uid ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownLeft className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">
                        {tx.type === 'deposit' ? 'Deposit' : 
                         tx.type === 'withdrawal' ? 'Withdrawal' : 
                         tx.senderId === user.uid ? `To ${tx.receiverPhone}` : `From ${tx.senderPhone}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(tx.timestamp).toLocaleDateString()} • {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${
                      tx.type === 'deposit' || (tx.type === 'transfer' && tx.receiverId === user.uid) ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {tx.type === 'deposit' || (tx.type === 'transfer' && tx.receiverId === user.uid) ? '+' : '-'}
                      {tx.amount.toLocaleString()}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{tx.status}</p>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {(showSendModal || showDepositModal || showWithdrawModal) && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowSendModal(false);
                setShowDepositModal(false);
                setShowWithdrawModal(false);
                setMessage(null);
              }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-8 relative z-10 shadow-2xl"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                {showSendModal ? <Send className="w-6 h-6 text-blue-600" /> : 
                 showDepositModal ? <Plus className="w-6 h-6 text-green-600" /> : <Minus className="w-6 h-6 text-red-600" />}
                {showSendModal ? 'Send Money' : showDepositModal ? 'Deposit Funds' : 'Withdraw Funds'}
              </h2>

              <div className="space-y-4">
                {showSendModal && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Receiver Phone Number</label>
                    <div className="relative">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <input 
                        type="tel" 
                        placeholder="0712345678"
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={receiverPhoneInput}
                        onChange={(e) => setReceiverPhoneInput(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Amount (RWF)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">RWF</span>
                    <input 
                      type="number" 
                      placeholder="0.00"
                      className="w-full pl-16 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xl font-bold"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                    />
                  </div>
                </div>

                {message && (
                  <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    <p className="text-sm font-medium">{message.text}</p>
                  </div>
                )}

                <button 
                  onClick={() => handleTransaction(showSendModal ? 'transfer' : showDepositModal ? 'deposit' : 'withdrawal')}
                  disabled={actionLoading}
                  className={`w-full py-4 rounded-2xl font-bold text-lg text-white transition-all shadow-lg disabled:opacity-50 ${
                    showSendModal ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' : 
                    showDepositModal ? 'bg-green-600 hover:bg-green-700 shadow-green-100' : 'bg-red-600 hover:bg-red-700 shadow-red-100'
                  }`}
                >
                  {actionLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Confirm Transaction'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  return <MomoApp />;
}
