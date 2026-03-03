import React, { useState, useEffect } from 'react';
import { generateVideoScript } from './services/videoService';
import { 
  Sparkles, 
  Plus, 
  Loader2, 
  Download, 
  AlertCircle,
  Trash2,
  CheckCircle2,
  Layers,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface VideoSegment {
  text: string;
  durationInSeconds: number;
}

interface GeneratedVideo {
  id: string;
  prompt: string;
  segments: VideoSegment[];
  isRendering: boolean;
  downloadUrl?: string;
  error?: string;
}

const VideoPreview = ({ segments }: { segments: VideoSegment[] }) => {
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (segments.length === 0) return;

    let timeout: NodeJS.Timeout;
    const playSegment = (index: number) => {
      const segment = segments[index];
      setOpacity(0);
      
      setTimeout(() => {
        setCurrentSegmentIndex(index);
        setOpacity(1);
        
        timeout = setTimeout(() => {
          const nextIndex = (index + 1) % segments.length;
          playSegment(nextIndex);
        }, segment.durationInSeconds * 1000 - 300); // Fade out slightly before end
      }, 300);
    };

    playSegment(0);
    return () => clearTimeout(timeout);
  }, [segments]);

  if (segments.length === 0) return null;

  return (
    <div className="w-full h-full bg-black flex items-center justify-center p-12 text-center relative overflow-hidden">
      <motion.div
        key={currentSegmentIndex}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 1.1, y: -20 }}
        transition={{ duration: 0.5 }}
        className="text-white text-2xl lg:text-3xl font-bold leading-tight"
        style={{ direction: 'rtl', fontFamily: 'serif' }}
      >
        {segments[currentSegmentIndex].text}
      </motion.div>
    </div>
  );
};

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [bulkCount, setBulkCount] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const generateVideos = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);

    try {
      const newVideos: GeneratedVideo[] = [];
      
      for (let i = 0; i < bulkCount; i++) {
        const videoScript = await generateVideoScript(`${prompt} (Variation ${i + 1})`);
        const id = Math.random().toString(36).substring(7);
        
        const video: GeneratedVideo = {
          id,
          prompt: `${prompt} #${i + 1}`,
          segments: videoScript.segments.map(s => ({
            text: s.text,
            durationInSeconds: s.durationInSeconds,
          })),
          isRendering: false
        };
        newVideos.push(video);
      }
      
      setVideos(prev => [...newVideos, ...prev]);
      if (newVideos.length > 0) setSelectedVideoId(newVideos[0].id);
      // On mobile, close sidebar after generation
      if (window.innerWidth < 1024) setIsSidebarOpen(false);
    } catch (err: any) {
      setError(err.message || 'Generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const renderVideo = async (video: GeneratedVideo) => {
    setVideos(prev => prev.map(v => v.id === video.id ? { ...v, isRendering: true, error: undefined } : v));
    
    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: video.segments, id: video.id }),
      });
      
      const data = await response.json();
      if (data.success) {
        setVideos(prev => prev.map(v => v.id === video.id ? { ...v, isRendering: false, downloadUrl: data.downloadUrl } : v));
      } else {
        throw new Error(data.error || 'Render failed');
      }
    } catch (err: any) {
      setVideos(prev => prev.map(v => v.id === video.id ? { ...v, isRendering: false, error: err.message } : v));
    }
  };

  const removeVideo = (id: string) => {
    setVideos(prev => prev.filter(v => v.id !== id));
    if (selectedVideoId === id) setSelectedVideoId(null);
  };

  const selectedVideo = videos.find(v => v.id === selectedVideoId);
  const totalDuration = selectedVideo?.segments.reduce((acc, s) => acc + s.durationInSeconds, 0) || 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-emerald-500/30 overflow-hidden">
      <div className="flex h-screen w-full relative">
        
        {/* Sidebar: Controls & List */}
        <motion.div 
          initial={false}
          animate={{ 
            width: isSidebarOpen ? (window.innerWidth < 1024 ? '100%' : '360px') : '0px',
            opacity: isSidebarOpen ? 1 : 0,
            x: isSidebarOpen ? 0 : -20
          }}
          className={cn(
            "bg-[#141414] border-r border-white/5 flex flex-col h-full shadow-xl z-50 absolute lg:relative",
            !isSidebarOpen && "pointer-events-none"
          )}
        >
          <div className="p-4 lg:p-6 border-b border-white/5 space-y-4 lg:space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-lg font-semibold tracking-tight text-white">Remix AI</h1>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden p-2 text-zinc-500 hover:text-white"
              >
                <Trash2 className="w-5 h-5 rotate-45" /> {/* Close icon substitute */}
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Theme / Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Patience, Gratitude..."
                  className="w-full h-20 bg-[#1A1A1A] border border-white/5 rounded-xl p-3 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Bulk</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={bulkCount}
                    onChange={(e) => setBulkCount(parseInt(e.target.value) || 1)}
                    className="w-full bg-[#1A1A1A] border border-white/5 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <button
                  onClick={generateVideos}
                  disabled={isGenerating || !prompt.trim()}
                  className="self-end p-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 transition-all shadow-lg shadow-emerald-500/10"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <label className="px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">History</label>
            <AnimatePresence mode="popLayout">
              {videos.map((video) => (
                <motion.div
                  key={video.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => {
                    setSelectedVideoId(video.id);
                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                  }}
                  className={cn(
                    "group relative p-3 rounded-xl border transition-all cursor-pointer",
                    selectedVideoId === video.id 
                      ? "bg-[#1A1A1A] border-emerald-500 shadow-lg shadow-emerald-500/5" 
                      : "bg-[#1A1A1A]/50 border-transparent hover:border-white/10"
                  )}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-medium text-white truncate max-w-[150px]">{video.prompt}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeVideo(video.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-zinc-500 uppercase tracking-widest">
                    <span>{video.segments.length} Segments</span>
                    <span>•</span>
                    <span>{video.segments.reduce((a, b) => a + b.durationInSeconds, 0).toFixed(1)}s</span>
                  </div>
                  
                  {video.downloadUrl && (
                    <div className="absolute bottom-3 right-3">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Main Content: Preview & Actions */}
        <div className="flex-1 bg-[#0A0A0A] flex flex-col h-full overflow-hidden relative">
          {/* Toggle Sidebar Button (Mobile/Tablet) */}
          {!isSidebarOpen && (
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="absolute top-4 left-4 z-40 p-3 bg-[#141414] border border-white/5 rounded-xl text-white shadow-xl lg:hidden"
            >
              <Layers className="w-5 h-5" />
            </button>
          )}

          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />
          
          <div className="flex-1 flex items-center justify-center p-4 lg:p-8 relative z-10">
            {selectedVideo ? (
              <div className="relative flex flex-col items-center gap-4 lg:gap-8 w-full max-w-md">
                <div className="relative w-full aspect-[9/16] max-h-[70vh] bg-black rounded-[2rem] lg:rounded-[2.5rem] shadow-2xl overflow-hidden border-[4px] lg:border-[6px] border-[#1A1A1A] ring-1 ring-white/5">
                  <VideoPreview segments={selectedVideo.segments} />
                </div>

                <div className="flex gap-3 w-full justify-center">
                  {selectedVideo.downloadUrl ? (
                    <a
                      href={selectedVideo.downloadUrl}
                      download={`video-${selectedVideo.id}.mp4`}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#1A1A1A] border border-white/10 rounded-full text-xs font-semibold text-white hover:bg-[#252525] shadow-xl transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download MP4
                    </a>
                  ) : (
                    <button
                      onClick={() => renderVideo(selectedVideo)}
                      disabled={selectedVideo.isRendering}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-full text-xs font-semibold hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 shadow-lg shadow-emerald-500/20 transition-all"
                    >
                      {selectedVideo.isRendering ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Rendering...
                        </>
                      ) : (
                        <>
                          <Layers className="w-3.5 h-3.5" />
                          Export to MP4
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="w-12 h-12 bg-[#141414] rounded-xl flex items-center justify-center mx-auto shadow-xl border border-white/5">
                  <Play className="w-6 h-6 text-zinc-800" />
                </div>
                <p className="text-zinc-500 text-xs">Select a video to preview and export.</p>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border-t border-red-500/20 text-red-400 text-[10px] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
