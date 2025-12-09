'use client';

import Link from 'next/link';
import { Film } from 'lucide-react';
import { siteConfig } from '@/config/site';
import { SurpriseMeButton } from './SurpriseMeButton';
import { SearchInput } from './SearchInput';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/dialogs';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-800 bg-black/80 backdrop-blur-sm">
      <div className="flex h-20 items-center px-4 sm:px-8">
        <div className="flex items-center">
          <Link href="/" className="mr-4 sm:mr-8 flex items-center space-x-2" prefetch={false}>
            <Film className="h-8 w-8 text-primary" />
            <span className="hidden sm:inline-block font-black text-2xl tracking-tighter">{siteConfig.name}</span>
          </Link>
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
            {siteConfig.mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="transition-colors text-foreground/70 hover:text-foreground"
                prefetch={false}
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </div>
        
        <div className="flex flex-1 items-center justify-end space-x-2">
          
          {/* DISCORD BUTTON (Now First) */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild className="text-foreground/70 hover:text-foreground hover:bg-primary/10">
                  <Link href="https://discord.gg/nZua9KNkNW" target="_blank" rel="noopener noreferrer" aria-label="Join Discord">
                    <svg
                      role="img"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 fill-current"
                    >
                      <title>Discord</title>
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.418 0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.418 0 1.334-.946 2.419-2.157 2.419z"/>
                    </svg>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Join our Discord</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="w-full max-w-xs sm:max-w-sm">
            <SearchInput />
          </div>
          
          <SurpriseMeButton />

        </div>
      </div>
    </header>
  );
}