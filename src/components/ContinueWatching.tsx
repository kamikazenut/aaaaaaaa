'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useWatchHistory, type HistoryItem } from '@/hooks/use-watch-history';
import { Carousel } from '@/components/ui/carousel';
import { PlayerModal, type PlayerModalInfo } from '@/components/PlayerModal';
import { serverList, type Server } from '@/lib/serverList';
import { getPosterImage } from '@/lib/utils';
import { PlayCircle, Star, X, Loader2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
} from '@/components/ui/dialogs';

export function ContinueWatching() {
  const { history, isLoaded, removeFromHistory } = useWatchHistory();

  // === LIFTED STATE ===
  const [activeItem, setActiveItem] = useState<PlayerModalInfo | null>(null);
  const [isCheckingB2, setIsCheckingB2] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [serverSelectOpen, setServerSelectOpen] = useState(false);
  const [directUrl, setDirectUrl] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);

  if (!isLoaded || history.length === 0) return null;

  // === HANDLERS ===

  const handleItemClick = async (item: HistoryItem) => {
    if (isCheckingB2) return;
    setIsCheckingB2(true);

    // Construct the Player Info object
    const info: PlayerModalInfo = {
        tmdbId: item.tmdbId,
        title: item.title,
        showTitle: item.title, 
        type: item.media_type,
        season: item.season,
        episode: item.episode,
        posterPath: item.poster_path || undefined,
        backdropPath: item.backdrop_path || undefined,
        voteAverage: item.vote_average,
        overview: item.overview,
    };
    
    setActiveItem(info);

    const timestamp = Date.now();
    let targetUrl = '';
    if (item.media_type === 'movie') {
      targetUrl = `https://cdn.piracy.cloud/${item.tmdbId}/master.m3u8?t=${timestamp}`;
    } else {
      targetUrl = `https://cdn.piracy.cloud/${item.tmdbId}-${item.season}-${item.episode}/master.m3u8?t=${timestamp}`;
    }

    try {
      // 1. Check B2 (CDN)
      try {
        const response = await fetch(targetUrl, { method: 'HEAD', cache: 'no-store' });
        if (response.ok) {
          setDirectUrl(targetUrl);
          setSelectedServer(null);
          setPlayerOpen(true);
          setIsCheckingB2(false);
          return;
        }
      } catch (b2Error) {
        // Ignore
      }

      // 2. Check API (Vixsrc Only)
      let secondaryApiUrl = '';
      if (item.media_type === 'movie') {
          // NEW ENDPOINT: /api/streams/movie/{id}
          secondaryApiUrl = `https://api.piracy.cloud/api/streams/movie/${item.tmdbId}`;
      } else {
          // NEW ENDPOINT: /api/streams/series/{id}?season={s}&episode={e}
          secondaryApiUrl = `https://api.piracy.cloud/api/streams/series/${item.tmdbId}?season=${item.season}&episode=${item.episode}`;
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
                      setDirectUrl(vixsrcStream.url);
                      setSelectedServer(null);
                      setPlayerOpen(true);
                      setIsCheckingB2(false);
                      return;
                  }
              }
          }
      } catch (apiError) {
          // Ignore
      }

      // 3. Fallback to Server List
      setDirectUrl(null);
      setServerSelectOpen(true);

    } catch (error) {
      console.error("Check failed", error);
      setDirectUrl(null);
      setServerSelectOpen(true);
    } finally {
      setIsCheckingB2(false);
    }
  };

  const handleServerSelect = (server: Server) => {
    setSelectedServer(server);
    setDirectUrl(null);
    setServerSelectOpen(false);
    setPlayerOpen(true);
  };

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4 uppercase tracking-wider px-4 sm:px-8">
        Continue Watching
      </h2>
      <Carousel>
        {history.map((item) => {
          const displayTitle = item.title; 
          const progressPercent = item.progress && item.duration 
            ? (item.progress / item.duration) * 100 
            : 0;

          return (
            <div key={item.tmdbId} className="w-[180px] relative group pl-4">
              
              {/* === REMOVE BUTTON === */}
              <div className="absolute top-2 right-2 z-50 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-7 w-7 rounded-full shadow-md bg-red-600/90 hover:bg-red-700 border border-white/20 backdrop-blur-sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeFromHistory(item.tmdbId);
                  }}
                  title="Remove from history"
                >
                  <X className="h-3.5 w-3.5 text-white" />
                </Button>
              </div>

              {/* VISUAL CARD */}
              <div 
                className="block cursor-pointer text-left w-full h-full relative"
                onClick={() => handleItemClick(item)}
              >
                <div className="relative rounded-poster p-[1.5px] overflow-hidden animated-border-card">
                  <div className="aspect-[2/3] relative bg-muted/50 shadow-md rounded-[10.5px] overflow-hidden">
                      <Image
                        src={getPosterImage(item.poster_path, 'w342')}
                        alt={`Poster for ${displayTitle}`}
                        title={`Resume ${displayTitle}`}
                        fill
                        loading="lazy"
                        className="object-cover rounded-[10.5px]"
                        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 15vw"
                      />
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          {/* Show spinner if THIS specific item is loading */}
                          {isCheckingB2 && activeItem?.tmdbId === item.tmdbId ? (
                            <Loader2 className="w-12 h-12 text-primary animate-spin" />
                          ) : (
                            <PlayCircle className="w-16 h-16 text-white/80 drop-shadow-lg" />
                          )}
                      </div>
                      
                      <Badge className="absolute top-2 left-2 text-xs" variant="secondary">
                        {item.media_type === 'movie' ? 'Movie' : 'TV'}
                      </Badge>

                      {item.media_type === 'tv' && item.season && (
                        <Badge className="absolute bottom-3 right-2 text-xs bg-black/60 backdrop-blur-md text-white border border-white/20">
                          S{item.season} E{item.episode}
                        </Badge>
                      )}

                      {/* Red Progress Bar */}
                      {progressPercent > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700/50">
                          <div 
                            className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]" 
                            style={{ width: `${Math.min(progressPercent, 100)}%` }} 
                          />
                        </div>
                      )}
                  </div>
                </div>
                <div className="mt-2">
                    <h3 className="font-semibold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                      {displayTitle}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <Star className="w-3.5 h-3.5 text-yellow-400 fill-current" />
                        <span>{item.vote_average.toFixed(1)}</span>
                    </div>
                </div>
              </div>
            </div>
          );
        })}
      </Carousel>

      {/* === GLOBAL PLAYER COMPONENTS (Outside the loop) === */}
      
      {/* 1. Server Selection Dialog */}
      <Dialog open={serverSelectOpen} onOpenChange={setServerSelectOpen}>
        <DialogContent className="sm:max-w-md bg-card/90 backdrop-blur-lg border-border">
          <DialogHeader className="text-center space-y-3">
            <DialogTitle className="text-2xl">Select a Video Source</DialogTitle>
            <DialogDescription>Choose a server from the list below to start playing.</DialogDescription>
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

      {/* 2. The Actual Player */}
      {activeItem && (
        <PlayerModal 
          playerInfo={activeItem} 
          initialServer={selectedServer} 
          isOpen={playerOpen} 
          onOpenChange={setPlayerOpen}
          directUrl={directUrl || undefined}
        />
      )}
    </section>
  );
}