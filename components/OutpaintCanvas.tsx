import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ZoomIn, ZoomOut, Move } from 'lucide-react';

export interface OutpaintCanvasRef {
  getCompositeImage: () => string | null;
}

interface OutpaintCanvasProps {
  imageUrl: string;
  aspectRatio: string;
}

export const OutpaintCanvas = forwardRef<OutpaintCanvasRef, OutpaintCanvasProps>(
  ({ imageUrl, aspectRatio }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const imageRef = useRef<HTMLImageElement>(null);

    // Parse aspect ratio
    const [wRatio, hRatio] = aspectRatio.split(':').map(Number);
    const ratio = wRatio / hRatio;

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
      setIsDragging(true);
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setDragStart({ x: clientX - position.x, y: clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setPosition({ x: clientX - dragStart.x, y: clientY - dragStart.y });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    useImperativeHandle(ref, () => ({
      getCompositeImage: () => {
        if (!containerRef.current || !imageRef.current) return null;
        
        const container = containerRef.current;
        const canvas = document.createElement('canvas');
        
        // Use a reasonable base resolution, e.g., 1024 on the longest side
        const maxDim = 1024;
        let cWidth, cHeight;
        if (ratio >= 1) {
          cWidth = maxDim;
          cHeight = maxDim / ratio;
        } else {
          cHeight = maxDim;
          cWidth = maxDim * ratio;
        }
        
        canvas.width = cWidth;
        canvas.height = cHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        
        // Fill background with white for outpainting
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, cWidth, cHeight);
        
        // Calculate drawing coordinates
        const containerRect = container.getBoundingClientRect();
        
        // Scale factor from DOM container to Canvas
        const scaleX = cWidth / containerRect.width;
        const scaleY = cHeight / containerRect.height;
        
        // Image dimensions in DOM
        const imgRect = imageRef.current.getBoundingClientRect();
        
        // Relative position of image inside container
        const relX = imgRect.left - containerRect.left;
        const relY = imgRect.top - containerRect.top;
        
        // Draw image
        ctx.drawImage(
          imageRef.current,
          relX * scaleX,
          relY * scaleY,
          imgRect.width * scaleX,
          imgRect.height * scaleY
        );
        
        return canvas.toDataURL('image/jpeg', 0.95);
      }
    }));

    return (
      <div className="flex flex-col items-center gap-4 w-full">
        <div className="flex items-center gap-4 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
          <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium w-12 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(5, s + 0.1))} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">
            <ZoomIn className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-gray-200 mx-2"></div>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
            <Move className="w-4 h-4" /> Drag to move
          </div>
        </div>
        
        <div 
          className="relative bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl overflow-hidden shadow-inner w-full max-w-md mx-auto"
          style={{ aspectRatio: `${wRatio}/${hRatio}` }}
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        >
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-gray-400 font-medium opacity-50">Outpaint Area</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Upload"
            draggable={false}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            className="absolute cursor-move select-none"
            style={{
              transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${scale})`,
              left: '50%',
              top: '50%',
              transformOrigin: 'center',
              maxWidth: '100%',
              maxHeight: '100%',
              pointerEvents: 'auto'
            }}
          />
        </div>
      </div>
    );
  }
);

OutpaintCanvas.displayName = 'OutpaintCanvas';
