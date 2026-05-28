import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Parcel, UserProfile } from '@/types';
import { Search } from 'lucide-react';
import { ParcelTable } from '@/components/ParcelTable';

export function ArchivesView({ profile }: { profile: UserProfile }) {
  const [archivedParcels, setArchivedParcels] = useState<Parcel[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!profile || (profile.role !== 'admin' && profile.role !== 'agent')) return;

    const unsubParcels = onSnapshot(collection(db, 'parcels'), (snapshot) => {
      const fetchedParcels = snapshot.docs.map(doc => doc.data() as Parcel);
      const archived = fetchedParcels.filter(p => p.isArchived);
      archived.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setArchivedParcels(archived);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
    });

    return () => {
      unsubParcels();
      unsubUsers();
    };
  }, [profile]);

  const filteredParcels = archivedParcels.filter(p => 
    p.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Colis Archivés ({filteredParcels.length})</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Consultez et restaurez les colis archivés.</p>
        </div>
        <div className="relative w-full md:w-72">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 pl-10 pr-3 text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Rechercher par tracking..."
          />
        </div>
      </div>

      <ParcelTable 
        parcels={filteredParcels}
        clients={users}
        profile={profile}
      />
    </div>
  );
}
