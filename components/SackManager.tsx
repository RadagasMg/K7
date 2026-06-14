'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, query, where, getDocs, or } from 'firebase/firestore';
import { toast } from 'sonner';
import { logAction } from '@/lib/logger';
import { Parcel, UserProfile, Sack } from '@/types';
import { Scan, Plus, Printer, X, Package, CheckCircle, Lock, Unlock, Trash2 } from 'lucide-react';
import Barcode from 'react-barcode';

interface SackManagerProps {
  profile: UserProfile;
}

export function SackManager({ profile }: SackManagerProps) {
  const [sacks, setSacks] = useState<Sack[]>([]);
  const [activeSackId, setActiveSackId] = useState<string | null>(null);
  const [sackParcels, setSackParcels] = useState<Parcel[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [sackToPrint, setSackToPrint] = useState<Sack | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableParcels, setAvailableParcels] = useState<Parcel[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const scanInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLFormElement>(null);

  const [closingSack, setClosingSack] = useState<Sack | null>(null);
  const [actualWeightInput, setActualWeightInput] = useState('');

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch Available Parcels
  useEffect(() => {
    const q = query(
      collection(db, 'parcels'),
      where('status', 'in', ['Entrant', 'Reçu'])
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const parcels = snapshot.docs.map(doc => doc.data() as Parcel)
        .filter(p => !p.sackId);
      
      // Sort by creation date or just tracking number
      parcels.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setAvailableParcels(parcels);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Sacks
  useEffect(() => {
    const q = query(collection(db, 'sacks'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedSacks = snapshot.docs.map(doc => doc.data() as Sack);
      fetchedSacks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setSacks(fetchedSacks);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Parcels for Active Sack
  useEffect(() => {
    if (!activeSackId) {
      setSackParcels([]);
      return;
    }

    const q = query(collection(db, 'parcels'), where('sackId', '==', activeSackId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const parcels = snapshot.docs.map(doc => doc.data() as Parcel);
      parcels.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setSackParcels(parcels);
    });
    return () => unsubscribe();
  }, [activeSackId]);

  // Auto-focus scanner when active sack changes
  useEffect(() => {
    if (activeSackId && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [activeSackId]);

  const handleCreateSack = async () => {
    setIsProcessing(true);
    try {
      const today = new Date();
      const yy = today.getFullYear().toString().slice(-2);
      const mm = (today.getMonth() + 1).toString().padStart(2, '0');
      const dd = today.getDate().toString().padStart(2, '0');
      const datePrefix = `${yy}${mm}${dd}`;

      // Get count of sacks for today to generate NNN
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();
      
      const q = query(
        collection(db, 'sacks'), 
        where('createdAt', '>=', startOfDay),
        where('createdAt', '<=', endOfDay)
      );
      
      const querySnapshot = await getDocs(q);
      const todayCount = querySnapshot.size;
      const nnn = (todayCount + 1).toString().padStart(3, '0');
      
      const barcode = `K7PK-${datePrefix}${nnn}`;
      const now = new Date().toISOString();
      
      const newSack: Sack = {
        id: barcode,
        barcode: barcode,
        status: 'Ouvert',
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid
      };

      await setDoc(doc(db, 'sacks', barcode), newSack);
      toast.success(`Pack ${barcode} créé`);
      
      // Auto-select and print
      setActiveSackId(barcode);
      handlePrint(newSack);
    } catch (error) {
      console.error('Error creating pack:', error);
      toast.error('Erreur lors de la création du pack');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = (sack: Sack) => {
    setSackToPrint(sack);
    setTimeout(() => {
      window.print();
      setSackToPrint(null);
      // Refocus scanner after printing
      if (scanInputRef.current) scanInputRef.current.focus();
    }, 100);
  };

  const handleScan = async (e: FormEvent) => {
    e.preventDefault();
    const code = scanInput.trim();
    if (!code || !activeSackId) return;

    setScanInput('');
    if (scanInputRef.current) scanInputRef.current.focus();

    setIsProcessing(true);
    try {
      // Find parcel by tracking number or id
      const q = query(
        collection(db, 'parcels'), 
        or(
          where('trackingNumber', '==', code),
          where('id', '==', code)
        )
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        toast.error(`Colis ${code} introuvable. Veuillez le réceptionner d'abord.`);
        return;
      }

      const parcelDoc = snap.docs[0];
      const parcel = parcelDoc.data() as Parcel;

      if (parcel.sackId) {
        if (parcel.sackId === activeSackId) {
          toast.info(`Le colis ${code} est déjà dans ce sac.`);
        } else {
          toast.error(`Le colis ${code} est déjà dans le sac ${parcel.sackId}.`);
        }
        return;
      }

      // Update parcel
      const now = new Date().toISOString();
      await updateDoc(parcelDoc.ref, {
        sackId: activeSackId,
        status: 'Expédié',
        updatedAt: now
      });

      await logAction(parcel.id, profile.uid, 'PACKED', { sackId: activeSackId, oldStatus: parcel.status, newStatus: 'Expédié' });
      toast.success(`Colis ${code} ajouté au sac`);
      
    } catch (error) {
      console.error('Error scanning parcel into sack:', error);
      toast.error('Erreur lors de l\'ajout du colis');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveFromSack = async (parcel: Parcel) => {
    if (!confirm(`Voulez-vous vraiment retirer le colis ${parcel.trackingNumber} de ce sac ?`)) return;
    
    try {
      await updateDoc(doc(db, 'parcels', parcel.id), {
        sackId: null,
        status: 'Prêt', // Revert to ready
        updatedAt: new Date().toISOString()
      });
      await logAction(parcel.id, profile.uid, 'UNPACKED', { sackId: activeSackId, newStatus: 'Prêt' });
      toast.success(`Colis ${parcel.trackingNumber} retiré du sac`);
      if (scanInputRef.current) scanInputRef.current.focus();
    } catch (error) {
      console.error('Error removing parcel from sack:', error);
      toast.error('Erreur lors du retrait du colis');
    }
  };

  const handleToggleStatusClick = (sack: Sack) => {
    if (sack.status === 'Ouvert') {
      setActualWeightInput(totalWeight.toFixed(2));
      setClosingSack(sack);
    } else if (sack.status !== 'En Transit') {
      toggleSackStatus(sack, 'Ouvert');
    } else {
      toast.error('Impossible de rouvrir ce sac car il est en transit');
    }
  };

  const confirmCloseSack = (e: FormEvent) => {
    e.preventDefault();
    if (!closingSack) return;
    const weight = parseFloat(actualWeightInput);
    if (isNaN(weight) || weight <= 0) {
      toast.error('Poids invalide.');
      return;
    }
    toggleSackStatus(closingSack, 'Fermé', weight);
    setClosingSack(null);
  };

  const toggleSackStatus = async (sack: Sack, newStatus: string, actualWeight?: number) => {
    try {
      const updates: any = {
        status: newStatus,
        updatedAt: new Date().toISOString()
      };
      if (actualWeight !== undefined) {
        updates.actualWeight = actualWeight;
      }

      await updateDoc(doc(db, 'sacks', sack.id), updates);
      toast.success(`Le sac est maintenant ${newStatus}`);
      if (newStatus === 'Ouvert' && scanInputRef.current) {
        setTimeout(() => scanInputRef.current?.focus(), 100);
      }
    } catch (error) {
      console.error('Error toggling sack status:', error);
      toast.error('Erreur lors de la modification du statut');
    }
  };

  const activeSack = sacks.find(s => s.id === activeSackId);
  const totalWeight = sackParcels.reduce((sum, p) => sum + (p.weight || 0), 0);

  return (
    <div className="space-y-6">
      {/* Hidden Print Area */}
      {sackToPrint && (
        <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-[9999] print:flex print:items-start print:justify-center p-8">
          <div className="w-full max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-4">MANIFESTE DE SAC - K7 Logistics</h1>
              <div className="flex justify-center mb-4">
                <Barcode value={sackToPrint.barcode} width={2} height={80} fontSize={20} />
              </div>
              <p className="text-lg text-gray-600">Date: {new Date().toLocaleDateString('fr-FR')} {new Date().toLocaleTimeString('fr-FR')}</p>
              <p className="text-lg font-bold">Poids Total Estimé: {totalWeight.toFixed(2)} kg</p>
              {sackToPrint.actualWeight && <p className="text-xl font-bold mt-2">POIDS DU SAC SCELLÉ: {sackToPrint.actualWeight} kg</p>}
            </div>
            
            {sackParcels.length > 0 ? (
              <table className="w-full text-left border-collapse border border-gray-800 text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-800 px-3 py-2">ID Interne (K7)</th>
                    <th className="border border-gray-800 px-3 py-2">Tracking (Externe)</th>
                    <th className="border border-gray-800 px-3 py-2">Client ID</th>
                    <th className="border border-gray-800 px-3 py-2 text-right">Poids (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {sackParcels.map((p) => (
                    <tr key={p.id}>
                      <td className="border border-gray-800 px-3 py-2 font-mono">{p.id}</td>
                      <td className="border border-gray-800 px-3 py-2">{p.trackingNumber}</td>
                      <td className="border border-gray-800 px-3 py-2 font-mono">{p.clientId || 'Non lié'}</td>
                      <td className="border border-gray-800 px-3 py-2 text-right">{p.weight ? p.weight.toFixed(2) : '-'}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="border border-gray-800 px-3 py-2 font-bold text-right">TOTAL</td>
                    <td className="border border-gray-800 px-3 py-2 font-bold text-right">{totalWeight.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="text-center text-gray-500 italic mt-8">Aucun colis dans ce sac pour le moment. Scannez les colis puis réimprimez le manifeste.</p>
            )}
          </div>
        </div>
      )}

      {!activeSackId ? (
        // --- LIST OF SACKS ---
        <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Gestion du packing</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Créez et gérez les packs à expédier .</p>
            </div>
            <button
              onClick={handleCreateSack}
              disabled={isProcessing}
              className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nouveau Pack
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sacks.map(sack => (
              <div 
                key={sack.id} 
                className={`cursor-pointer rounded-xl border p-5 transition-all hover:shadow-md ${
                  sack.status === 'Ouvert' 
                    ? 'border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-900/10' 
                    : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-800/50'
                }`}
                onClick={() => setActiveSackId(sack.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-lg text-gray-900 dark:text-white">{sack.barcode}</span>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    sack.status === 'Ouvert' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' :
                    sack.status === 'Fermé' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' :
                    'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                  }`}>
                    {sack.status}
                  </span>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Créé le {new Date(sack.createdAt).toLocaleDateString('fr-FR')}
                  {sack.actualWeight && <span className="ml-2">• {sack.actualWeight} kg (Réel)</span>}
                </div>
              </div>
            ))}
            {sacks.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500 dark:text-gray-400">
                Aucun sac créé pour le moment.
              </div>
            )}
          </div>
        </div>
      ) : (
        // --- ACTIVE SACK VIEW ---
        <div className="space-y-6">
          <button
            onClick={() => setActiveSackId(null)}
            className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            ← Retour à la liste des sacs
          </button>

          <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                  {activeSack?.barcode}
                  <span className={`ml-3 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                    activeSack?.status === 'Ouvert' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                  }`}>
                    {activeSack?.status}
                  </span>
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  {sackParcels.length} colis • Poids estimé : {totalWeight.toFixed(2)} kg
                  {activeSack?.actualWeight && <span className="ml-2 font-medium text-gray-900 dark:text-white">• Poids Réel : {activeSack.actualWeight} kg</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => activeSack && handlePrint(activeSack)}
                  className="flex items-center rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimer
                </button>
                {activeSack?.status === 'Ouvert' ? (
                  <button
                    onClick={() => activeSack && handleToggleStatusClick(activeSack)}
                    className="flex items-center rounded-md bg-orange-100 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50"
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    Fermer le sac
                  </button>
                ) : activeSack?.status !== 'En Transit' ? (
                  <button
                    onClick={() => activeSack && handleToggleStatusClick(activeSack)}
                    className="flex items-center rounded-md bg-blue-100 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                  >
                    <Unlock className="mr-2 h-4 w-4" />
                    Rouvrir le sac
                  </button>
                ) : null}
              </div>
            </div>

            {/* Closing Sack Modal */}
            {closingSack && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-xl border border-gray-100 dark:border-gray-800">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Fermer le sac {closingSack.barcode}</h3>
                    <button 
                      onClick={() => setClosingSack(null)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  
                  <form onSubmit={confirmCloseSack} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Poids réel (kg)</label>
                      <p className="mb-2 text-xs text-gray-500">Poids estimé: {totalWeight.toFixed(2)} kg</p>
                      <input
                        type="number"
                        step="0.01"
                        autoFocus
                        value={actualWeightInput}
                        onChange={(e) => setActualWeightInput(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        required
                      />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setClosingSack(null)}
                        className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        Confirmer
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {activeSack?.status === 'Ouvert' && (
              <div className="mb-8 rounded-xl bg-blue-50 dark:bg-blue-900/10 p-6 border border-blue-100 dark:border-blue-900/30">
                <h3 className="mb-4 flex items-center text-lg font-semibold text-blue-900 dark:text-blue-300">
                  <Scan className="mr-2 h-5 w-5" />
                  Ajouter un colis au sac
                </h3>
                <form onSubmit={handleScan} className="flex gap-4 items-start relative max-w-2xl" ref={wrapperRef}>
                  <div className="relative flex-grow">
                    <input
                      ref={scanInputRef}
                      type="text"
                      value={scanInput}
                      onChange={(e) => {
                        setScanInput(e.target.value);
                        setShowDropdown(true);
                      }}
                      onFocus={() => setShowDropdown(true)}
                      className="block w-full rounded-md border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3 text-lg shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Scannez ou sélectionnez le code-barres..."
                      disabled={isProcessing}
                    />
                    
                    {showDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-auto">
                        {availableParcels.filter(p => p.trackingNumber?.toLowerCase().includes(scanInput.toLowerCase()) || p.id?.toLowerCase().includes(scanInput.toLowerCase())).length > 0 ? (
                          <ul className="text-sm">
                            {availableParcels
                              .filter(p => p.trackingNumber?.toLowerCase().includes(scanInput.toLowerCase()) || p.id?.toLowerCase().includes(scanInput.toLowerCase()))
                              .map(parcel => (
                                <li 
                                  key={parcel.id}
                                  className="px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0 flex justify-between items-center"
                                  onClick={() => {
                                    setScanInput(parcel.trackingNumber || parcel.id);
                                    setShowDropdown(false);
                                    if (scanInputRef.current) scanInputRef.current.focus();
                                  }}
                                >
                                  <div>
                                    <span className="font-semibold text-gray-900 dark:text-white block">{parcel.trackingNumber}</span>
                                    {parcel.id !== parcel.trackingNumber && (
                                      <span className="text-xs text-gray-500">ID: {parcel.id}</span>
                                    )}
                                  </div>
                                  <span className="font-mono text-gray-600 dark:text-gray-400 font-medium">
                                    {parcel.weight ? `${parcel.weight} kg` : 'Poids N/A'}
                                  </span>
                                </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="px-4 py-3 text-sm text-gray-500">Aucun colis disponible</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="rounded-md bg-blue-600 px-8 py-3 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    Ajouter
                  </button>
                </form>
              </div>
            )}

            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Contenu du sac</h3>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Tracking</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Poids</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Date d&apos;ajout</th>
                      {activeSack?.status === 'Ouvert' && (
                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
                    {sackParcels.map((parcel) => (
                      <tr key={parcel.id}>
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white flex items-center">
                          <Package className="mr-2 h-4 w-4 text-gray-400" />
                          {parcel.trackingNumber}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {parcel.weight ? `${parcel.weight} kg` : '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {new Date(parcel.updatedAt).toLocaleString('fr-FR')}
                        </td>
                        {activeSack?.status === 'Ouvert' && (
                          <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                            <button
                              onClick={() => handleRemoveFromSack(parcel)}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                              title="Retirer du sac"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {sackParcels.length === 0 && (
                      <tr>
                        <td colSpan={activeSack?.status === 'Ouvert' ? 4 : 3} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                          Ce sac est vide. Scannez des colis pour le remplir.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
