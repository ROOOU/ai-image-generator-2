'use client';

import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import {
  Loader2, Image as ImageIcon, Download, Sparkles, AlertCircle,
  Key, Settings2, History, Wand2, ImagePlus, Upload, X, Trash2, Maximize
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { OutpaintCanvas, OutpaintCanvasRef } from './OutpaintCanvas';
import HistoryPanel from './HistoryPanel';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// --- Constants & Types ---
const MODELS = [
  { label: 'Nano Banana 2 (Fast & High Res)', value: 'gemini-3.1-flash-image-preview' },
  { label: 'Nano Banana Pro (Best Quality)', value: 'gemini-3-pro-image-preview' },
  { label: 'Nano Banana (Standard)', value: 'gemini-2.5-flash-image' },
];

const SIZES = [
  { label: '512px', value: '512px', models: ['gemini-3.1-flash-image-preview'] },
  { label: '1K', value: '1K', models: ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'] },
  { label: '2K', value: '2K', models: ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'] },
  { label: '4K', value: '4K', models: ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'] },
];

const getAspectRatios = (currentModel: string) => {
  const base = [
    { label: '1:1', value: '1:1' },
    { label: '4:3', value: '4:3' },
    { label: '16:9', value: '16:9' },
    { label: '3:4', value: '3:4' },
    { label: '9:16', value: '9:16' },
  ];
  if (currentModel === 'gemini-3.1-flash-image-preview') {
    return [
      ...base,
      { label: '1:4', value: '1:4' },
      { label: '1:8', value: '1:8' },
      { label: '4:1', value: '4:1' },
      { label: '8:1', value: '8:1' },
    ];
  }
  return base;
};

interface HistoryItem {
  id: string;
  timestamp: number;
  prompt: string;
  mode: 'text2img' | 'img2img' | 'outpaint';
  model: string;
  imageUrl: string;
  thumbnailUrl?: string;
  inputImageUrls?: string[];
}

// Generate thumbnail helper
function generateThumbnail(dataUrl: string, maxSize = 200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(dataUrl); // fallback to original
    img.src = dataUrl;
  });
}

// --- Main Component ---
export default function ImageGenerator() {
  const [view, setView] = useState<'create' | 'history'>('create');
  const [mode, setMode] = useState<'text-to-image' | 'image-to-image' | 'extend-image'>('text-to-image');

  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gemini-3.1-flash-image-preview');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageSize, setImageSize] = useState('1K');

  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceImageMimeType, setReferenceImageMimeType] = useState<string | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [localApiKey, setLocalApiKey] = useState('');

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outpaintCanvasRef = useRef<OutpaintCanvasRef>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    setLocalApiKey(savedKey);
    if (savedKey) {
      setHasKey(true);
    } else {
      const checkKey = async () => {
        if (window.aistudio) {
          const keyStatus = await window.aistudio.hasSelectedApiKey();
          setHasKey(keyStatus);
        } else {
          setHasKey(true); // Fallback for local dev
        }
      };
      checkKey();
    }
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setLocalApiKey(newKey);
    localStorage.setItem('gemini_api_key', newKey);
    if (newKey) setHasKey(true);
  };

  // Reset incompatible settings when model changes
  useEffect(() => {
    const availableSizes = SIZES.filter(s => s.models.includes(model));
    if (availableSizes.length > 0 && !availableSizes.find(s => s.value === imageSize)) {
      setImageSize(availableSizes[0].value);
    }

    const availableRatios = getAspectRatios(model);
    if (!availableRatios.find(r => r.value === aspectRatio)) {
      setAspectRatio('1:1');
    }
  }, [model, imageSize, aspectRatio]);

  const handleConnectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setReferenceImage(reader.result as string);
      setReferenceImageMimeType(file.type);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }
    if ((mode === 'image-to-image' || mode === 'extend-image') && !referenceImage) {
      setError(`Please upload a reference image for ${mode === 'extend-image' ? 'Extend Image' : 'Image-to-Image'} generation.`);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setImageUrl(null);

    try {
      const apiKeyToUse = localApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey: apiKeyToUse });

      const config: any = {};

      if (mode === 'text-to-image') {
        config.imageConfig = {
          aspectRatio: aspectRatio,
        };
        if (model !== 'gemini-2.5-flash-image') {
          config.imageConfig.imageSize = imageSize;
        }
      }

      const parts: any[] = [];

      // Add reference image if in i2i mode
      if (mode === 'image-to-image' && referenceImage && referenceImageMimeType) {
        const base64Data = referenceImage.split(',')[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: referenceImageMimeType,
          },
        });
      } else if (mode === 'extend-image' && referenceImage) {
        const compositeBase64 = outpaintCanvasRef.current?.getCompositeImage();
        if (compositeBase64) {
          const base64Data = compositeBase64.split(',')[1];
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg',
            },
          });
        } else {
          throw new Error('Failed to generate composite image for outpainting.');
        }
      }

      // Add text prompt
      parts.push({ text: prompt });

      const requestOptions: any = {
        model: model,
        contents: { parts },
      };

      if (Object.keys(config).length > 0) {
        requestOptions.config = config;
      }

      const response = await ai.models.generateContent(requestOptions);

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          const url = `data:${part.inlineData.mimeType};base64,${base64EncodeString}`;
          setImageUrl(url);
          foundImage = true;

          let finalMode: 'text2img' | 'img2img' | 'outpaint' = 'text2img';
          if (mode === 'image-to-image') finalMode = 'img2img';
          if (mode === 'extend-image') finalMode = 'outpaint';

          // Save to history API
          const thumbnailData = await generateThumbnail(url);
          try {
            const historyHeaders: HeadersInit = { 'Content-Type': 'application/json' };
            const apiKeyToUse = localApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
            if (apiKeyToUse) {
              historyHeaders['x-api-key'] = apiKeyToUse;
            }

            const inputImagesData = [];
            if (finalMode === 'img2img' && referenceImage) inputImagesData.push(referenceImage);
            else if (finalMode === 'outpaint' && referenceImage) inputImagesData.push(referenceImage);

            await fetch('/api/history', {
              method: 'POST',
              headers: historyHeaders,
              body: JSON.stringify({
                imageData: url,
                thumbnailData,
                prompt,
                mode: finalMode,
                model,
                inputImagesData: inputImagesData.length > 0 ? inputImagesData : undefined,
                inputImageMimeType: referenceImageMimeType || 'image/jpeg',
                aspectRatio,
              }),
            });
          } catch (e) {
            console.warn('History save failed:', e);
          }
          break;
        }
      }

      if (!foundImage) {
        setError('Failed to generate image. The model did not return an image part.');
      }
    } catch (err: any) {
      console.error('Generation error:', err);
      if (err.message?.includes('Requested entity was not found')) {
        setHasKey(false);
        setError('API Key error or not found. Please reconnect your paid API key.');
        if (window.aistudio) {
          await window.aistudio.openSelectKey();
          setHasKey(true);
        }
      } else {
        setError(err.message || 'An error occurred during generation. Please try again.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `generated-image-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const applyHistoryItem = (item: HistoryItem) => {
    setImageUrl(item.imageUrl);
    setPrompt(item.prompt);
    let localMode: 'text-to-image' | 'image-to-image' | 'extend-image' = 'text-to-image';
    if (item.mode === 'img2img') localMode = 'image-to-image';
    if (item.mode === 'outpaint') localMode = 'extend-image';
    setMode(localMode);
  };

  const needsKey = model !== 'gemini-2.5-flash-image';
  const currentAspectRatios = getAspectRatios(model);
  const currentSizes = SIZES.filter(s => s.models.includes(model));

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top Navigation */}
      <div className="flex justify-center mb-8">
        <div className="bg-white p-1 rounded-2xl shadow-sm border border-gray-200 inline-flex">
          <button
            onClick={() => setIsHistoryOpen(false)}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${!isHistoryOpen
              ? 'bg-indigo-50 text-indigo-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
          >
            <Wand2 className="w-4 h-4" />
            Create
          </button>
          <button
            onClick={() => setIsHistoryOpen(true)}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${isHistoryOpen
              ? 'bg-indigo-50 text-indigo-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
          >
            <History className="w-4 h-4" />
            History Archive
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <HistoryPanel
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          onSelectItem={applyHistoryItem}
          apiKey={localApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''}
        />
        {/* Sidebar Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-indigo-500" />
                Settings
              </h2>
            </div>

            <div className="space-y-6">
              {/* Mode Selection */}
              <div className="flex p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setMode('text-to-image')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${mode === 'text-to-image' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  <Wand2 className="w-4 h-4" />
                  Text to Image
                </button>
                <button
                  onClick={() => setMode('image-to-image')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${mode === 'image-to-image' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  <ImagePlus className="w-4 h-4" />
                  Image to Image
                </button>
                <button
                  onClick={() => setMode('extend-image')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${mode === 'extend-image' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  <Maximize className="w-4 h-4" />
                  Extend Image
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 transition-all text-sm"
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Image Upload for I2I and Extend */}
              <AnimatePresence>
                {(mode === 'image-to-image' || mode === 'extend-image') && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden space-y-4"
                  >
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Reference Image
                      </label>
                      <div
                        onClick={() => !referenceImage && fileInputRef.current?.click()}
                        className={`relative border-2 border-dashed rounded-2xl p-4 transition-all flex flex-col items-center justify-center gap-2 text-center ${referenceImage
                          ? 'border-indigo-300 bg-indigo-50/50'
                          : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50 cursor-pointer'
                          }`}
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          accept="image/*"
                          className="hidden"
                        />
                        {referenceImage ? (
                          <div className="relative w-full">
                            {mode === 'extend-image' ? (
                              <OutpaintCanvas
                                key={`${referenceImage}-${aspectRatio}`}
                                ref={outpaintCanvasRef}
                                imageUrl={referenceImage}
                                aspectRatio={aspectRatio}
                              />
                            ) : (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={referenceImage} alt="Reference" className="w-full h-32 object-contain rounded-lg" />
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setReferenceImage(null); setReferenceImageMimeType(null); }}
                              className="absolute -top-2 -right-2 p-1 bg-white rounded-full shadow-md text-gray-500 hover:text-red-500 z-10"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 mb-1">
                              <Upload className="w-5 h-5" />
                            </div>
                            <p className="text-sm font-medium text-gray-700">Click to upload image</p>
                            <p className="text-xs text-gray-500">PNG, JPG, WEBP up to 5MB</p>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={mode === 'image-to-image' ? "Describe how to modify the image..." : "Describe the image you want to generate in detail..."}
                  className="w-full h-32 p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-gray-900 transition-all text-sm"
                />
              </div>

              {currentSizes.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Resolution
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {currentSizes.map((size) => (
                      <button
                        key={size.value}
                        onClick={() => setImageSize(size.value)}
                        className={`py-2 px-1 text-xs rounded-xl border transition-all duration-200 ${imageSize === size.value
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                      >
                        {size.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(mode === 'text-to-image' || mode === 'extend-image') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Aspect Ratio
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {currentAspectRatios.map((ratio) => (
                      <button
                        key={ratio.value}
                        onClick={() => setAspectRatio(ratio.value)}
                        className={`py-2 px-3 text-xs rounded-xl border transition-all duration-200 flex-1 min-w-[60px] ${aspectRatio === ratio.value
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                      >
                        {ratio.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Key className="w-5 h-5 text-indigo-500" />
                  API Key
                </h2>
              </div>
              <div className="space-y-4">
                <div>
                  <input
                    type="password"
                    value={localApiKey}
                    onChange={handleApiKeyChange}
                    placeholder="Enter your Gemini API Key..."
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 transition-all text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Your API key is stored locally in your browser and used for generation and fetching history.
                  </p>
                </div>
                {!localApiKey && (
                  <button
                    onClick={handleConnectKey}
                    className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Key className="w-4 h-4" />
                    Connect Studio Key
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Main Preview Area */}
          <div className="lg:col-span-8">
            <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 min-h-[500px] lg:min-h-[600px] flex flex-col items-center justify-center relative overflow-hidden group">
              {isGenerating ? (
                <div className="flex flex-col items-center gap-6 text-gray-400">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                    <Loader2 className="w-12 h-12 animate-spin text-indigo-500 relative z-10" />
                  </div>
                  <p className="text-sm font-medium animate-pulse text-gray-500">Crafting your vision...</p>
                </div>
              ) : imageUrl ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="relative w-full h-full flex items-center justify-center"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={prompt}
                    className="max-w-full max-h-[700px] object-contain rounded-2xl shadow-lg ring-1 ring-black/5"
                  />
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => handleDownload(imageUrl)}
                      className="p-3 bg-white/90 backdrop-blur-md text-gray-900 rounded-full shadow-lg hover:bg-white hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                      title="Download Image"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-gray-300">
                  <div className="w-24 h-24 rounded-full bg-gray-50 flex items-center justify-center mb-2">
                    <ImageIcon className="w-10 h-10 text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-400">Your generated image will appear here</p>
                </div>
              )}
            </div>
            <div className="mt-8">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim() || ((mode === 'image-to-image' || mode === 'extend-image') && !referenceImage)}
                className="w-full py-4 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-medium transition-all duration-200 disabled:opacity-50 disabled:hover:bg-indigo-600 flex items-center justify-center gap-2 shadow-sm hover:shadow-md lg:hidden"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Image
                  </>
                )}
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim() || ((mode === 'image-to-image' || mode === 'extend-image') && !referenceImage)}
                className="hidden lg:flex w-full py-4 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-medium transition-all duration-200 disabled:opacity-50 disabled:hover:bg-indigo-600 items-center justify-center gap-2 shadow-sm hover:shadow-md"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Image
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
