'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export type Role = 'admin' | 'agent' | 'client';

export interface UserProfile {
  uid: string;
  name: string;
  username: string;
  role: Role;
  createdAt: string;
  isDeleted?: boolean;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Listen to user profile in Firestore
        const unsubscribeProfile = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              if (data.isDeleted) {
                auth.signOut();
                setProfile(null);
              } else {
                setProfile(data);
              }
            } else {
              setProfile(null);
            }
            setLoading(false);
          },
          (error: any) => {
            if (error.code === 'permission-denied' || error.message.includes('Missing or insufficient permissions')) {
              // This often happens during sign out when the token is revoked before the listener is detached
              console.log('Profile listener detached due to permission change (likely sign out)');
            } else {
              console.error('Error fetching user profile:', error);
            }
            setLoading(false);
          }
        );
        
        return () => unsubscribeProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
