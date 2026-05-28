'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { Sack, UserProfile, Parcel } from '@/types';
import { PlaneTakeoff, CheckSquare, Square } from 'lucide-react';
import { logAction } from '@/lib/logger';

interface ShipperHandoffViewProps {
  profile: UserProfile;
}

export function ShipperHandoffView({ profile }: ShipperHandoffViewProps) {
  const [closedSacks, setClosedSacks] = useState<Sack[]>([]);
  const [selectedSackIds, setSelectedSackIds] = useState<Set<string>>(new Set());
  const [shipperName, setShipperName] = useState('');
  const [talonReference, setTalonReference] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'sacks'), where('status', '==', 'Fermé'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClosedSacks(snapshot.docs.map(doc => doc.data() as Sack));
    });
    return unsubscribe;
  }, []);

  const toggleSelection = (sackId: string) => {
    const newSet = new Set(selectedSackIds);
    if (newSet.has(sackId)) {
      newSet.delete(sackId);
    } else {
      newSet.add(sackId);
    }
    setSelectedSackIds(newSet);
  };

  const selectAll = () => {
    if (selectedSackIds.size === closedSacks.length) {
      setSelectedSackIds(new Set());
    } else {
      setSelectedSackIds(new Set(closedSacks.map(s => s.id)));
    }
  };

  const handleHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSackIds.size === 0) {
      toast.error('Veuillez sélectionner au moins un sac.');
      return;
    }
    if (!shipperName.trim()) {
      toast.error('Veuillez entrer le nom du transporteur.');
      return;
    }
    if (!talonReference.trim()) {
      toast.error('Veuillez entrer la référence du Talon de Bagage.');
      return;
    }

    setIsSubmitting(true);
    try {
      console.log('Starting handoff process...');
      const now = new Date().toISOString();
      const batch = writeBatch(db);

      for (const sackId of Array.from(selectedSackIds)) {
        console.log('Processing sack:', sackId);
        // Update Sack
        const sackRef = doc(db, 'sacks', sackId);
        batch.update(sackRef, {
          status: 'En Transit',
          updatedAt: now,
          shipperName,
          talonReference,
        });

        // Get Parcels in this Sack and mark as Expédié
        console.log('Fetching parcels for sack:', sackId);
        const qParcels = query(collection(db, 'parcels'), where('sackId', '==', sackId));
        const parcelsSnap = await getDocs(qParcels);
        console.log(`Found ${parcelsSnap.docs.length} parcels in sack ${sackId}`);
        parcelsSnap.docs.forEach((parcelDoc) => {
          const parcel = parcelDoc.data() as Parcel;
          batch.update(parcelDoc.ref, {
            status: 'Expédié',
            updatedAt: now
          });
          // Optimistically log action
          logAction(parcel.id, profile.uid, 'STATUS_CHANGED', { old: parcel.status, new: 'Expédié', method: 'shipper_handoff' }).catch(console.error);
        });
      }

      console.log('Committing batch...');
      
      const commitWithTimeout = () => new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Batch commit timeout (15s)')), 15000);
        batch.commit()
          .then(() => { clearTimeout(timeout); resolve(); })
          .catch((err) => { clearTimeout(timeout); reject(err); });
      });

      await commitWithTimeout();
      
      console.log('Batch committed successfully.');
      toast.success(`${selectedSackIds.size} sacs remis au transporteur avec succès.`);
      
      // Reset form
      setSelectedSackIds(new Set());
      setShipperName('');
      setTalonReference('');
    } catch (error: any) {
      console.error("Handoff Error:", error);
      toast.error('Erreur lors de la remise au transporteur: ' + (error.message || ''));
    } finally {
      console.log('Handoff process finished, releasing lock.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Sacks List */}
      <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center text-gray-900 dark:text-white">
            <PlaneTakeoff className="mr-2 h-6 w-6 text-blue-600 dark:text-blue-400" />
            Ready for shipping
          </h2>
          <button 
            type="button"
            onClick={selectAll}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
          >
            {selectedSackIds.size === closedSacks.length && closedSacks.length > 0 ? (
              <><CheckSquare className="w-4 h-4 mr-1" /> Tout désélectionner</>
            ) : (
              <><Square className="w-4 h-4 mr-1" /> Tout sélectionner</>
            )}
          </button>
        </div>

        {closedSacks.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
            Aucun sac n&apos;est actuellement fermé et prêt à partir.
          </div>
        ) : (
          <div className="space-y-3">
            {closedSacks.map((sack) => (
              <div 
                key={sack.id} 
                onClick={() => toggleSelection(sack.id)}
                className={`flex items-center p-4 rounded-xl border cursor-pointer transition-colors ${
                  selectedSackIds.has(sack.id) 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500/50' 
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex-shrink-0 mr-4 text-blue-500">
                  {selectedSackIds.has(sack.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-400" />}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 dark:text-white">{sack.barcode}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Créé le: {new Date(sack.createdAt).toLocaleDateString('fr-FR')} à {new Date(sack.createdAt).toLocaleTimeString('fr-FR')}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                    {sack.actualWeight ? `${sack.actualWeight} kg` : 'Poids Inconnu'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Handoff Form */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800 h-fit sticky top-6">
        <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-4">
          Remise Transporteur
        </h2>

        <form onSubmit={handleHandoff} className="space-y-5">
          <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 border border-blue-100 dark:border-blue-900/30 mb-4">
            <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
              Sacs sélectionnés: <span className="font-bold text-lg">{selectedSackIds.size}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nom du Transporteur *
            </label>
            <input
              type="text"
              required
              value={shipperName}
              onChange={(e) => setShipperName(e.target.value)}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Ex: Air Madagascar, Kuaidi..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Talon de Bagage (Référence) *
            </label>
            <input
              type="text"
              required
              value={talonReference}
              onChange={(e) => setTalonReference(e.target.value)}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
              placeholder="Saisissez la référence du talon"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || selectedSackIds.size === 0}
            className="w-full flex items-center justify-center rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Traitement en cours...' : 'Valider la remise'}
          </button>
        </form>
      </div>
    </div>
  );
}
