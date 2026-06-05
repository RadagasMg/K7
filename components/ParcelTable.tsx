import { useState, useRef } from 'react';
import { Parcel, UserProfile } from '@/types';
import { AlertTriangle, Edit2, Package, Trash2, RefreshCw, ChevronUp, ChevronDown, Printer } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import Barcode from 'react-barcode';

interface ParcelTableProps {
  parcels: Parcel[];
  clients?: UserProfile[];
  profile?: UserProfile;
  onEdit?: (parcel: Parcel) => void;
  readOnly?: boolean;
}

export function ParcelTable({ parcels, clients = [], profile, onEdit, readOnly }: ParcelTableProps) {
  const [sortColumn, setSortColumn] = useState<keyof Parcel | 'clientName'>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [parcelToArchive, setParcelToArchive] = useState<Parcel | null>(null);
  const [parcelToRestore, setParcelToRestore] = useState<Parcel | null>(null);
  const [parcelToPrint, setParcelToPrint] = useState<Parcel | null>(null);
  const [parcelToView, setParcelToView] = useState<Parcel | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = (parcel: Parcel) => {
    setParcelToPrint(parcel);
    setTimeout(() => {
      window.print();
      setParcelToPrint(null);
    }, 100);
  };

  const handleSort = (column: keyof Parcel | 'clientName') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getClientDisplay = (clientId?: string) => {
    if (!clientId) return 'Non lié';
    if (profile?.role === 'admin') {
      return clients.find(c => c.uid === clientId)?.name || clientId;
    }
    return clientId;
  };

  const sortedParcels = [...parcels].sort((a, b) => {
    let valA: any = a[sortColumn as keyof Parcel];
    let valB: any = b[sortColumn as keyof Parcel];

    if (sortColumn === 'clientName') {
      valA = getClientDisplay(a.clientId);
      valB = getClientDisplay(b.clientId);
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const handleArchive = async () => {
    if (!parcelToArchive) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'parcels', parcelToArchive.id), {
        isArchived: true,
        updatedAt: new Date().toISOString()
      });
      toast.success('Colis archivé avec succès');
      setParcelToArchive(null);
    } catch (error) {
      console.error('Error archiving parcel:', error);
      toast.error('Erreur lors de l\'archivage');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (!parcelToRestore) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'parcels', parcelToRestore.id), {
        isArchived: false,
        updatedAt: new Date().toISOString()
      });
      toast.success('Colis restauré avec succès');
      setParcelToRestore(null);
    } catch (error) {
      console.error('Error restoring parcel:', error);
      toast.error('Erreur lors de la restauration');
    } finally {
      setIsProcessing(false);
    }
  };

  const isDelayed = (parcel: Parcel) => {
    if (parcel.status !== 'Entrant') return false;
    const days = (Date.now() - new Date(parcel.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return days > 7;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Entrant': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
      case 'Non lié': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'Lié': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'En attente': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'Expédié': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
      case 'Prêt': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Livré': return 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
      default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const SortIcon = ({ column }: { column: keyof Parcel | 'clientName' }) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? <ChevronUp className="inline h-4 w-4 ml-1" /> : <ChevronDown className="inline h-4 w-4 ml-1" />;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-gray-800/50">
          <tr>
            <th onClick={() => handleSort('trackingNumber')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              Tracking <SortIcon column="trackingNumber" />
            </th>
            <th onClick={() => handleSort('status')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              Statut <SortIcon column="status" />
            </th>
            <th onClick={() => handleSort('clientName')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              Client <SortIcon column="clientName" />
            </th>
            <th onClick={() => handleSort('weight')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              Poids <SortIcon column="weight" />
            </th>
            <th onClick={() => handleSort('updatedAt')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              Date <SortIcon column="updatedAt" />
            </th>
            {!readOnly && <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
          {sortedParcels.map((parcel) => {
            const delayed = isDelayed(parcel);
            return (
              <tr key={parcel.id} className={delayed ? 'bg-orange-50 dark:bg-orange-900/10' : ''}>
                <td className="whitespace-nowrap px-6 py-4">
                  <button 
                    onClick={() => setParcelToView(parcel)}
                    className="flex items-center text-left hover:opacity-80 transition-opacity focus:outline-none"
                  >
                    <Package className="mr-2 h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <span className="font-medium text-blue-600 dark:text-blue-400 hover:underline">{parcel.trackingNumber}</span>
                    {delayed && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-orange-100 dark:bg-orange-900/30 px-2.5 py-0.5 text-xs font-medium text-orange-800 dark:text-orange-400">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        +7 Jours
                      </span>
                    )}
                  </button>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusColor(parcel.status)}`}>
                    {parcel.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {parcel.clientId ? (
                    <span className="font-medium text-gray-900 dark:text-white">
                      {getClientDisplay(parcel.clientId)}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 italic">Non lié</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {parcel.weight ? (
                    <span>{parcel.weight} kg</span>
                  ) : '-'}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {new Date(parcel.updatedAt).toLocaleDateString('fr-FR')}
                </td>
                {!readOnly && (
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-3">
                      <button
                        onClick={() => handlePrint(parcel)}
                        className="inline-flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300"
                        title="Imprimer le code-barres"
                      >
                        <Printer className="h-4 w-4" />
                      </button>

                      {onEdit && (
                        <button
                          onClick={() => onEdit(parcel)}
                          disabled={!!parcel.sackId}
                          className={`inline-flex items-center ${parcel.sackId ? 'cursor-not-allowed text-gray-400 dark:text-gray-600' : 'text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300'}`}
                          title={parcel.sackId ? "Dans un sac" : "Modifier"}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                      
                      {parcel.isArchived ? (
                        <button
                          onClick={() => setParcelToRestore(parcel)}
                          className="inline-flex items-center text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                          title="Restaurer"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setParcelToArchive(parcel)}
                          disabled={!!parcel.sackId}
                          className={`inline-flex items-center ${parcel.sackId ? 'cursor-not-allowed text-gray-400 dark:text-gray-600' : 'text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300'}`}
                          title={parcel.sackId ? "Impossible d'archiver un colis dans un sac" : "Archiver"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
          {parcels.length === 0 && (
            <tr>
              <td colSpan={readOnly ? 5 : 6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                Aucun colis trouvé
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Hidden Print Area */}
      {parcelToPrint && (
        <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-[9999] print:flex print:flex-col print:items-center print:justify-center">
          <div className="text-center p-8">
            <h1 className="text-2xl font-bold mb-4">K7 Logistics</h1>
            <p className="text-sm text-gray-500 mb-2">Tracking (Externe): {parcelToPrint.trackingNumber}</p>
            {/* The Internal ID is just the parcel.id, rendered as a Barcode but ideally a QR code.
                For now we use Barcode since the library is react-barcode, or we could just print the ID.
                Wait, if it's an internal ID, we can use react-barcode as long as it handles the format. */}
            <div className="flex flex-col items-center justify-center my-4">
              <p className="font-bold mb-1">ID Interne (QR/Barcode)</p>
              <Barcode value={parcelToPrint.id} width={2} height={80} fontSize={16} />
            </div>
            <p className="mt-4 text-lg">Client ID: {parcelToPrint.clientId || 'Non lié'}</p>
            {parcelToPrint.weight && <p className="text-lg">Poids: {parcelToPrint.weight} kg</p>}
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {parcelToArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Archiver le colis</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Êtes-vous sûr de vouloir archiver le colis <strong>{parcelToArchive.trackingNumber}</strong> ? Il ne sera plus visible dans la liste active.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setParcelToArchive(null)}
                disabled={isProcessing}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Annuler
              </button>
              <button
                onClick={handleArchive}
                disabled={isProcessing}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isProcessing ? 'Archivage...' : 'Archiver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {parcelToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Restaurer le colis</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Voulez-vous restaurer le colis <strong>{parcelToRestore.trackingNumber}</strong> dans la liste active ?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setParcelToRestore(null)}
                disabled={isProcessing}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Annuler
              </button>
              <button
                onClick={handleRestore}
                disabled={isProcessing}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isProcessing ? 'Restauration...' : 'Restaurer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parcel View Details Modal */}
      {parcelToView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-xl border border-gray-100 dark:border-gray-800 relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setParcelToView(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 pr-8">Détails du Colis</h3>
            
            <div className="space-y-6">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 flex flex-col items-center">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">ID Interne / Code Interne</p>
                <div className="bg-white p-2 rounded scale-90 sm:scale-100">
                  <Barcode value={parcelToView.id} width={1.5} height={60} fontSize={14} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Tracking (Externe)</p>
                  <p className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{parcelToView.trackingNumber}</p>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Statut Actuel</p>
                  <div className="mt-1">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusColor(parcelToView.status)}`}>
                      {parcelToView.status}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Client Associé</p>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    {parcelToView.clientId ? getClientDisplay(parcelToView.clientId) : <span className="italic text-gray-400">Non lié</span>}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Poids</p>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    {parcelToView.weight ? `${parcelToView.weight} kg` : '-'}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Date de création</p>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    {new Date(parcelToView.createdAt).toLocaleString('fr-FR')}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Dernière mise à jour</p>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    {new Date(parcelToView.updatedAt).toLocaleString('fr-FR')}
                  </p>
                </div>
                
                {parcelToView.sackId && (
                  <div className="sm:col-span-2 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Contenu dans le sac</p>
                    <p className="mt-1 text-sm font-mono text-blue-900 dark:text-blue-200">{parcelToView.sackId}</p>
                  </div>
                )}
              </div>

              {parcelToView.images && parcelToView.images.length > 0 && (
                <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">Photos du colis</p>
                  <div className="grid grid-cols-3 gap-4">
                    {['label', 'scale', 'opened'].map((type) => {
                      const img = parcelToView.images?.find(i => i.type === type);
                      const titleMap: Record<string, string> = {
                        label: 'Étiquette',
                        scale: 'Sur la balance',
                        opened: 'Ouvert'
                      };
                      if (!img) return null;
                      return (
                        <div key={type} className="flex flex-col items-center">
                          <div className="w-full aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 relative">
                            <img 
                              src={img.thumbnailUrl} 
                              alt={titleMap[type]} 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Fallback to original if thumbnail fails
                                (e.target as HTMLImageElement).src = img.originalUrl;
                              }}
                            />
                            <a 
                              href={img.originalUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors"
                              title={`Voir ${titleMap[type]}`}
                            >
                              <span className="sr-only">Agrandir</span>
                            </a>
                          </div>
                          <span className="text-xs text-gray-500 mt-2 text-center">{titleMap[type]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setParcelToView(null)}
                className="rounded-md bg-gray-100 dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
