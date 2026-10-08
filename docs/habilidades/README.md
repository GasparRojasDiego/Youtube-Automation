# Habilidades: cómo escribirlas bien

Una habilidad es un archivo `.md` con **reglas concretas** que Claude sigue en cada video. Impórtalas en
**Habilidades → Instrucciones / Visuales → Importar .md**.

Una buena habilidad:

1. **Usa títulos cortos y viñetas.** Una idea por viñeta.
2. **Da reglas comprobables**, no deseos. Mal: «que sea interesante». Bien: «cada 60–90 s, una pregunta o giro».
3. **Incluye ejemplos buenos y malos** (✅ / ❌). Es lo que más mejora el resultado.
4. **Dice qué evitar.**
5. **Pone los valores técnicos en bloques `atril:*`** (JSON válido): colores, fuentes, palabras por minuto, etc.
6. **No repite reglas que ya tiene la app**, como el formato de salida, las licencias o el «no inventes datos».
7. **Tiene un tamaño razonable** (entre media página y dos páginas). Si es demasiado larga, se diluye.

Archivos de ejemplo:

- `guion.md`: Instrucciones (cómo sale el guion).
- `visual-imagenes.md`: Instrucciones visuales para fotos e imágenes con IA.
- `motion.md`: Instrucciones visuales para las animaciones (estilo «motion reel»).

Encabezado opcional (front matter) al inicio del archivo:

```
---
name: Guion del canal
description: Gancho, estructura y tono
---
```
