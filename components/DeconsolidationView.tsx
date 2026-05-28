'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, query, where, getDocs, updateDoc, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { Parcel, Sack, UserProfile } from '@/types';
import { Package, Scan, CheckCircle, AlertCircle, Box } from 'lucide-react';
import { logAction } from '@/lib/logger';

interface DeconsolidationViewProps {
  profile: UserProfile;
}

export function DeconsolidationView({ profile }: DeconsolidationViewProps) {
  const [scanInput, setScanInput] = useState('');
  const [activeSack, setActiveSack] = useState<Sack | null>(null);
  const [sackParcels, setSackParcels] = useState<Parcel[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [enTransitSacks, setEnTransitSacks] = useState<Sack[]>([]);
  const [sacksParcelCount, setSacksParcelCount] = useState<Record<string, number>>({});

  const scanInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLFormElement>(null);

  // Fetch Sacks en transit
  useEffect(() => {
    const q = query(
      collection(db, 'sacks'),
      where('status', '==', 'En Transit')
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const sacks = snapshot.docs.map(doc => doc.data() as Sack);
      // Sort sacks by newest first roughly
      sacks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setEnTransitSacks(sacks);
      
      if (sacks.length > 0) {
        let counts: Record<string, number> = {};
        // To avoid state wipeout during await, we accumulate then set
        for (const sack of sacks) {
             const pq = query(collection(db, 'parcels'), where('sackId', '==', sack.barcode));
             const pSnap = await getDocs(pq);
             counts[sack.barcode] = pSnap.size;
        }
        setSacksParcelCount(counts);
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle clicking outside the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus input automatically
  useEffect(() => {
    if (scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [activeSack]);

  const handleScan = async (e: FormEvent) => {
    e.preventDefault();
    const code = scanInput.trim();
    if (!code) return;

    setScanInput('');
    if (scanInputRef.current) scanInputRef.current.focus();

    const now = new Date().toISOString();

    if (code.startsWith('K7PK-')) {
      // 1. Fetch the Sack
      const sackRef = doc(db, 'sacks', code);
      const sackSnap = await getDocs(query(collection(db, 'sacks'), where('barcode', '==', code))); // Or doc fetch if ID is code.
      // Sacks ID are usually code, let's just fetch by barcode query to be safe
      
      let sackDocId = '';
      let sackData: Sack | null = null;
      
      if (!sackSnap.empty) {
        sackDocId = sackSnap.docs[0].id;
        sackData = sackSnap.docs[0].data() as Sack;
      } else {
        // Try fetching direct doc
        const directSnap = await getDocs(query(collection(db, 'sacks'), where('__name__', '==', code)));
        if (!directSnap.empty) {
          sackDocId = directSnap.docs[0].id;
          sackData = directSnap.docs[0].data() as Sack;
        }
      }

      if (!sackData) {
        toast.error(`Sac ${code} introuvable.`);
        return;
      }

      setActiveSack(sackData);

      // Update sack status to "Reçu" (TNR Warehouse tracking)
      if (sackData.status !== 'Reçu') {
         await updateDoc(doc(db, 'sacks', sackDocId), { status: 'Reçu', updatedAt: now });
         toast.success(`Sac ${code} marqué comme Reçu à TNR.`);
      }

      // Fetch parcels for this sack
      const qParcels = query(collection(db, 'parcels'), where('sackId', '==', code));
      const unsubscribe = onSnapshot(qParcels, (snapshot) => {
        setSackParcels(snapshot.docs.map(doc => doc.data() as Parcel));
      });
      // Storing unsubscribe could be managed, for simplicity in prototype, this stays bounded to active sack logic
      return;
    }

    // If scanning a Parcel
    if (!activeSack) {
      toast.error('Veuillez scanner un SAC en premier pour commencer la déconsolidation.');
      return;
    }

    // Find the parcel in the current sack
    const parcel = sackParcels.find(p => p.id === code || p.trackingNumber === code);
    
    if (!parcel) {
      toast.error(`Colis ${code} n'appartient pas au sac ${activeSack.barcode}`);
      return;
    }

    if (parcel.status === 'Prêt' || parcel.status === 'Livré') {
      toast.info(`Colis ${code} déjà traité (${parcel.status})`);
      return;
    }

    // Mark parcel as "Prêt" (Deconsolidated and ready in TNR)
    try {
      await updateDoc(doc(db, 'parcels', parcel.id), { status: 'Prêt', updatedAt: now });
      await logAction(parcel.id, profile.uid, 'STATUS_CHANGED', { old: parcel.status, new: 'Prêt', method: 'deconsolidation_scan' });
      toast.success(`Colis ${code} déconsolidé et Prêt !`);
    } catch (error) {
      console.error(error);
      toast.error('Erreur lors de la mise à jour du colis.');
    }
  };

  const scannedCount = sackParcels.filter(p => p.status === 'Prêt' || p.status === 'Livré').length;
  const progressPercent = sackParcels.length > 0 ? (scannedCount / sackParcels.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h2 className="mb-4 text-xl font-bold flex items-center text-gray-900 dark:text-white">
          <Box className="mr-2 h-6 w-6 text-purple-600 dark:text-purple-400" />
          Reception
        </h2>
        
        <form onSubmit={handleScan} className="flex gap-4 mb-6 relative" ref={wrapperRef}>
          <div className="relative flex-grow">
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={(e) => {
                setScanInput(e.target.value);
                if (!activeSack) setShowDropdown(true);
              }}
              onFocus={() => { if (!activeSack) setShowDropdown(true); }}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-lg"
              placeholder={activeSack ? "Scannez chaque colis sortant du sac (K7P-XXX)" : "Scannez ou sélectionnez un QR de pack (K7PK-XXX)"}
              autoFocus
            />
            {showDropdown && !activeSack && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-auto text-left">
                {enTransitSacks.filter(s => s.barcode.toLowerCase().includes(scanInput.toLowerCase())).length > 0 ? (
                  <ul className="text-sm">
                    {enTransitSacks
                      .filter(s => s.barcode.toLowerCase().includes(scanInput.toLowerCase()))
                      .map(sack => (
                        <li 
                          key={sack.barcode}
                          className="px-4 py-3 hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0 flex justify-between items-center"
                          onClick={() => {
                            setScanInput(sack.barcode);
                            setShowDropdown(false);
                            if (scanInputRef.current) scanInputRef.current.focus();
                          }}
                        >
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white block">{sack.barcode}</span>
                            <span className="text-xs text-gray-500">{sack.shipperName ? `Via ${sack.shipperName}` : 'Pack en transit'}</span>
                          </div>
                          <span className="font-mono text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap ml-4">
                            {sacksParcelCount[sack.barcode] !== undefined ? `${sacksParcelCount[sack.barcode]} colis` : '...'}
                          </span>
                        </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-500">Aucun pack en transit trouvé</div>
                )}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="flex items-center justify-center rounded-md bg-purple-600 px-6 py-3 text-white hover:bg-purple-700 shadow-sm transition-colors"
          >
            <Scan className="h-5 w-5 mr-2" />
            Scanner
          </button>
        </form>

        {activeSack && (
          <div className="bg-purple-50 dark:bg-purple-900/10 p-6 rounded-xl border border-purple-100 dark:border-purple-900/30">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-purple-900 dark:text-purple-300 flex items-center">
                  Sac Courant: {activeSack.barcode}
                  {scannedCount === sackParcels.length && sackParcels.length > 0 && (
                     <span className="ml-3 inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                       <CheckCircle className="mr-1 h-3 w-3" /> Complet
                     </span>
                  )}
                </h3>
                <p className="text-sm text-purple-700 dark:text-purple-400 mt-1">
                  Poids cible du sac: {activeSack.actualWeight || 'Inconnu'} kg
                </p>
              </div>
              <button 
                onClick={() => { setActiveSack(null); setSackParcels([]); }}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white underline"
              >
                Changer de sac
              </button>
            </div>

            <div className="mb-6">
              <div className="flex justify-between text-sm mb-1 text-gray-600 dark:text-gray-400">
                <span>Progression : {scannedCount} / {sackParcels.length} colis</span>
                <span>{progressPercent.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div className="bg-purple-600 h-2.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {sackParcels.map(parcel => {
                  const isScanned = parcel.status === 'Prêt' || parcel.status === 'Livré';
                  return (
                    <li key={parcel.id} className={`p-4 flex items-center justify-between ${isScanned ? 'bg-green-50 dark:bg-green-900/10' : ''}`}>
                      <div className="flex items-center">
                        {isScanned ? (
                          <CheckCircle className="h-5 w-5 text-green-500 mr-3 shrink-0" />
                        ) : (
                          <Package className="h-5 w-5 text-gray-400 mr-3 shrink-0" />
                        )}
                        <div>
                          <p className={`font-mono text-sm font-medium ${isScanned ? 'text-green-900 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                            {parcel.id}
                          </p>
                          <p className="text-xs text-gray-500">
                            ID: {parcel.clientId || 'Non lié'} | Ext: {parcel.trackingNumber}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {parcel.weight && (
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{parcel.weight} kg</span>
                        )}
                        <p className={`text-xs font-semibold mt-1 ${isScanned ? 'text-green-600 dark:text-green-400' : 'text-orange-500 dark:text-orange-400'}`}>
                          {isScanned ? 'Vérifié' : 'En attente scan'}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
