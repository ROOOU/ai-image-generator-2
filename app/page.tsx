import ImageGenerator from '@/components/ImageGenerator';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50/50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="text-center space-y-4 pt-8">
          <div className="inline-flex items-center justify-center px-4 py-1.5 mb-4 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium border border-indigo-100">
            Powered by Gemini 3.1 Flash & Pro
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900">
            AI Image Generator
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Transform your ideas into stunning visuals using the power of Gemini AI.
            Simply describe what you want to see.
          </p>
        </div>
        
        <ImageGenerator />
      </div>
    </main>
  );
}
