'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, getDoc, doc } from 'firebase/firestore';
import { Parcel } from '@/types';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Package, AlertCircle, Image as ImageIcon } from 'lucide-react';

export default function ClientDashboard() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [parcels, setParcels] = useState<Parcel[]>([]);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'client')) {
      router.push('/');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile || profile.role !== 'client') return;

    const q = query(collection(db, 'parcels'), where('clientId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs
        .map(doc => doc.data() as Parcel)
        .filter(p => !p.isArchived);
      fetched.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setParcels(fetched);
    });

    return () => unsubscribe();
  }, [profile]);

  if (loading || !profile || profile.role !== 'client') return <div className="p-8 text-gray-900 dark:text-gray-100">Chargement...</div>;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Entrant': return 'bg-gray-100 text-gray-800';
      case 'En attente': return 'bg-yellow-100 text-yellow-800';
      case 'Expédié': return 'bg-indigo-100 text-indigo-800';
      case 'Prêt': return 'bg-green-100 text-green-800';
      case 'Livré': return 'bg-gray-200 text-gray-600';
      case 'En Transit': return 'bg-purple-100 text-purple-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <DashboardLayout title="Espace Client">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Parcels List */}
        <div>
          <h2 className="mb-4 text-xl font-semibold text-gray-800 dark:text-gray-100">Mes Colis</h2>
          <div className="space-y-4">
            {parcels.length === 0 ? (
              <div className="rounded-2xl bg-white dark:bg-gray-900 p-8 text-center shadow-sm border border-gray-100 dark:border-gray-800">
                <Package className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="mt-4 text-gray-500 dark:text-gray-400">Vous n&apos;avez aucun colis pour le moment.</p>
              </div>
            ) : (
              parcels.map(parcel => (
                <div key={parcel.id} className="overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-sm border border-gray-100 dark:border-gray-800">
                  <div className="border-b border-gray-50 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-800/20 p-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Package className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                        <span className="font-semibold text-gray-900 dark:text-white">{parcel.trackingNumber}</span>
                      </div>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusColor(parcel.status)}`}>
                        {parcel.status}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 sm:p-6">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Poids</p>
                        <div className="mt-1 flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-white">{parcel.weight ? `${parcel.weight} kg` : '-'}</span>
                        </div>
                      </div>
                      <div className="col-span-1 sm:col-span-2">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Note</p>
                        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{parcel.note || '-'}</p>
                      </div>
                    </div>

                    {/* Images */}
                    {parcel.images && parcel.images.length > 0 && (
                      <div className="mt-6 border-t border-gray-100 dark:border-gray-800/50 pt-4">
                        <p className="mb-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center">
                          <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                          Photos de réception
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {parcel.images.map((img, idx) => {
                            const typeLabels: Record<string, string> = {
                              label: 'Étiquette',
                              scale: 'Balance',
                              opened: 'Ouvert',
                              general: 'Général'
                            };
                            return (
                              <div key={idx} className="relative group">
                                <a href={img.originalUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 hover:opacity-75 transition-opacity">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={img.thumbnailUrl} alt={`Colis ${parcel.trackingNumber}`} className="h-20 w-20 object-cover" />
                                </a>
                                <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-b-lg">
                                  {typeLabels[img.type] || 'Photo'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
