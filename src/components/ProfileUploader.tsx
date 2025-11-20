import { useState, useRef } from 'react';
import { Camera, Upload, X } from 'lucide-react';

interface ProfileUploaderProps {
  onImageSelect: (imageData: string) => void;
  currentImage?: string;
}

/**
 * Optimized Image Component with lazy loading and size optimization
 */
function OptimizedImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);

  // If it's a Supabase URL, add transformation parameters for optimization
  const getOptimizedUrl = (url: string) => {
    if (!url) return null;
    
    // Check if it's a Supabase storage URL
    if (url.includes('supabase.co/storage')) {
      // Add image transformation parameters (resize to 200x200 for profile pics)
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}width=200&height=200&quality=80`;
    }
    
    return url;
  };

  const optimizedSrc = getOptimizedUrl(src);

  // If no valid source, show placeholder immediately
  if (!optimizedSrc) {
    return (
      <div className={`${className} relative bg-gray-200 rounded-full flex items-center justify-center`}>
        <Camera className="w-6 h-6 text-gray-400" />
      </div>
    );
  }

  return (
    <div className={`${className} relative`}>
      {!isLoaded && !error && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-full" />
      )}
      {!error && (
        <img
          src={optimizedSrc}
          alt={alt}
          className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            console.warn(`Failed to load image: ${optimizedSrc}`);
            setError(true);
          }}
        />
      )}
      {error && (
        <div className="absolute inset-0 bg-gray-200 rounded-full flex items-center justify-center">
          <Camera className="w-6 h-6 text-gray-400" />
        </div>
      )}
    </div>
  );
}

export default function ProfileUploader({ onImageSelect, currentImage }: ProfileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Optimize and compress image before upload
    const optimizedImage = await optimizeImage(file);
    onImageSelect(optimizedImage);
  };

  const optimizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Create canvas for resizing
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Target size for profile pictures (max 400x400)
          const MAX_SIZE = 400;
          let width = img.width;
          let height = img.height;
          
          // Calculate new dimensions
          if (width > height) {
            if (width > MAX_SIZE) {
              height = (height * MAX_SIZE) / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width = (width * MAX_SIZE) / height;
              height = MAX_SIZE;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw and compress
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Convert to base64 with compression (0.8 quality for JPEG)
          const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(optimizedDataUrl);
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleCameraCapture = async () => {
    setIsCapturing(true);
    try {
      // Use native camera input for mobile
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'user'; // Use front camera
      
      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          const optimizedImage = await optimizeImage(file);
          onImageSelect(optimizedImage);
        }
        setIsCapturing(false);
      };
      
      input.click();
    } catch (error) {
      console.error('Error capturing image:', error);
      alert('Failed to capture image. Please try uploading instead.');
      setIsCapturing(false);
    }
  };

  const handleRemove = () => {
    onImageSelect('');
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Profile Image Preview */}
      <div className="relative">
        {currentImage ? (
          <div className="relative">
            <OptimizedImage
              src={currentImage}
              alt="Profile"
              className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
            />
            <button
              onClick={handleRemove}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md active:bg-red-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center border-4 border-white shadow-lg">
            <Camera className="w-12 h-12 text-gray-400" />
          </div>
        )}
      </div>

      {/* Upload Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium active:bg-blue-700 shadow-sm"
        >
          <Upload className="w-5 h-5" />
          Upload
        </button>
        <button
          onClick={handleCameraCapture}
          disabled={isCapturing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg font-medium active:bg-gray-700 shadow-sm disabled:opacity-50"
        >
          <Camera className="w-5 h-5" />
          {isCapturing ? 'Capturing...' : 'Camera'}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <p className="text-xs text-gray-500 text-center">
        Max size: 5MB • Recommended: 400x400px<br />
        Images are auto-optimized for faster loading
      </p>
    </div>
  );
}

// Export OptimizedImage component for use in other parts of the app
export { OptimizedImage };
