import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function logAction(parcelId: string, userId: string, action: string, details: any = {}) {
  const logId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  
  await setDoc(doc(db, 'logs', logId), {
    id: logId,
    parcelId,
    userId,
    action,
    details: JSON.stringify(details),
    timestamp
  });
}
