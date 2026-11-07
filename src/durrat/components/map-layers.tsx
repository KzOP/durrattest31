import { LayersControl, TileLayer } from 'react-leaflet';
import type { Lang } from '@/durrat/lib/i18n';

/** Map style switcher: dark, normal (light) and satellite only. */
export function MapLayers({ lang }: { lang: Lang }) {
  const en = lang === 'en';
  return (
    <LayersControl position="topleft" key={lang}>
      <LayersControl.BaseLayer checked name={en ? 'Dark' : 'داكنة'}>
        <TileLayer
          attribution="Tiles &copy; Esri"
          maxZoom={16}
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name={en ? 'Normal' : 'عادية'}>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name={en ? 'Satellite' : 'قمر صناعي'}>
        <TileLayer
          attribution="Tiles &copy; Esri — World Imagery"
          maxZoom={19}
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
      </LayersControl.BaseLayer>
    </LayersControl>
  );
}
