import { Maximize, Minimize, Menu } from "lucide-react";
import { useState } from "react";
import Image from "next/image";

interface PlayerHeaderProps {
  isVisible: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenMenu: () => void;
}

export const PlayerHeader = ({
  isVisible,
  isFullscreen,
  onToggleFullscreen,
  onOpenMenu,
}: PlayerHeaderProps) => {
  const [isHovered, setIsHovered] = useState(false);

  if (!isVisible) return null;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="absolute top-0 left-0 right-0 h-24 z-10 flex items-start justify-center pt-4"
    >
      <div
        className={`flex items-center gap-2 w-[95%] h-16 rounded-lg transition-opacity duration-300 ${
          isHovered ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex justify-between mx-6 w-full items-center">
          <div className="h-10">
            <img
           src="../logo/converra-text-beside-white.png"
              alt="logo converra"
              className="w-[140px] h-[60px] object-contain"
            />
          </div>
          <div className="flex gap-6 items-center">
            <button
              onClick={onOpenMenu}
              className="hover:bg-white/30 p-2 rounded transition-colors text-white"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <button
              onClick={onToggleFullscreen}
              className="hover:bg-white/30 p-2 rounded transition-colors text-white"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
