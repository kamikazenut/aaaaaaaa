'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DialogHeader,
  DialogDescription,
} from '@/components/ui/dialogs';
import { Skeleton } from './ui/skeleton';
import { serverList, type Server } from '@/lib/serverList';
import { getExternalIds, getEmbedFallback, getSeasonDetails, type EmbedFallbackInput } from '@/lib/tmdb';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Check, ShieldCheck, PlayCircle, SkipForward, Tv, Captions } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { Switch, Label } from './ui/forms';
import * as React from 'react';
import { useWatchHistory } from '@/hooks/use-watch-history';

const loadShakaUI = async () => {
  const shaka = (await import('shaka-player/dist/shaka-player.ui')).default;
  return shaka;
};

//================================================================//
// 1. TYPE DEFINITIONS
//================================================================//

export type PlayerModalInfo = {
  tmdbId: string;
  title: string;
  showTitle?: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  posterPath?: string;
  backdropPath?: string;
  voteAverage?: number;
  overview?: string;
};

type PlayerModalProps = {
  playerInfo: PlayerModalInfo;
  initialServer: Server | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  directUrl?: string;
};

//================================================================//
// 2. SHAKA PLAYER COMPONENT
//================================================================//

type ShakaPlayerProps = {
  src: string;
  title: string;
  playerInfo: PlayerModalInfo;
  startTime?: number;
  currentSeason?: number;
  currentEpisode?: number;
  onProgress: (progress: number, duration: number) => void;
};

const ShakaPlayerComponent = ({ src, title, playerInfo, startTime = 0, currentSeason, currentEpisode, onProgress }: ShakaPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdPlaying, setIsAdPlaying] = useState(false);

  const loadedSrcRef = useRef<string | null>(null);
  const initialTimeRef = useRef(startTime);
  const hasSeekedRef = useRef(false);

  const VAST_TAG_URL = 'https://youradexchange.com/video/select.php?r=10410246';

  const playerRef = useRef<any>(null);
  const uiRef = useRef<any>(null);
  const adManagerRef = useRef<any>(null);

  // 1. Track progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isAdPlaying && video.duration > 0) {
        onProgress(video.currentTime, video.duration);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [isAdPlaying, onProgress]);

  // 2. Initialize Player (Run Once)
  useEffect(() => {
    const initPlayer = async () => {
      if (playerRef.current) return; 

      const shaka = await loadShakaUI();
      shaka.polyfill.installAll();

      if (shaka.Player.isBrowserSupported() && videoRef.current && containerRef.current && adContainerRef.current) {
        const player = new shaka.Player();
        await player.attach(videoRef.current);
        playerRef.current = player;

        // Configure to ignore subtitle errors so video keeps playing
        player.configure({
            streaming: {
                ignoreTextStreamFailures: true,
                alwaysStreamText: true,
            },
        });

        const ui = new shaka.ui.Overlay(player, containerRef.current, videoRef.current);
        uiRef.current = ui;

        const adManager = player.getAdManager();
        adManagerRef.current = adManager;
        adManager.initClientSide(adContainerRef.current, videoRef.current);

        if ((window as any).google && (window as any).google.ima) {
            const adRequest = new (window as any).google.ima.AdsRequest();
            adRequest.adTagUrl = VAST_TAG_URL;
            adManager.requestClientSideAds(adRequest);
        }

        adManager.addEventListener(shaka.ads.AdManager.AD_STARTED, () => setIsAdPlaying(true));
        const onAdStopped = () => setIsAdPlaying(false);
        adManager.addEventListener(shaka.ads.AdManager.AD_STOPPED, onAdStopped);
        adManager.addEventListener(shaka.ads.AdManager.CONTENT_RESUME_REQUESTED, onAdStopped);

        ui.configure({
          'controlPanelElements': ['play_pause', 'time_and_duration', 'spacer', 'mute', 'volume', 'fullscreen', 'overflow_menu'],
          'overflowMenuButtons': ['quality', 'language', 'captions', 'playback_rate', 'cast'],
          'seekBarColors': { base: 'rgba(255, 255, 255, 0.3)', buffered: 'rgba(255, 255, 255, 0.54)', played: 'rgb(66, 165, 245)' }
        });

        player.addEventListener('error', (event: any) => {
             if (event.detail.severity === 2) {
                console.error('Shaka Critical:', event.detail);
                setError('Video Error: ' + event.detail.code);
             } else {
                console.warn('Shaka Non-Critical:', event.detail);
             }
        });
      } else {
        setError('Browser not supported.');
      }
    };

    initPlayer();

    return () => {
      if (uiRef.current) uiRef.current.destroy();
      if (playerRef.current) playerRef.current.destroy();
    };
  }, []);

  // 3. Load Content & Subtitles
  useEffect(() => {
    const loadContent = async () => {
        const player = playerRef.current;
        if (!player || !src || loadedSrcRef.current === src) return;

        try {
            console.log("Loading new source:", src);
            loadedSrcRef.current = src; 
            
            // Load video
            await player.load(src);
            
            // === SUBTITLE LOGIC ===
            try {
                const seasonToUse = currentSeason || playerInfo.season || 1;
                const episodeToUse = currentEpisode || playerInfo.episode || 1;

                let subUrl = '';
                if (playerInfo.type === 'movie') {
                    subUrl = `https://sub.wyzie.ru/search?id=${playerInfo.tmdbId}`;
                } else {
                    subUrl = `https://sub.wyzie.ru/search?id=${playerInfo.tmdbId}&season=${seasonToUse}&episode=${episodeToUse}`;
                }

                console.log("Fetching subtitles:", subUrl);
                const subRes = await fetch(subUrl);
                if (subRes.ok) {
                    const subData = await subRes.json();
                    
                    if (Array.isArray(subData)) {
                        for (const sub of subData) {
                            if (sub.url) {
                                const lang = sub.language || sub.lang || sub.code || 'en';
                                const label = sub.display || sub.name || sub.label || lang;
                                let mimeType = 'text/vtt';
                                if (sub.format === 'srt') mimeType = 'text/srt';
                                else if (sub.format === 'vtt') mimeType = 'text/vtt';

                                await player.addTextTrackAsync(
                                    sub.url, 
                                    lang, 
                                    'subtitles', 
                                    mimeType, 
                                    null, 
                                    label
                                ).catch((e: any) => console.warn("Skipped track:", label));
                            }
                        }
                        console.log(`Loaded ${subData.length} subtitles.`);
                    }
                }
            } catch (subError) {
                console.warn("Failed to load subtitles:", subError);
            }

            // === SEEK LOGIC ===
            if (src !== player.getAssetUri?.()) { 
               hasSeekedRef.current = false; 
            }

            if (!hasSeekedRef.current && startTime > 10 && videoRef.current) {
                videoRef.current.currentTime = startTime;
                hasSeekedRef.current = true;
            }
        } catch (e: any) {
            console.error('Error loading video:', e);
        }
    };

    if (playerRef.current) {
        loadContent();
    } else {
        const interval = setInterval(() => {
            if (playerRef.current) {
                clearInterval(interval);
                loadContent();
            }
        }, 100);
        return () => clearInterval(interval);
    }
  }, [src, startTime, currentSeason, currentEpisode, playerInfo.tmdbId, playerInfo.type, playerInfo.season, playerInfo.episode]); 

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-white bg-black z-50">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0 bg-black w-full h-full shadow-player-ui group" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <video 
        ref={videoRef} 
        className="w-full h-full" 
        autoPlay 
        playsInline 
        // muted removed
        controls={false}
        crossOrigin="anonymous" 
        style={{ width: '100%', height: '100%' }} 
      />
      <div ref={adContainerRef} className={cn("absolute inset-0 z-[200]", isAdPlaying ? "pointer-events-auto" : "pointer-events-none")} />
    </div>
  );
}

const MemoizedShakaPlayer = React.memo(ShakaPlayerComponent, (prev, next) => {
  return prev.src === next.src && 
         prev.startTime === next.startTime && 
         prev.currentSeason === next.currentSeason && 
         prev.currentEpisode === next.currentEpisode; 
});


//================================================================//
// 3. MAIN PLAYER MODAL COMPONENT
//================================================================//
export function PlayerModal({ playerInfo, initialServer, isOpen, onOpenChange, directUrl }: PlayerModalProps) {
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <PlayerModalContent
        playerInfo={playerInfo}
        initialServer={initialServer}
        onClose={() => onOpenChange(false)}
        directUrl={directUrl}
      />
    </Dialog>
  );
}

//================================================================//
// 4. PLAYER MODAL CONTENT
//================================================================//

type PlayerModalContentProps = {
  playerInfo: PlayerModalInfo;
  initialServer: Server | null;
  onClose: () => void;
  directUrl?: string;
};

function PlayerModalContent({ playerInfo, initialServer, onClose, directUrl: initialDirectUrl }: PlayerModalContentProps) {
  const [currentSeason, setCurrentSeason] = useState(playerInfo.season || 1);
  const [currentEpisode, setCurrentEpisode] = useState(playerInfo.episode || 1);
  const [totalEpisodesInSeason, setTotalEpisodesInSeason] = useState<number | null>(null);

  const [currentServer, setCurrentServer] = useState<Server | null>(initialServer);
  const [currentUrl, setCurrentUrl] = useState(initialDirectUrl || '');
  const [isDirectStream, setIsDirectStream] = useState(!!initialDirectUrl);
  const [imdbId, setImdbId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialDirectUrl);
  
  // AUTO-PLAY STATE
  const [autoPlayTimer, setAutoPlayTimer] = useState<number | null>(null);
  const [isAutoPlayCancelled, setIsAutoPlayCancelled] = useState(false);
  
  const { toast } = useToast();
  const { addToHistory, updateProgress, history, isLoaded: isHistoryLoaded } = useWatchHistory();
  const [isSandboxed, setIsSandboxed] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  const toggleSandbox = () => {
    setIsSandboxed(prev => !prev);
    setIframeKey(prev => prev + 1);
  };

  const handleServerChange = (serverName: string) => {
    const newServer = serverList.find(s => s.name === serverName);
    if (newServer) {
      setCurrentServer(newServer);
      setIsDirectStream(false);
    }
  };

  const handleProviderSelect = (server: Server) => {
     setCurrentServer(server);
     setIsDirectStream(false);
  };

  // FETCH EPISODE COUNT
  useEffect(() => {
    if (playerInfo.type !== 'tv') return;

    const fetchSeasonInfo = async () => {
        try {
            const seasonData = await getSeasonDetails(playerInfo.tmdbId, currentSeason);
            if (seasonData && seasonData.episodes) {
                setTotalEpisodesInSeason(seasonData.episodes.length);
            }
        } catch (error) {
            console.error("Failed to fetch season details", error);
        }
    };

    fetchSeasonInfo();
  }, [playerInfo.tmdbId, playerInfo.type, currentSeason]);

  const handleNextEpisode = useCallback(async () => {
    setIsLoading(true);
    setCurrentUrl(''); 
    setCurrentServer(null);
    setIsDirectStream(false);
    setAutoPlayTimer(null);
    setIsAutoPlayCancelled(false);
    
    if (totalEpisodesInSeason && currentEpisode >= totalEpisodesInSeason) {
        setCurrentSeason(prev => prev + 1);
        setCurrentEpisode(1);
    } else {
        setCurrentEpisode(prev => prev + 1);
    }
  }, [currentEpisode, totalEpisodesInSeason]);

  // HANDLE PROGRESS & AUTO-PLAY TRIGGER
  const handleProgress = useCallback((progress: number, duration: number) => {
    updateProgress(playerInfo.tmdbId, progress, duration);

    // Auto-play Logic (TV Shows Only)
    if (playerInfo.type === 'tv' && duration > 0) {
        const timeLeft = duration - progress;
        
        if (timeLeft <= 15 && timeLeft > 0 && !isAutoPlayCancelled) {
            // Start timer if not already started
            if (autoPlayTimer === null) {
                setAutoPlayTimer(10); // Start 10s countdown
            }
        } else {
            // Reset if user seeks back
            if (timeLeft > 20 && autoPlayTimer !== null) {
                setAutoPlayTimer(null);
                setIsAutoPlayCancelled(false);
            }
        }
    }
  }, [playerInfo.tmdbId, playerInfo.type, updateProgress, isAutoPlayCancelled, autoPlayTimer]);

  // AUTO-PLAY COUNTDOWN EFFECT
  useEffect(() => {
    if (autoPlayTimer === null || autoPlayTimer < 0) return;

    if (autoPlayTimer === 0) {
        handleNextEpisode();
        setAutoPlayTimer(null);
        return;
    }

    const timer = setTimeout(() => {
        setAutoPlayTimer(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoPlayTimer, handleNextEpisode]);


  // === RESOLVE SOURCE LOGIC (Vixsrc Only + New Endpoints) ===
  useEffect(() => {
    const resolveSource = async () => {
      setIsLoading(true);
      const timestamp = Date.now();

      // 1. Check B2 (Primary Direct)
      const targetB2Url = playerInfo.type === 'movie' 
        ? `https://cdn.piracy.cloud/${playerInfo.tmdbId}/master.m3u8?t=${timestamp}`
        : `https://cdn.piracy.cloud/${playerInfo.tmdbId}-${currentSeason}-${currentEpisode}/master.m3u8?t=${timestamp}`;

      try {
        const response = await fetch(targetB2Url, { method: 'HEAD', cache: 'no-store' });
        if (response.ok) {
          console.log("B2 Found!");
          setCurrentUrl(targetB2Url);
          setIsDirectStream(true);
          setIsLoading(false);
          return;
        }
      } catch (e) {
        // Ignore error
      }

      // 2. Check Secondary API (Vixsrc Logic)
      let secondaryApiUrl = '';
      if (playerInfo.type === 'movie') {
          // NEW ENDPOINT: /api/streams/movie/{id}
          secondaryApiUrl = `https://api.piracy.cloud/api/streams/movie/${playerInfo.tmdbId}`;
      } else {
          // NEW ENDPOINT: /api/streams/series/{id}?season={s}&episode={e}
          secondaryApiUrl = `https://api.piracy.cloud/api/streams/series/${playerInfo.tmdbId}?season=${currentSeason}&episode=${currentEpisode}`;
      }

      try {
          const apiRes = await fetch(secondaryApiUrl, { cache: 'no-store' });
          if (apiRes.ok) {
              const data = await apiRes.json();
              console.log("API Data:", data);

              if (data.streams && Array.isArray(data.streams)) {
                  // === STRICTLY FIND VIXSRC ===
                  const vixsrcStream = data.streams.find((s: any) => 
                      (s.name && s.name.toLowerCase().includes('vixsrc')) || 
                      (s.provider && s.provider.toLowerCase().includes('vidsrc'))
                  );
                  
                  if (vixsrcStream && vixsrcStream.url) {
                      console.log("Vixsrc Stream Found:", vixsrcStream);
                      setCurrentUrl(vixsrcStream.url);
                      setIsDirectStream(true);
                      setIsLoading(false);
                      return;
                  }
              }
          }
      } catch (e) {
          console.error("API Error:", e);
      }

      // 3. Fallback to Provider List
      console.log("No Vixsrc or direct stream found. Using providers.");
      if (currentServer) {
        try {
          let idToUse = playerInfo.tmdbId;
          if (currentServer.useImdb) {
            if (!imdbId) {
              const ids = await getExternalIds(playerInfo.type, playerInfo.tmdbId);
              if (ids?.imdb_id) {
                setImdbId(ids.imdb_id);
                idToUse = ids.imdb_id;
              }
            } else {
              idToUse = imdbId;
            }
          }

          const url = playerInfo.type === 'movie'
            ? currentServer.movieLink(idToUse)
            : currentServer.episodeLink(idToUse, currentSeason, currentEpisode);
          
          setCurrentUrl(url);
          setIsDirectStream(false);
        } catch (error) {
          console.error("Error getting provider link", error);
        }
      }
      setIsLoading(false);
    };

    if (currentSeason === playerInfo.season && currentEpisode === playerInfo.episode && initialDirectUrl && currentUrl === initialDirectUrl) {
        // Do nothing
    } else {
        resolveSource();
    }

    addToHistory({
      id: parseInt(playerInfo.tmdbId) || 0, 
      tmdbId: playerInfo.tmdbId,
      title: playerInfo.showTitle || playerInfo.title,
      media_type: playerInfo.type,
      poster_path: playerInfo.posterPath || null,
      backdrop_path: playerInfo.backdropPath || null,
      vote_average: playerInfo.voteAverage || 0,
      overview: playerInfo.overview || '',
      season: currentSeason,
      episode: currentEpisode,
    });
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSeason, currentEpisode, currentServer, imdbId]);

  const savedTime = useMemo(() => {
    const savedItem = history.find(item => 
        item.tmdbId === playerInfo.tmdbId &&
        item.season === currentSeason &&
        item.episode === currentEpisode
    );
    return savedItem?.progress || 0;
  }, [history, playerInfo.tmdbId, currentSeason, currentEpisode]);

  if (!isHistoryLoaded) {
    return (
        <DialogContent className="bg-black border-none p-0 max-w-full w-full h-full flex flex-col gap-0 rounded-none overflow-hidden" aria-describedby={undefined}>
             <div className="absolute inset-0 flex items-center justify-center bg-black">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
             </div>
        </DialogContent>
    );
  }

  const displayTitle = playerInfo.type === 'movie' 
    ? playerInfo.title 
    : `${playerInfo.showTitle || playerInfo.title} - S${currentSeason}E${currentEpisode}`;

  return (
    <DialogContent 
      className="bg-black border-none p-0 max-w-full w-full h-full flex flex-col gap-0 rounded-none overflow-hidden"
      onInteractOutside={(e) => e.preventDefault()}
      aria-describedby={undefined}
    >
      <DialogTitle className="sr-only">{`Player for ${displayTitle}`}</DialogTitle>
      <DialogDescription className="sr-only">Video player for {displayTitle}</DialogDescription>
      
      <div className="flex-grow bg-black relative w-full h-full flex flex-col">
        {isLoading && (
             <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
             </div>
        )}
        
        {!isLoading && currentUrl ? (
          isDirectStream ? (
            <MemoizedShakaPlayer 
              src={currentUrl} 
              title={displayTitle} 
              startTime={savedTime}
              currentSeason={currentSeason}
              currentEpisode={currentEpisode}
              onProgress={handleProgress} // Use local wrapper handler
              playerInfo={playerInfo} 
            />
          ) : (
            <FullscreenVideoPlayer
              src={currentUrl}
              title={displayTitle}
              isSandboxed={isSandboxed}
              iframeKey={iframeKey}
            />
          )
        ) : null}

        {!isLoading && !currentUrl && (
            <div className="flex-grow flex flex-col items-center justify-center p-8 space-y-8 bg-black text-white">
                <div className="text-center space-y-2">
                    <Tv className="w-16 h-16 mx-auto text-muted-foreground opacity-50" />
                    <h3 className="text-2xl font-bold">Select a Source</h3>
                    <p className="text-muted-foreground">
                        {playerInfo.type === 'tv' ? `No direct stream for S${currentSeason}E${currentEpisode}. Choose a provider:` : 'Choose a provider to watch:'}
                    </p>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 w-full max-w-3xl max-h-[60vh] overflow-y-auto p-2">
                    {serverList.map(server => (
                        <Button 
                            key={server.id} 
                            variant="outline" 
                            className="h-auto py-4 text-base hover:bg-primary/20 hover:border-primary transition-all bg-black/50 border-white/10"
                            onClick={() => handleProviderSelect(server)}
                        >
                            {server.name}
                        </Button>
                    ))}
                </div>
            </div>
        )}
        
        {/* AUTO-PLAY POPUP OVERLAY */}
        {autoPlayTimer !== null && (
            <div className="absolute bottom-20 right-8 z-[400] bg-card/95 border border-white/10 backdrop-blur-md p-4 rounded-lg shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-300 max-w-xs pointer-events-auto">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-medium text-muted-foreground">Next Episode</span>
                        <span className="font-mono font-bold text-primary text-xl">{autoPlayTimer}s</span>
                    </div>
                    <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-primary transition-all duration-1000 ease-linear" 
                            style={{ width: `${(autoPlayTimer / 10) * 100}%` }}
                        />
                    </div>
                    <div className="flex gap-2 mt-1">
                        <Button 
                            size="sm" 
                            className="flex-1 font-bold" 
                            onClick={handleNextEpisode}
                        >
                            <PlayCircle className="w-4 h-4 mr-2" />
                            Play Now
                        </Button>
                        <Button 
                            size="sm" 
                            variant="outline"
                            className="px-3"
                            onClick={() => {
                                setAutoPlayTimer(null);
                                setIsAutoPlayCancelled(true);
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            </div>
        )}

        <PlayerUI
          title={displayTitle}
          onClose={onClose}
          currentServer={currentServer}
          serverList={serverList}
          onServerChange={handleServerChange}
          isLoading={isLoading}
          isSandboxed={isSandboxed}
          onToggleSandbox={toggleSandbox}
          isDirectStream={isDirectStream}
          showNextEpisode={playerInfo.type === 'tv'}
          onNextEpisode={handleNextEpisode}
          hasUrl={!!currentUrl}
        />
      </div>
    </DialogContent>
  );
}

//================================================================//
// 5. FULLSCREEN VIDEO PLAYER (Iframe Renderer)
//================================================================//

function FullscreenVideoPlayer({ src, title, isSandboxed, iframeKey }: any) {
  const sandboxProps = {
    sandbox: "allow-forms allow-scripts allow-pointer-lock allow-same-origin allow-top-navigation",
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-black">
      <iframe
        key={iframeKey}
        src={src}
        title={title}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen"
        allowFullScreen
        {...(isSandboxed ? sandboxProps : {})}
      />
    </div>
  );
}

//================================================================//
// 6. PLAYER UI (Overlay Controls)
//================================================================//

function PlayerUI({ title, onClose, currentServer, serverList, onServerChange, isLoading, isSandboxed, onToggleSandbox, isDirectStream, showNextEpisode, onNextEpisode, hasUrl }: any) {
  return (
    <div className="absolute inset-0 pointer-events-none z-[300]">
      <div className="absolute top-0 left-0 right-0 p-2 md:p-4 bg-gradient-to-b from-black/70 to-transparent flex justify-between items-center gap-2 pointer-events-auto transition-opacity duration-300 opacity-100 hover:opacity-100">
        <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10 hover:text-white flex-shrink-0">
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-base md:text-xl font-bold text-white text-shadow-lg line-clamp-1">{title}</h1>
          {isDirectStream && <span className="bg-black text-red-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-white/20 shadow-sm">Direct</span>}
        </div>
        
        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
          {/* NEXT EPISODE BUTTON */}
          {showNextEpisode && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-white hover:bg-white/10 gap-2 border border-white/10 bg-black/30 backdrop-blur-sm"
              onClick={onNextEpisode}
            >
              <span className="hidden sm:inline">Next Ep</span>
              <SkipForward className="h-4 w-4" />
            </Button>
          )}

          {!isDirectStream && hasUrl && (
            <>
              <div className="flex items-center gap-2 px-2">
                <Label htmlFor="sandbox-switch" className={cn('hidden sm:block text-xs font-bold uppercase tracking-wider cursor-pointer', isSandboxed ? 'text-green-400' : 'text-red-400')}>Sandbox</Label>
                <Switch id="sandbox-switch" checked={isSandboxed} onCheckedChange={onToggleSandbox} />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white">
                    {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Captions className="h-6 w-6" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64 bg-background/80 border-border backdrop-blur-md mt-2 p-2 space-y-1">
                  <DropdownMenuRadioGroup value={currentServer?.name} onValueChange={onServerChange}>
                    {serverList.map(server => (
                      <DropdownMenuRadioItem key={server.id} value={server.name} className={cn('flex justify-between items-center cursor-pointer p-2 rounded-md border border-transparent transition-all focus:bg-accent focus:text-accent-foreground data-[state=checked]:bg-accent/50 hover:border-primary/50', currentServer?.name === server.name && 'border-primary')}>
                        <span>{server.name}</span>
                        {currentServer?.name === server.name && <Check className="h-4 w-4 text-primary" />}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

//================================================================//
// 7. SERVER SELECTION MODAL & PLAY BUTTON (Exports)
//================================================================//

type ServerSelectionModalProps = {
  playerInfo: PlayerModalInfo;
  children: React.ReactNode;
};

export function ServerSelectionModal({ playerInfo, children }: ServerSelectionModalProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  
  const [b2Url, setB2Url] = useState<string | null>(null);
  const [isCheckingB2, setIsCheckingB2] = useState(false);

  // === UPDATED LOGIC (Dialog Opening) ===
  const checkB2AndPlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isCheckingB2) return;
    setIsCheckingB2(true);

    const timestamp = Date.now();
    let targetUrl = '';
    if (playerInfo.type === 'movie') {
      targetUrl = `https://cdn.piracy.cloud/${playerInfo.tmdbId}/master.m3u8?t=${timestamp}`;
    } else {
      targetUrl = `https://cdn.piracy.cloud/${playerInfo.tmdbId}-${playerInfo.season}-${playerInfo.episode}/master.m3u8?t=${timestamp}`;
    }

    try {
      // 1. Check B2
      try {
        const response = await fetch(targetUrl, { method: 'HEAD', cache: 'no-store' });
        if (response.ok) {
          setB2Url(targetUrl);
          setSelectedServer(null);
          setPlayerOpen(true);
          return;
        }
      } catch (b2Error) {
        // Ignore B2 errors
      }

      // 2. Check Secondary API
      let secondaryApiUrl = '';
      if (playerInfo.type === 'movie') {
          // NEW ENDPOINT: /api/streams/movie/{id}
          secondaryApiUrl = `https://api.piracy.cloud/api/streams/movie/${playerInfo.tmdbId}`;
      } else {
          // NEW ENDPOINT: /api/streams/series/{id}?season={s}&episode={e}
          secondaryApiUrl = `https://api.piracy.cloud/api/streams/series/${playerInfo.tmdbId}?season=${playerInfo.season}&episode=${playerInfo.episode}`;
      }
      
      try {
          const apiRes = await fetch(secondaryApiUrl, { cache: 'no-store' });
          if (apiRes.ok) {
              const data = await apiRes.json();
              
              if (data.streams && Array.isArray(data.streams)) {
                  // === STRICTLY FIND VIXSRC ===
                  const vixsrcStream = data.streams.find((s: any) => 
                      (s.name && s.name.toLowerCase().includes('vixsrc')) || 
                      (s.provider && s.provider.toLowerCase().includes('vidsrc'))
                  );
                  
                  if (vixsrcStream && vixsrcStream.url) {
                      setB2Url(vixsrcStream.url);
                      setSelectedServer(null);
                      setPlayerOpen(true);
                      return;
                  }
              }
          }
      } catch (apiError) {
          console.error("API Error", apiError);
      }
      
      // 3. Fallback to Providers
      setDialogOpen(true);

    } catch (error) {
      setDialogOpen(true);
    } finally {
      setIsCheckingB2(false);
    }
  };

  const handleServerSelect = (server: Server) => {
    setSelectedServer(server);
    setB2Url(null);
    setDialogOpen(false);
    setPlayerOpen(true);
  };

  const trigger = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child as React.ReactElement<any>, {
        onClick: checkB2AndPlay,
        disabled: isCheckingB2 || child.props.disabled,
        children: isCheckingB2 ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Checking...
          </>
        ) : (
          child.props.children
        )
      });
    }
    return child;
  });

  return (
    <>
      {trigger}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card/90 backdrop-blur-lg border-border">
          <DialogHeader className="text-center space-y-3">
            <DialogTitle className="text-2xl">Select a Video Source</DialogTitle>
            <DialogDescription>
              Choose a server from the list below to start playing.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 bg-green-950/50 text-green-300 border border-green-700/30 p-3 rounded-lg">
            <div className="flex items-center gap-3 text-xs">
              <ShieldCheck className="h-8 w-8 flex-shrink-0" />
              <div>
                <p className="font-bold">PRO TIP: Use the 'Sandbox ON' switch in the player to block most ads.</p>
                <p className="text-green-400/80">Only turn it OFF if the video doesn't load.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-4">
            {serverList.map(server => (
              <Button
                key={server.id}
                variant="outline"
                className="h-auto justify-center p-3 text-sm font-semibold whitespace-normal hover:bg-primary/10 hover:border-primary/50 transition-all"
                onClick={() => handleServerSelect(server)}
              >
                {server.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {(playerOpen) && (
        <Dialog open={playerOpen} onOpenChange={setPlayerOpen}>
           <PlayerModalContent
            playerInfo={playerInfo}
            initialServer={selectedServer}
            onClose={() => setPlayerOpen(false)}
            directUrl={b2Url || undefined}
          />
        </Dialog>
      )}
    </>
  );
}

type PlayButtonProps = {
  title: string;
  showTitle?: string; // ADDED: For clean history saving
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  season?: number;
  episode?: number;
  children?: React.ReactNode;
  posterPath?: string;
  backdropPath?: string;
  voteAverage?: number;
  overview?: string;
};

export function PlayButton({ title, showTitle, mediaType, tmdbId, season, episode, children, posterPath, backdropPath, voteAverage, overview }: PlayButtonProps) {
  const playerInfo: PlayerModalInfo = {
    tmdbId: String(tmdbId),
    title,
    showTitle, // Pass it through
    type: mediaType,
    ...(season && { season }),
    ...(episode && { episode }),
    posterPath,
    backdropPath,
    voteAverage,
    overview
  };

  const triggerContent = children || (
    <Button size="lg" className="font-bold text-base transition-all duration-300 hover:scale-105">
      <PlayCircle className="mr-2 h-6 w-6" />
      Play
    </Button>
  );

  return (
    <ServerSelectionModal playerInfo={playerInfo}>
      {triggerContent}
    </ServerSelectionModal>
  );
}