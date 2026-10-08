---
name: Imágenes del canal
description: Estilo de fotos, b-roll e imágenes con IA
---
# Estilo de imágenes

## Selección de material
- Cada imagen muestra lo que se dice en ese momento, de forma literal o con una metáfora clara.
- Prefiere planos con un sujeto claro y fondo limpio; evita collages y marcas de agua.
- Clips de movimiento para acciones (agua, tráfico, manos trabajando); fotos para objetos y lugares.

## Imágenes con IA
- Úsalas para escenas que no existen en bancos de imágenes: reconstrucciones, situaciones concretas, conceptos.
- Estilo: cinematográfico, luz natural lateral, lente de 35 mm, profundidad de campo baja, colores sobrios con un acento cálido.
- ✅ "Close-up of a mechanic's hands pouring green coolant into a car engine reservoir, garage at dusk, cinematic"
- ❌ "Car stuff" / textos dentro de la imagen / personas reales reconocibles.

## Color y montaje
- Tono general frío y limpio; sepia solo para archivo histórico.
- Cortes al ritmo de la narración; transiciones estilizadas solo en cambios de capítulo.

```atril:visual
{ "background": "#0E0E10", "foreground": "#F2EFE9", "muted": "#8A8A8A", "accent": "#C6F432",
  "fontTitle": "Inter", "fontBody": "Inter", "fontMono": "JetBrains Mono",
  "photorealistic": false,
  "imageStyle": "cinematic documentary still, 35mm lens, soft natural side light, shallow depth of field, muted palette with one warm accent, no text" }
```

```atril:montaje
{ "shotSeconds": [3, 6], "kenBurns": 0.08, "musicVolumeDb": -22, "humor": false, "grain": 3, "vignette": true }
```

```atril:subtitulos
{ "enabled": true, "font": "Poppins ExtraBold", "highlight": "#C6F432" }
```
