export async function compressImage(file: File, maxWidth: number, maxHeight: number): Promise<Blob> {
  console.log('compressImage started for file:', file.name, file.type, file.size);
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      console.log('Image loaded. Original dimensions:', img.width, img.height);
      try {
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
            console.log('canvas.toBlob succeeded. Blob size:', blob.size);
            resolve(blob);
          } else {
            reject(new Error('Canvas to Blob failed'));
          }
        }, 'image/jpeg', 0.7);
      } catch (e) {
        console.error("Error drawing image to canvas", e);
        reject(e);
      }
    };
    
    img.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      console.error('Image element failed to load', error);
      reject(new Error('Image failed to load'));
    };

    img.src = objectUrl;
  });
}

