import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

// Function to generate a thumbnail using Canvas API
export async function generateThumbnail(file: File, maxWidth = 200, maxHeight = 200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas to Blob failed'));
        }
      }, 'image/jpeg', 0.7);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadParcelImage(parcelId: string, file: File) {
  const uuid = crypto.randomUUID();
  const timestamp = Date.now();
  
  // Create references
  const originalRef = ref(storage, `parcels/${parcelId}/${timestamp}_${uuid}_original.jpg`);
  const thumbRef = ref(storage, `parcels/${parcelId}/${timestamp}_${uuid}_thumb.jpg`);
  
  // Generate thumbnail
  const thumbBlob = await generateThumbnail(file);
  
  // Upload both in parallel
  const [originalSnap, thumbSnap] = await Promise.all([
    uploadBytes(originalRef, file),
    uploadBytes(thumbRef, thumbBlob)
  ]);
  
  // Get URLs
  const [originalUrl, thumbnailUrl] = await Promise.all([
    getDownloadURL(originalSnap.ref),
    getDownloadURL(thumbSnap.ref)
  ]);
  
  return {
    originalUrl,
    thumbnailUrl,
    uploadedAt: new Date(timestamp).toISOString()
  };
}
