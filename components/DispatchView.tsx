'use client';

import { useState, useRef, FormEvent, useEffect } from 'react';
import { db, storage } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, writeBatch, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'sonner';
import { Parcel, UserProfile } from '@/types';
import { Package, Scan, CheckSquare, Square, Upload, FileText, CheckCircle } from 'lucide-react';
import { logAction } from '@/lib/logger';
import { compressImage } from '@/lib/imageUtils';

interface DispatchViewProps {
  profile: UserProfile;
}

export function DispatchView({ profile }: DispatchViewProps) {
  const [scanInput, setScanInput] = useState('');
  const [clientParcels, setClientParcels] = useState<Parcel[]>([]);
  const [selectedParcelIds, setSelectedParcelIds] = useState<Set<string>>(new Set());
  const [podImage, setPodImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showDropdown, setShowDropdown] = useState(false);
  const [allReadyParcels, setAllReadyParcels] = useState<Parcel[]>([]);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLFormElement>(null);

  // Fetch all Ready Parcels
  useEffect(() => {
    const q = query(collection(db, 'parcels'), where('status', '==', 'Prêt'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const parcels = snapshot.docs.map(doc => doc.data() as Parcel);
      parcels.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setAllReadyParcels(parcels);
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

  const handleScan = async (e: FormEvent) => {
    e.preventDefault();
    const code = scanInput.trim().toUpperCase();
    if (!code) return;

    setScanInput('');
    setShowDropdown(false);
    if (scanInputRef.current) scanInputRef.current.focus();

    // The user scans a specific parcel ID
    const snap = await getDocs(query(collection(db, 'parcels'), where('id', '==', code)));
    if (snap.empty) {
      toast.error(`Colis ${code} introuvable.`);
      return;
    }
    const parcel = snap.docs[0].data() as Parcel;

    if (parcel.status !== 'Prêt') {
      toast.error(`Le colis ${code} n'est pas au statut "Prêt" (actuel: ${parcel.status}).`);
      return;
    }

    // Check if it's already in the list
    if (clientParcels.some(p => p.id === parcel.id)) {
      toast.info(`Le colis ${code} est déjà dans la liste.`);
      return;
    }

    setClientParcels(prev => [...prev, parcel]);
    // Auto-select the newly added parcel
    setSelectedParcelIds(prev => {
      const next = new Set(prev);
      next.add(parcel.id);
      return next;
    });
    
    toast.success(`Colis ${code} ajouté à la sélection.`);
  };

  const toggleSelection = (parcelId: string) => {
    const newSet = new Set(selectedParcelIds);
    if (newSet.has(parcelId)) {
      newSet.delete(parcelId);
    } else {
      newSet.add(parcelId);
    }
    setSelectedParcelIds(newSet);
  };

  const uploadPod = async (file: File | Blob): Promise<string> => {
    const timestamp = Date.now();
    let fileExt = 'jpg';
    if (file.type === 'application/pdf') fileExt = 'pdf';
    else if ('name' in file && file.name && file.name.includes('.')) {
      fileExt = file.name.split('.').pop() || 'jpg';
    }
    
    // Store POD image
    const originalRef = ref(storage, `parcels/pod/pod_${timestamp}.${fileExt}`);
    await uploadBytes(originalRef, file);
    return await getDownloadURL(originalRef);
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedParcelIds.size === 0) {
      toast.error('Veuillez sélectionner au moins un colis à livrer.');
      return;
    }

    // POD image is optimal to have, but let's make it mandatory for accountability
    if (!podImage) {
      toast.error('Veuillez uploader la preuve de livraison (POD ou signature).');
      return;
    }

    setIsSubmitting(true);
    try {
      let podUrl = '';
      if (podImage) {
        if (podImage.type.startsWith('image/')) {
           try {
              const compressed = await compressImage(podImage, 1200, 1200);
              podUrl = await uploadPod(compressed as File); // Needs slight cast or use Blob in uploadPod
           } catch {
              podUrl = await uploadPod(podImage);
           }
        } else {
           podUrl = await uploadPod(podImage);
        }
      }

      const now = new Date().toISOString();
      const batch = writeBatch(db);

      for (const parcelId of Array.from(selectedParcelIds)) {
        const parcelRef = doc(db, 'parcels', parcelId);
        batch.update(parcelRef, {
          status: 'Livré',
          updatedAt: now,
          podImageUrl: podUrl,
        });
      }

      await batch.commit();
      
      // Log actions separately (not in batch to avoid complexity if logs structure is separate)
      for (const parcelId of Array.from(selectedParcelIds)) {
        await logAction(parcelId, profile.uid, 'STATUS_CHANGED', { old: 'Prêt', new: 'Livré', method: 'dispatch_pod' }).catch(console.error);
      }

      toast.success(`${selectedParcelIds.size} colis marqués comme Livrés.`);
      
      // Reset
      const remaining = clientParcels.filter(p => !selectedParcelIds.has(p.id));
      setClientParcels(remaining);
      setSelectedParcelIds(new Set(remaining.map(p => p.id)));
      setPodImage(null);

    } catch (error) {
      console.error(error);
      toast.error('Erreur lors de la validation de la livraison.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Parcels List */}
      <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h2 className="mb-4 text-xl font-bold flex items-center text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-4">
          <CheckCircle className="mr-2 h-6 w-6 text-green-600 dark:text-green-400" />
          Dispatch
        </h2>

        <form onSubmit={handleScan} className="flex gap-4 mb-6 relative" ref={wrapperRef}>
          <div className="relative flex-grow">
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={(e) => {
                const val = e.target.value;
                setScanInput(val);
                setShowDropdown(val.toLowerCase().includes('k'));
              }}
              onFocus={(e) => setShowDropdown(e.target.value.toLowerCase().includes('k'))}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 text-lg uppercase placeholder-normal mb-1"
              placeholder="Scannez ou sélectionnez un Colis K7P-XXX"
              autoFocus
            />
            {showDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-auto text-left">
                {allReadyParcels.filter(p => (p.id || '').toLowerCase().includes(scanInput.toLowerCase()) || (p.trackingNumber || '').toLowerCase().includes(scanInput.toLowerCase())).length > 0 ? (
                  <ul className="text-sm">
                    {allReadyParcels
                      .filter(p => (p.id || '').toLowerCase().includes(scanInput.toLowerCase()) || (p.trackingNumber || '').toLowerCase().includes(scanInput.toLowerCase()))
                      .map(parcel => (
                        <li 
                          key={parcel.id}
                          className="px-4 py-3 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0 flex justify-between items-center"
                          onClick={() => {
                            setScanInput(parcel.id);
                            setShowDropdown(false);
                            if (scanInputRef.current) scanInputRef.current.focus();
                          }}
                        >
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white block">{parcel.id}</span>
                            {parcel.id !== parcel.trackingNumber && parcel.trackingNumber && (
                              <span className="text-xs text-gray-500">Ref: {parcel.trackingNumber}</span>
                            )}
                          </div>
                          <span className="font-mono text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap ml-4">
                            {parcel.weight ? `${parcel.weight} kg` : 'Poids N/A'}
                          </span>
                        </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-500">Aucun colis Prêt trouvé</div>
                )}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="flex items-center justify-center rounded-md bg-green-600 px-6 py-3 text-white hover:bg-green-700 shadow-sm transition-colors"
          >
            <Scan className="h-5 w-5 mr-2" />
            Chercher
          </button>
        </form>

        {clientParcels.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
            Aucun colis prêt à livrer pour le moment. Scannez un colis pour commencer.
          </div>
        ) : (
          <div className="space-y-3">
            {clientParcels.map((parcel) => (
              <div 
                key={parcel.id} 
                onClick={() => toggleSelection(parcel.id)}
                className={`flex items-center p-4 rounded-xl border cursor-pointer transition-colors ${
                  selectedParcelIds.has(parcel.id) 
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-500/50' 
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className={`flex-shrink-0 mr-4 ${selectedParcelIds.has(parcel.id) ? 'text-green-500' : 'text-gray-400'}`}>
                  {selectedParcelIds.has(parcel.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 dark:text-white">{parcel.id}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Ext: {parcel.trackingNumber} | {parcel.weight ? `${parcel.weight} kg` : 'Poids inconnu'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                    Prêt
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dispatch Form */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800 h-fit sticky top-6">
        <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-4">
          Validation de Livraison
        </h2>

        <form onSubmit={handleDispatch} className="space-y-5">
          <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3 border border-green-100 dark:border-green-900/30 mb-4">
            <p className="text-sm text-green-800 dark:text-green-300 font-medium">
              Colis à livrer: <span className="font-bold text-lg">{selectedParcelIds.size}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Preuve de Livraison (POD) *
            </label>
            <div className="mt-1 flex justify-center rounded-md border-2 border-dashed border-gray-300 dark:border-gray-700 px-6 pt-5 pb-6">
              <div className="space-y-1 text-center">
                {podImage ? (
                  <div className="flex flex-col items-center">
                    <FileText className="mx-auto h-12 w-12 text-green-500" />
                    <p className="text-sm font-medium text-green-600 dark:text-green-400 mt-2">Fichier sélectionné</p>
                    <p className="text-xs text-gray-500">{podImage.name}</p>
                    <button 
                      type="button" 
                      onClick={() => setPodImage(null)}
                      className="mt-2 text-xs text-red-500 underline"
                    >
                      Changer
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600 dark:text-gray-400 justify-center">
                      <label
                        htmlFor="pod-upload"
                        className="relative cursor-pointer rounded-md bg-white dark:bg-gray-900 font-medium text-green-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-green-500 focus-within:ring-offset-2 hover:text-green-500 dark:hover:text-green-400"
                      >
                        <span className="p-2 block">Prendre photo / Uploader</span>
                        <input id="pod-upload" name="pod-upload" type="file" className="sr-only" accept="image/*,application/pdf" capture="environment" onChange={(e) => setPodImage(e.target.files?.[0] || null)} />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 pb-1">Signature, photo du client, ou bordereau</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || selectedParcelIds.size === 0 || !podImage}
            className="w-full flex items-center justify-center rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
             {isSubmitting ? 'Validation...' : 'Marquer comme Livrés'}
          </button>
        </form>
      </div>
    </div>
  );
}
