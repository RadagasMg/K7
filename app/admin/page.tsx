'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, onSnapshot, updateDoc, writeBatch, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { secondaryAuth, db, auth, storage } from '@/lib/firebase';
import { toast } from 'sonner';
import { Parcel, UserProfile, ParcelImage, ParcelStatus } from '@/types';
import { ParcelTable } from '@/components/ParcelTable';
import { AgentView } from '@/components/AgentView';
import { ArchivesView } from '@/components/ArchivesView';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Users, Package, Settings, Shield, X, Upload, Camera, Printer, Archive } from 'lucide-react';
import { compressImage } from '@/lib/imageUtils';
import { logAction } from '@/lib/logger';

export default function AdminDashboard() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'agent' | 'client'>('client');
  const [creating, setCreating] = useState(false);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  
  const [activeTab, setActiveTab] = useState<'users' | 'parcels' | 'archives' | 'agent' | 'settings'>('users');
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Filters for parcels
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterClient, setFilterClient] = useState('');

  // Edit Modal States
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editInternalNote, setEditInternalNote] = useState('');
  const [editClientId, setEditClientId] = useState('');
  const [editStatus, setEditStatus] = useState<any>('');
  const [labelImage, setLabelImage] = useState<File | null>(null);
  const [scaleImage, setScaleImage] = useState<File | null>(null);
  const [openedImage, setOpenedImage] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'admin')) {
      router.push('/');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return;
    
    const unsubParcels = onSnapshot(collection(db, 'parcels'), (snapshot) => {
      const fetchedParcels = snapshot.docs.map(doc => doc.data() as Parcel);
      fetchedParcels.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setParcels(fetchedParcels);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
    });

    return () => {
      unsubParcels();
      unsubUsers();
    };
  }, [profile]);

  if (loading || !profile || profile.role !== 'admin') return <div className="p-8 text-gray-900 dark:text-gray-100">Chargement...</div>;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPassword) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setCreating(true);
    const username = newName.trim().toLowerCase();
    const email = username.includes('@') ? username : `${username}@k7.com`;

    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, newPassword);
      
      const userData: any = {
        uid: userCredential.user.uid,
        name: newName.trim(),
        username,
        role: newRole,
        createdAt: new Date().toISOString()
      };

      if (newRole === 'client') {
        let maxId = 0;
        users.forEach(u => {
          if (u.clientId && u.clientId.startsWith('K7C-')) {
            const num = parseInt(u.clientId.substring(4), 10);
            if (!isNaN(num) && num > maxId) maxId = num;
          }
        });
        userData.clientId = `K7C-${(maxId + 1).toString().padStart(3, '0')}`;
      }

      await setDoc(doc(db, 'users', userCredential.user.uid), userData);

      toast.success(`Utilisateur ${newName} créé avec succès ${userData.clientId ? `(ID: ${userData.clientId})` : ''}`);
      setNewName('');
      setNewPassword('');
      setNewRole('client');
      
      await secondaryAuth.signOut();
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error.code === 'auth/email-already-in-use') {
        toast.error('Ce nom est déjà utilisé. Veuillez ajouter une initiale ou un numéro.');
      } else {
        toast.error("Erreur lors de la création de l'utilisateur");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateMissingClientIds = async () => {
    try {
      console.log('Generating missing client IDs...');
      let maxId = 0;
      users.forEach(u => {
        if (u.clientId && u.clientId.startsWith('K7C-')) {
          const num = parseInt(u.clientId.substring(4), 10);
          if (!isNaN(num) && num > maxId) maxId = num;
        }
      });
      console.log('Current max client ID number:', maxId);

      const batch = writeBatch(db);
      let count = 0;
      for (const u of users) {
        if (u.role === 'client' && !u.clientId) {
          maxId++;
          const newClientId = `K7C-${maxId.toString().padStart(3, '0')}`;
          console.log(`Assigning ${newClientId} to ${u.name}`);
          batch.update(doc(db, 'users', u.uid), { clientId: newClientId });
          count++;
        }
      }

      if (count > 0) {
        await batch.commit();
        toast.success(`${count} ID(s) client généré(s) avec succès.`);
      } else {
        toast.info('Aucun client ne manque d\'ID.');
      }
    } catch (error: any) {
      console.error('Error generating client IDs:', error);
      toast.error('Erreur: ' + error.message);
    }
  };

  const handleCleanDatabase = async () => {
    if (!window.confirm("Êtes-vous sûr de vouloir tout supprimer (sauf les utilisateurs et le K7C-001) ? Cette action est irréversible.")) return;

    try {
      toast.info('Nettoyage en cours...');
      // Clean Parcels
      const parcelsSnap = await getDocs(collection(db, 'parcels'));
      const batchParcels = writeBatch(db);
      parcelsSnap.docs.forEach(doc => batchParcels.delete(doc.ref));
      await batchParcels.commit();

      // Clean Sacks
      const sacksSnap = await getDocs(collection(db, 'sacks'));
      const batchSacks = writeBatch(db);
      sacksSnap.docs.forEach(doc => batchSacks.delete(doc.ref));
      await batchSacks.commit();

      // Clean Logs
      const logsSnap = await getDocs(collection(db, 'logs'));
      const batchLogs = writeBatch(db);
      logsSnap.docs.forEach(doc => batchLogs.delete(doc.ref));
      await batchLogs.commit();

      toast.success('Données nettoyées avec succès.');
    } catch (error: any) {
      console.error('Cleaning error:', error);
      toast.error('Erreur lors du nettoyage: ' + error.message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminPassword || newAdminPassword.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    
    if (!auth.currentUser) return;

    setIsChangingPassword(true);
    try {
      await updatePassword(auth.currentUser, newAdminPassword);
      toast.success('Mot de passe mis à jour avec succès');
      setNewAdminPassword('');
    } catch (error: any) {
      console.error('Error changing password:', error);
      if (error.code === 'auth/requires-recent-login') {
        toast.error('Veuillez vous déconnecter et vous reconnecter avant de changer votre mot de passe.');
      } else {
        toast.error('Erreur lors du changement de mot de passe');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      await updateDoc(doc(db, 'users', userToDelete.uid), {
        isDeleted: true,
        updatedAt: new Date().toISOString()
      });
      toast.success(`Utilisateur ${userToDelete.name} supprimé`);
      setUserToDelete(null);
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      setIsDeletingUser(false);
    }
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

      if (editClientId !== undefined) {
        updates.clientId = editClientId;
        if (editingParcel.status === 'Non lié' && editStatus === 'Non lié' && editClientId) {
          updates.status = 'Lié';
        }
      }

      if (editStatus) updates.status = editStatus;
      if (editNote !== undefined) updates.note = editNote;
      if (editInternalNote !== undefined) updates.internalNote = editInternalNote;

      if (editWeight) {
        const weight = parseFloat(editWeight);
        updates.weight = weight;
      }

      setEditingParcel(null);
      setLabelImage(null);
      setScaleImage(null);
      setOpenedImage(null);

      await updateDoc(doc(db, 'parcels', editingParcel.id), updates);
      await logAction(editingParcel.id, profile.uid, 'UPDATED', { ...updates, imagesAdded: newImages.length });
      toast.success('Colis mis à jour');
    } catch (error) {
      console.error('Error updating parcel:', error);
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setIsUploading(false);
    }
  };

  const filteredParcels = parcels.filter(p => {
    if (p.isArchived) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterClient && p.clientId !== filterClient) return false;
    if (searchTerm && !p.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const adminTabs = [
    { id: 'users', label: 'Utilisateurs', icon: Users },
    { id: 'parcels', label: 'Actifs', icon: Package },
    { id: 'archives', label: 'Archives', icon: Archive },
    { id: 'agent', label: 'Interface Agent', icon: Shield },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  return (
    <DashboardLayout 
      title="Tableau de bord Administrateur"
      tabs={adminTabs}
      activeTab={activeTab}
      onTabChange={(tab: string) => setActiveTab(tab as any)}
    >
      <div className="mx-auto max-w-6xl">
        {/* Sub-tabs removed, handled by sidebar */}
        
        {activeTab === 'users' && (
          <div className="space-y-8">
            <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
              <h2 className="mb-6 text-xl font-semibold text-gray-800 dark:text-gray-100">Créer un nouvel utilisateur</h2>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nom</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Nom de l'utilisateur"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mot de passe</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Min. 8 caractères"
                      required
                      minLength={8}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rôle</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as any)}
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="client">Client</option>
                      <option value="agent">Agent</option>
                      <option value="admin">Administrateur</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-md bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {creating ? 'Création...' : "Créer l'utilisateur"}
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
              <h2 className="mb-6 text-xl font-semibold text-gray-800 dark:text-gray-100">Liste des Utilisateurs</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Nom</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Identifiant</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">ID Client</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Rôle</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Date de création</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
                    {users.filter(u => !u.isDeleted).map((u) => (
                      <tr key={u.uid}>
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white">{u.name}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-gray-500 dark:text-gray-400">{u.username}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-gray-500 dark:text-gray-400">{u.clientId || '-'}</td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            u.role === 'admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' :
                            u.role === 'agent' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                            'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                          {u.uid !== profile.uid && (
                            <button
                              onClick={() => setUserToDelete(u)}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                              title="Supprimer"
                            >
                              <X className="h-5 w-5 inline" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Delete User Modal */}
        {userToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-xl border border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Supprimer l&apos;utilisateur</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Êtes-vous sûr de vouloir supprimer l&apos;utilisateur <strong>{userToDelete.name}</strong> ? Cette action lui bloquera l&apos;accès à l&apos;application.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setUserToDelete(null)}
                  disabled={isDeletingUser}
                  className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Annuler
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={isDeletingUser}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeletingUser ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'parcels' && (
          <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Tous les Colis Actifs ({filteredParcels.length})</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Gérez tous les colis actifs du système.</p>
            </div>

            {/* Search and Filters */}
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recherche par Tracking</label>
                <input
                  type="text"
                  list="tracking-numbers"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Ex: YT123456..."
                />
                <datalist id="tracking-numbers">
                  {parcels.filter(p => !p.isArchived).map(p => (
                    <option key={p.id} value={p.trackingNumber} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filtrer par Statut</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Tous les statuts</option>
                  <option value="Entrant">Entrant</option>
                  <option value="Non lié">Non lié</option>
                  <option value="Lié">Lié</option>
                  <option value="En attente">En attente</option>
                  <option value="Expédié">Expédié</option>
                  <option value="Prêt">Prêt</option>
                  <option value="Livré">Livré</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filtrer par Client</label>
                <select
                  value={filterClient}
                  onChange={(e) => setFilterClient(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Tous les clients</option>
                  {users.filter(u => u.role === 'client').map(c => (
                    <option key={c.uid} value={c.uid}>{c.name} ({c.username})</option>
                  ))}
                </select>
              </div>
            </div>

            <ParcelTable 
              parcels={filteredParcels} 
              clients={users} 
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
          </div>
        )}

        {activeTab === 'archives' && (
          <ArchivesView profile={profile} />
        )}

        {activeTab === 'agent' && (
          <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Interface Agent</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Effectuez des tâches d&apos;entrepôt en tant qu&apos;administrateur.</p>
            </div>
            <AgentView profile={profile} />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-8">
            <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Sécurité</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Modifiez votre mot de passe administrateur.</p>
              </div>
              
              <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nouveau mot de passe</label>
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Min. 8 caractères"
                    required
                    minLength={8}
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isChangingPassword ? 'Mise à jour...' : 'Changer le mot de passe'}
                </button>
              </form>
            </div>
            <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Utilitaires Administratifs</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Actions de maintenance de la base de données.</p>
              </div>
              <div className="space-y-4">
                <button
                  onClick={handleGenerateMissingClientIds}
                  className="w-full text-left rounded-md bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors border border-blue-100 dark:border-blue-800"
                >
                  <span className="font-semibold block mb-1">Générer les ID Clients manquants</span>
                  <span className="text-sm opacity-80 block">Attribue un identifiant unique (ex: K7C-005) à tous les clients qui n&apos;en ont pas encore.</span>
                </button>
                
                <button
                  onClick={handleCleanDatabase}
                  className="w-full text-left rounded-md bg-red-50 dark:bg-red-900/20 px-4 py-3 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-100 dark:border-red-800"
                >
                  <span className="font-semibold block mb-1">Nettoyer la base de données (DANGER)</span>
                  <span className="text-sm opacity-80 block">Supprime tous les colis, sacs, et historiques d&apos;actions. Les utilisateurs seront conservés. Cette action est IRREVERSIBLE.</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingParcel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-xl my-8 border border-gray-100 dark:border-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Modifier {editingParcel.trackingNumber}</h3>
              <button 
                onClick={() => setEditingParcel(null)} 
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
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Client (Optionnel)</label>
                  <select
                    value={editClientId}
                    onChange={(e) => setEditClientId(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    disabled={isUploading}
                  >
                    <option value="">-- Sélectionner un client --</option>
                    {users.filter(u => u.role === 'client').map(c => (
                      <option key={c.uid} value={c.uid}>{c.name} ({c.username})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Poids (kg) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                    disabled={isUploading}
                  />
                </div>
              </div>

              {/* Photos Section */}
              <div className="rounded-md bg-gray-50 dark:bg-gray-800/50 p-3 border border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Photos obligatoires</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">1. Étiquette du colis</label>
                    {editingParcel.images?.some(i => i.type === 'label') ? (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Déjà uploadée</span>
                    ) : (
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => setLabelImage(e.target.files?.[0] || null)}
                        className="block w-full text-xs text-gray-500 dark:text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50"
                        disabled={isUploading}
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">2. Colis sur la balance</label>
                    {editingParcel.images?.some(i => i.type === 'scale') ? (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Déjà uploadée</span>
                    ) : (
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => setScaleImage(e.target.files?.[0] || null)}
                        className="block w-full text-xs text-gray-500 dark:text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50"
                        disabled={isUploading}
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">3. Colis ouvert</label>
                    {editingParcel.images?.some(i => i.type === 'opened') ? (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Déjà uploadée</span>
                    ) : (
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => setOpenedImage(e.target.files?.[0] || null)}
                        className="block w-full text-xs text-gray-500 dark:text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50"
                        disabled={isUploading}
                      />
                    )}
                  </div>
                </div>
              </div>
              
              <div className="rounded-md bg-orange-50 dark:bg-orange-900/20 p-3 border border-orange-100 dark:border-orange-800/50">
                <label className="mt-1 block text-sm font-medium text-orange-800 dark:text-orange-400">
                  Note interne
                </label>
                <textarea
                  value={editInternalNote}
                  onChange={(e) => setEditInternalNote(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-orange-300 dark:border-orange-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Notes visibles uniquement par l'équipe"
                  disabled={isUploading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Note</label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
    </DashboardLayout>
  );
}
