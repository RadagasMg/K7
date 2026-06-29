import { useState, useEffect, useRef, FormEvent } from 'react';
import { auth, db, storage } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, getDoc, query, where, writeBatch, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'sonner';
import { logAction } from '@/lib/logger';
import { Parcel, UserProfile, ParcelImage, ParcelStatus } from '@/types';
import { ParcelTable } from '@/components/ParcelTable';
import { SackManager } from '@/components/SackManager';
import { Scan, X, Camera, Upload, Package, ShoppingBag } from 'lucide-react';
import { compressImage } from '@/lib/imageUtils';

import { QRCodeSVG } from 'qrcode.react';

// Note: H5Qrcode is imported dynamically below to prevent SSR issues

interface AgentViewProps {
  profile: UserProfile;
}

export function AgentView({ profile }: AgentViewProps) {
  const [activeMainTab, setActiveMainTab] = useState<'colis' | 'sacs'>('colis');
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [trackingInput, setTrackingInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  // States for Mobile Camera Barcode Scanner
  const [isMobile, setIsMobile] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const html5QrcodeRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      setIsMobile(mobile);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (html5QrcodeRef.current) {
        html5QrcodeRef.current.stop().catch(err => console.error('Cleanup scanner error:', err));
      }
    };
  }, []);
  
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editInternalNote, setEditInternalNote] = useState('');
  const [editClientId, setEditClientId] = useState('');
  const [editStatus, setEditStatus] = useState<ParcelStatus | ''>('');
  const [clients, setClients] = useState<UserProfile[]>([]);
  
  const [labelImage, setLabelImage] = useState<File | null>(null);
  const [scaleImage, setScaleImage] = useState<File | null>(null);
  const [openedImage, setOpenedImage] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const labelInputRef = useRef<HTMLInputElement>(null);
  const scaleInputRef = useRef<HTMLInputElement>(null);
  const openedInputRef = useRef<HTMLInputElement>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);

  // Camera chaining logic
  useEffect(() => {
    if (editingParcel) {
      if (labelImage && !scaleImage) {
        // After label is taken, focus weight input or trigger scale camera
        setTimeout(() => {
          if (weightInputRef.current) weightInputRef.current.focus();
        }, 300);
      } else if (scaleImage && !openedImage) {
        // After scale is taken, trigger opened camera
        setTimeout(() => {
          if (openedInputRef.current) openedInputRef.current.click();
        }, 300);
      }
    }
  }, [labelImage, scaleImage, openedImage, editingParcel]);

  useEffect(() => {
    // Fetch clients
    const qClients = query(collection(db, 'users'), where('role', '==', 'client'));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      setClients(snapshot.docs.map(doc => doc.data() as UserProfile));
    });

    let qParcels = query(collection(db, 'parcels'));
    if (profile.agentLocation === 'china') {
      qParcels = query(collection(db, 'parcels'), where('location', '==', 'china'), where('status', '==', 'En Transit'));
    }
    
    const unsubscribe = onSnapshot(qParcels, (snapshot) => {
      const fetchedParcels = snapshot.docs.map(doc => doc.data() as Parcel);
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      const filtered = fetchedParcels.filter(p => {
        if (profile.agentLocation === 'china') return true;
        const isRecent = p.status !== 'Livré' || new Date(p.updatedAt) >= oneMonthAgo;
        return isRecent;
      });
      
      filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setParcels(filtered);
    });

    return () => {
      unsubscribe();
      unsubClients();
    };
  }, [profile.agentLocation]);

  const processScan = async (code: string) => {
    const now = new Date().toISOString();

    // Prevent scanning sack QR codes in intake view
    if (code.startsWith('K7PK-') || code.startsWith('SACK-')) {
      toast.error('Gérer les packs dans les onglets "Packing" ou "Reception".');
      return;
    }

    const existing = parcels.find(p => p.trackingNumber === code || p.id === code);

    if (existing) {
      if (existing.sackId) {
        toast.error(`Colis ${code} est déjà dans le sac ${existing.sackId}`);
        return;
      }
      const newStatus = existing.status === 'Entrant' ? (existing.clientId ? 'Lié' : 'Non lié') : existing.status;
      
      // Store original state for potential rollback
      const originalParcels = parcels;
      
      // Optimistic update
      setParcels(prev => prev.map(p => p.id === existing.id ? { ...p, status: newStatus, updatedAt: now } : p));
      
      try {
        await updateDoc(doc(db, 'parcels', existing.id), { status: newStatus, updatedAt: now });
        if (newStatus !== existing.status) {
          await logAction(existing.id, profile.uid, 'STATUS_CHANGED', { old: existing.status, new: newStatus, method: 'scanner' });
        }
        toast.success(`Colis ${code} scanné`);
      } catch (error) {
        console.error('Error updating parcel on scan:', error);
        // Revert optimistic update
        setParcels(originalParcels);
        toast.error('Erreur lors de la mise à jour du colis');
        return;
      }
      
      // Auto-open edit modal
      setEditingParcel({ ...existing, status: newStatus, updatedAt: now });
      setEditWeight(existing.weight?.toString() || '');
      setEditNote(existing.note || '');
      setEditInternalNote(existing.internalNote || '');
      setEditClientId(existing.clientId || '');
      setEditStatus(newStatus);
      setLabelImage(null);
      setScaleImage(null);
      setOpenedImage(null);
      
      // Trigger first camera
      setTimeout(() => {
        if (labelInputRef.current && !existing.images?.some(i => i.type === 'label')) {
          labelInputRef.current.click();
        }
      }, 500);
    } else {
      const todayDate = new Date();
      const yy = String(todayDate.getFullYear()).slice(-2);
      const mm = String(todayDate.getMonth() + 1).padStart(2, '0');
      const dd = String(todayDate.getDate()).padStart(2, '0');
      const prefix = `K7P-${yy}${mm}${dd}`;

      let maxNN = 0;
      parcels.forEach(p => {
        if (p.id?.startsWith(prefix)) {
          const numPart = p.id.substring(prefix.length);
          const num = parseInt(numPart, 10);
          if (!isNaN(num)) {
            maxNN = Math.max(maxNN, num);
          }
        }
      });
      const newNN = String(maxNN + 1).padStart(2, '0');
      const newId = `${prefix}${newNN}`;

      const newParcel: Parcel = {
        id: newId,
        trackingNumber: code,
        status: 'Non lié',
        createdAt: now,
        updatedAt: now
      };
      
      // Store original parcels for potential rollback
      const originalParcels = parcels;
      
      // Optimistic update
      setParcels(prev => [newParcel, ...prev]);
      
      try {
        await setDoc(doc(db, 'parcels', newId), newParcel);
        await logAction(newId, profile.uid, 'CREATED', { status: 'Non lié', method: 'scanner' });
        toast.success(`Nouveau colis ${code} enregistré`);
      } catch (error) {
        console.error('Error creating new parcel:', error);
        // Revert optimistic update
        setParcels(originalParcels);
        toast.error('Erreur lors de la création du colis');
        return;
      }
      
      // Auto-open edit modal
      setEditingParcel(newParcel);
      setEditWeight('');
      setEditNote('');
      setEditInternalNote('');
      setEditClientId('');
      setEditStatus('Non lié');
      setLabelImage(null);
      setScaleImage(null);
      setOpenedImage(null);

      // Trigger first camera
      setTimeout(() => {
        if (labelInputRef.current) {
          labelInputRef.current.click();
        }
      }, 500);
    }
  };

  const handleScan = async (e: FormEvent) => {
    e.preventDefault();
    const code = trackingInput.trim();
    if (!code) return;

    setTrackingInput('');
    if (inputRef.current) inputRef.current.focus();

    await processScan(code);
  };

  const startScanning = async () => {
    setIsScanning(true);
    try {
      setTimeout(async () => {
        const h = await import('html5-qrcode');
        const H5Qrcode = h.Html5Qrcode;
        const html5QrCode = new H5Qrcode("camera-reader");
        html5QrcodeRef.current = html5QrCode;
        
        const config = {
          fps: 10,
          qrbox: (width: number, height: number) => {
            return { width: Math.floor(width * 0.75), height: Math.floor(height * 0.75) };
          },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          async (decodedText) => {
            await stopScanning();
            await processScan(decodedText);
          },
          () => {}
        );
      }, 300);
    } catch (err) {
      console.error("Camera access error:", err);
      toast.error("Impossible d'accéder à la caméra de l'appareil.");
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
      try {
        await html5QrcodeRef.current.stop();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
    html5QrcodeRef.current = null;
    setIsScanning(false);
  };

  const uploadImage = async (file: File, parcelId: string, type: 'label' | 'scale' | 'opened'): Promise<ParcelImage> => {
    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'jpg';
    const originalRef = ref(storage, `parcels/${parcelId}/${type}_${timestamp}.${ext}`);
    const thumbRef = ref(storage, `parcels/${parcelId}/${type}_${timestamp}_thumb.jpg`);

    await uploadBytes(originalRef, file);
    const originalUrl = await getDownloadURL(originalRef);

    const thumbBlob = await compressImage(file, 400, 400);
    await uploadBytes(thumbRef, thumbBlob);
    const thumbnailUrl = await getDownloadURL(thumbRef);

    return {
      type,
      originalUrl,
      thumbnailUrl,
      uploadedAt: new Date().toISOString()
    };
  };

  const handleSaveEdit = async () => {
    if (!editingParcel) return;
    
    if (!editWeight) {
      toast.error('Le poids est obligatoire.');
      return;
    }

    const hasLabel = editingParcel.images?.some(i => i.type === 'label') || labelImage;
    const hasScale = editingParcel.images?.some(i => i.type === 'scale') || scaleImage;
    const hasOpened = editingParcel.images?.some(i => i.type === 'opened') || openedImage;

    if (!hasLabel || !hasScale || !hasOpened) {
      toast.error('Les 3 photos (étiquette, balance, colis ouvert) sont obligatoires.');
      return;
    }

    setIsUploading(true);
    // Store original parcel for potential rollback
    const originalEditingParcel = editingParcel;
    const originalParcels = parcels;
    
    try {
      const newImages: ParcelImage[] = [];
      if (labelImage) newImages.push(await uploadImage(labelImage, editingParcel.id, 'label'));
      if (scaleImage) newImages.push(await uploadImage(scaleImage, editingParcel.id, 'scale'));
      if (openedImage) newImages.push(await uploadImage(openedImage, editingParcel.id, 'opened'));

      const updates: Partial<Parcel> = {
        updatedAt: new Date().toISOString()
      };
      
      if (newImages.length > 0) {
        updates.images = [...(editingParcel.images || []), ...newImages];
      }

      if (editClientId) {
        updates.clientId = editClientId;
        if (editingParcel.status === 'Non lié' && editStatus === 'Non lié') {
          updates.status = 'Lié';
        }
      }

      if (editStatus) {
        updates.status = editStatus;
      }

      if (editNote) updates.note = editNote;
      if (editInternalNote) updates.internalNote = editInternalNote;

      if (editWeight) {
        const weight = parseFloat(editWeight);
        updates.weight = weight;
      }

      // Optimistic update
      setParcels(prev => prev.map(p => p.id === editingParcel.id ? { ...p, ...updates } : p));
      setEditingParcel(null);
      setLabelImage(null);
      setScaleImage(null);
      setOpenedImage(null);
      
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 100);

      // Execute the database update
      await updateDoc(doc(db, 'parcels', editingParcel.id), updates);
      await logAction(editingParcel.id, profile.uid, 'UPDATED', { ...updates, imagesAdded: newImages.length });
      toast.success('Colis mis à jour');
    } catch (error) {
      console.error('Error updating parcel:', error);
      // Revert optimistic updates
      setParcels(originalParcels);
      setEditingParcel(originalEditingParcel);
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setIsUploading(false);
    }
  };

  const filteredParcels = parcels.filter(p => !p.isArchived).filter(p => {
    if (!searchQuery) return true;
    
    // Only search among these statuses as requested
    const targetStatuses = ['Non lié', 'Lié', 'En attente'];
    if (!targetStatuses.includes(p.status as string)) return false;

    const lowerQuery = searchQuery.toLowerCase();
    const clientName = p.clientName || '';
    const id = p.id || '';
    const tracking = p.trackingNumber || '';

    return tracking.toLowerCase().includes(lowerQuery) || 
           clientName.toLowerCase().includes(lowerQuery) ||
           id.toLowerCase().includes(lowerQuery);
  });

  return (
    <>
    <div className="print:hidden">
      {/* Main Navigation Tabs */}
      <div className="mb-6 flex space-x-2 border-b border-gray-200 dark:border-gray-800 pb-4">
        <button
          onClick={() => setActiveMainTab('colis')}
          className={`flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeMainTab === 'colis'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
          }`}
        >
          <Package className="mr-2 h-4 w-4" />
          réception
        </button>
        {profile.agentLocation !== 'china' && (
          <button
            onClick={() => setActiveMainTab('sacs')}
            className={`flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeMainTab === 'sacs'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}
          >
            <ShoppingBag className="mr-2 h-4 w-4" />
            Packing
          </button>
        )}
      </div>

      {activeMainTab === 'colis' ? (
        <>
          {/* Top Actions */}
          <div className="mb-8">
            {/* Scanner Section */}
            <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between">
              <h2 className="mb-4 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-100">
                <Scan className="mr-2 h-5 w-5 text-blue-600 dark:text-blue-500" />
                Scanner un colis
              </h2>
              <form onSubmit={handleScan} className="flex gap-4 items-center h-[52px]">
                <input
                  ref={inputRef}
                  type="text"
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  autoFocus
                  className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2 text-lg shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  placeholder="Scannez ou entrez..."
                />
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-8 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 h-full whitespace-nowrap"
                >
                  Valider
                </button>
                {isMobile && !isScanning && (
                  <button
                    type="button"
                    onClick={startScanning}
                    className="rounded-md bg-zinc-800 hover:bg-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 px-4 h-full flex items-center justify-center text-white focus:outline-none transition-colors"
                    title="Scanner par caméra"
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                )}
              </form>

              {isScanning && (
                <div className="mt-4 flex flex-col items-center gap-4 bg-gray-50 dark:bg-black/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 aspect-video relative bg-black">
                    <div id="camera-reader" className="w-full h-full"></div>
                  </div>
                  <button
                    type="button"
                    onClick={stopScanning}
                    className="rounded-md bg-rose-600 hover:bg-rose-700 text-white px-6 py-2 text-sm font-medium focus:outline-none transition-colors"
                  >
                    Arrêter le scan caméra
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Parcels List */}
          <div className="mb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  Colis récents
                </h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {filteredParcels.length} colis
                </span>
              </div>
              <input
                type="text"
                placeholder="Rechercher (Non lié, Lié, En attente)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-80 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-4 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              />
            </div>
          </div>
          
          <ParcelTable 
            parcels={filteredParcels} 
            clients={clients}
            profile={profile}
            onEdit={(p) => {
              setEditingParcel(p);
              setEditWeight(p.weight?.toString() || '');
              setEditNote(p.note || '');
              setEditInternalNote(p.internalNote || '');
              setEditClientId(p.clientId || '');
              setEditStatus(p.status);
              setLabelImage(null);
              setScaleImage(null);
              setOpenedImage(null);
            }} 
          />

          {/* Edit Modal */}
          {editingParcel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
              <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-xl my-8 border border-gray-100 dark:border-gray-800">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex flex-col gap-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Modifier {editingParcel.trackingNumber}</h3>
                    <div className="bg-white p-2 rounded-lg inline-block self-start shadow-sm border border-gray-100">
                      <QRCodeSVG value={editingParcel.id} size={100} />
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingParcel(null);
                      setTimeout(() => {
                        if (inputRef.current) inputRef.current.focus();
                      }, 100);
                    }} 
                    className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors" 
                    disabled={isUploading}
                    title="Fermer"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Statut</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as ParcelStatus)}
                        className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none"
                        disabled={isUploading}
                      >
                        <option value="Entrant">Entrant</option>
                        <option value="Non lié">Non lié</option>
                        <option value="Lié">Lié</option>
                        <option value="En attente">En attente</option>
                        <option value="Expédié">Expédié</option>
                        <option value="Prêt">Prêt</option>
                        <option value="Livré">Livré</option>
                      </select>
                    </div>
                    {profile.role !== 'agent' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Client (Optionnel)</label>
                        <select
                          value={editClientId}
                          onChange={(e) => setEditClientId(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none"
                          disabled={isUploading}
                        >
                          <option value="">-- Sélectionner un client --</option>
                          {clients.map(c => (
                            <option key={c.uid} value={c.uid}>{c.name} ({c.username})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Poids (kg) <span className="text-red-500">*</span></label>
                      <input
                        ref={weightInputRef}
                        type="number"
                        step="0.01"
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (scaleInputRef.current) scaleInputRef.current.click();
                          }
                        }}
                        className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none"
                        required
                        disabled={isUploading}
                      />
                    </div>
                  </div>

                  {/* Photos Section */}
                  <div className="rounded-md bg-gray-50 dark:bg-gray-800/50 p-3 border border-gray-200 dark:border-gray-700">
                    <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Photos obligatoires</h4>
                    <div className="space-y-3">
                      {/* Label Image */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">1. Étiquette du colis</label>
                        {editingParcel.images?.some(i => i.type === 'label') ? (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Déjà uploadée</span>
                        ) : (
                          <input
                            ref={labelInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => setLabelImage(e.target.files?.[0] || null)}
                            className="block w-full text-xs text-gray-500 dark:text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white"
                            disabled={isUploading}
                          />
                        )}
                      </div>
                      {/* Scale Image */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">2. Colis sur la balance</label>
                        {editingParcel.images?.some(i => i.type === 'scale') ? (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Déjà uploadée</span>
                        ) : (
                          <input
                            ref={scaleInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => setScaleImage(e.target.files?.[0] || null)}
                            className="block w-full text-xs text-gray-500 dark:text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white"
                            disabled={isUploading}
                          />
                        )}
                      </div>
                      {/* Opened Image */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">3. Colis ouvert</label>
                        {editingParcel.images?.some(i => i.type === 'opened') ? (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Déjà uploadée</span>
                        ) : (
                          <input
                            ref={openedInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => setOpenedImage(e.target.files?.[0] || null)}
                            className="block w-full text-xs text-gray-500 dark:text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white"
                            disabled={isUploading}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {profile.role !== 'agent' && (
                    <div className="rounded-md bg-orange-50 dark:bg-orange-900/20 p-3 border border-orange-100 dark:border-orange-800/50">
                      <label className="mt-1 block text-sm font-medium text-orange-800 dark:text-orange-400">
                        Note interne
                      </label>
                      <textarea
                        value={editInternalNote}
                        onChange={(e) => setEditInternalNote(e.target.value)}
                        rows={2}
                        className="mt-1 block w-full rounded-md border border-orange-300 dark:border-orange-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-orange-500 focus:outline-none"
                        placeholder="Notes visibles uniquement par l'équipe"
                        disabled={isUploading}
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Note</label>
                    <textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none"
                      disabled={isUploading}
                    />
                  </div>
                  <div className="pt-4">
                    <button
                      onClick={handleSaveEdit}
                      disabled={isUploading}
                      className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                    >
                      {isUploading ? (
                        <>
                          <Upload className="animate-bounce mr-2 h-5 w-5" />
                          Upload en cours...
                        </>
                      ) : (
                        'Enregistrer'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <SackManager profile={profile} />
      )}
    </div>

    </>
  );
}
