import { useEffect, useState } from "react";
import { useBus } from "../lib/bus";
import { getVideo, type Video } from "../lib/repo";
import { Spinner } from "../ui/kit";
import { ProductionView } from "./Studio";

/** Un video concreto (desde Videos o Inicio), con la misma vista que Producción. */
export function VideoDetail({ id }: { id: string }) {
  const tick = useBus("videos");
  const [video, setVideo] = useState<Video | null>(null);
  useEffect(() => { void getVideo(id).then(setVideo); }, [id, tick]);
  return video ? <ProductionView video={video} back /> : <div className="flex justify-center py-20"><Spinner size={22} /></div>;
}
