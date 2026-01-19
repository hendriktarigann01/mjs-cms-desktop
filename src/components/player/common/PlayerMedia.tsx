import { useState } from "react";
import {
  ScreenState,
  PlaybackState,
  PlaylistItem,
} from "@/components/player/types/player.types";
import { getFileUrl } from "@/lib/helper/contentHelpers";

interface PlayerMediaProps {
  screenState: ScreenState;
  playbackState: PlaybackState;
  currentItem: PlaylistItem | null;
}

export const PlayerMedia = ({
  screenState,
  playbackState,
  currentItem,
}: PlayerMediaProps) => {
  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // Screen is off
  if (screenState === "off") {
    return <div className="w-full h-full bg-black" />;
  }

  // Idle state (no content or stopped)
  if (playbackState === "stopped" || !currentItem) {
    return (
      <img
        src="../idle/idle-video.gif"
        alt="idle"
        className="w-full h-full object-contain"
      />
    );
  }

  const mediaUrl = getFileUrl(currentItem.content.upload_file);

  // Video content
  if (currentItem.content.format_name === "mp4") {
    return (
      <div className="w-full h-full relative">
        <video
          key={currentItem.content_id}
          autoPlay
          playsInline
          loop
          className="w-full h-full object-contain"
          onError={(e) => {
            console.error("[Video] Load error:", {
              contentId: currentItem.content_id,
              filename: currentItem.content.filename,
              url: mediaUrl,
              error: e,
            });
            setVideoError(true);
          }}
          onLoadedData={() => setVideoError(false)}
        >
          <source src={mediaUrl} type="video/mp4" />
        </video>
      </div>
    );
  }

  // Image content
  return (
    <div className="w-full h-full relative">
      <img
        key={currentItem.content_id}
        src={mediaUrl}
        alt={currentItem.content.filename}
        className="w-full h-full object-contain"
        onError={(e) => {
          console.error("[Image] Load error:", {
            contentId: currentItem.content_id,
            filename: currentItem.content.filename,
            url: mediaUrl,
            error: e,
          });
          setImageError(true);
        }}
        onLoad={() => setImageError(false)}
      />
    </div>
  );
};
