'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { toast } from 'sonner';

export default function LoginPage() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !password) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    const username = name.trim().toLowerCase();
    const email = username.includes('@') ? username : `${username}@k7.com`;

    try {
      // Try to sign in
      await signInWithEmailAndPassword(auth, email, password);
      // Let's create it if username is gianno or admin.
      const user = auth.currentUser;
      if (user && (username === 'gianno' || username === 'admin' || username === 'admin2')) {
        const docSnap = await getDoc(doc(db, 'users', user.uid));
        if (!docSnap.exists()) {
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            name: username === 'admin' || username === 'admin2' ? 'Admin K7' : 'Gianno',
            username: username,
            role: 'admin',
            createdAt: new Date().toISOString()
          });
        }
      }
      toast.success('Connexion réussie');
      router.push('/');
    } catch (error: any) {
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
        if ((username === 'gianno' && password === 'azerty1234') || ((username === 'admin' || username === 'admin2') && password === 'password123')) {
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            await setDoc(doc(db, 'users', userCredential.user.uid), {
              uid: userCredential.user.uid,
              name: username === 'admin' || username === 'admin2' ? 'Admin K7' : 'Gianno',
              username: username,
              role: 'admin',
              createdAt: new Date().toISOString()
            });
            
            toast.success('Compte administrateur créé avec succès');
            router.push('/');
          } catch (createError: any) {
            if (createError.code === 'auth/email-already-in-use') {
              console.error('Bootstrap error (already exists):', createError);
              toast.error('Le compte existe déjà mais le mot de passe est incorrect.');
            } else {
              console.error('Bootstrap error:', createError);
              toast.error('Erreur lors de la création du compte administrateur');
            }
          }
          return;
        }
      }
      console.error('Login error:', error);
      if (error.code === 'permission-denied') {
        toast.error("Erreur de permission base de données (Bootstrap)");
      } else {
        toast.error("Nom d'utilisateur ou mot de passe incorrect");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-8 shadow-xl border border-gray-100 dark:border-gray-800">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">K7</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Connectez-vous à votre compte</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Votre nom"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mot de passe</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
