# ATRIL 2.4.0

Animaciones con más impacto visual y menos texto, y habilidades que llegan solo a la etapa que las usa.

## Descargar
- **`ATRIL_2.4.0_instalador_x64.exe`**: recomendado (conserva tus datos). Si ya tienes la 2.3, usa el botón «Actualizar» sobre Ajustes.
- `ATRIL_2.4.0_portable_x64.zip` y `ATRIL_2.4.0_x64.msi`: alternativas.

## Cambios
- **Animaciones: visual primero.** Las instrucciones internas ya no dicen que «la tipografía es la estrella»: cada escena necesita un protagonista visual (figuras, íconos, diagramas, mapas, cámara), con un máximo de 6 palabras a la vez. La revisión automática marca como defecto grave una animación dominada por texto o estática.
- **Kit de animación ampliado.** Piezas nuevas probadas con render real: cámara que entra a cualquier punto, ecos que se abren, inclinación 3D, cortina circular desde un borde, flechas con color que corre, núcleo que suelta figuras que se transforman, patrones, láminas alternadas, red de nodos (quién paga a quién), barra de censura, corte en franjas, foco, apagón, parpadeo, golpe de sello, temblor, órbita, cinta de texto y transiciones «latigazo» y «cortina».
- **Secciones por etapa en las habilidades.** Un título como «## Efectos [animaciones]» manda esa sección solo a esa etapa; debajo del editor ves cuánto recibe cada una. Menos texto inútil en cada llamada a Claude.
- **Fuentes nuevas:** Archivo y Courier Prime (licencia OFL), para animaciones, tarjetas y miniaturas. La miniatura acepta ahora el grosor de letra (`weight`).
- **Habilidades de Atril listas para pegar** en `docs/habilidades`: guion, referentes y visual (con un catálogo de 121 efectos).
- Correcciones: «Rehacer» en Storyboard, Retoques y Animaciones ahora vuelve a trabajar si cambiaste tus habilidades (antes devolvía el resultado anterior); el resaltador y la barra de censura se colocaban mal cuando la escena entraba con transición; el revisor de animaciones respeta las habilidades visuales y no exige a las capas superpuestas lo que es para pantalla completa.
