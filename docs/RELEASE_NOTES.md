# ATRIL 2.5.14

ATRIL se viste como Frame y Wire, y el color de la app se elige: azul, violeta, verde, naranja, rosa o turquesa.

## Descargar
- **`ATRIL_2.5.14_instalador_x64.exe`** (recomendado). Desde la 2.5.1 o posterior, pulsa el botón de descarga junto a tu perfil.
- `ATRIL_2.5.14_portable_x64.zip` (versión portátil).
- `SHA256SUMS.txt`, con las huellas para comprobar cada descarga.

## Color de la app
- **Ajustes, arriba:**
  - **Tema:** el del equipo, claro «arena» u oscuro grafito.
  - **Color:** seis opciones.
  - También se elige en la bienvenida y desde Claude.
- **Sin destello al abrir:** el tema y el color se aplican antes de pintar la ventana.
- **Legibles en los dos temas:** cada color tiene los tonos de la familia y su luminosidad medida para el contraste AA.
  - El texto de color tiene al menos 4,5:1 sobre las tarjetas.
  - El texto blanco tiene al menos 4,5:1 sobre lo sólido.
  - Una prueba lo comprueba para los seis colores.
- **Por eso, en el tema oscuro los botones sólidos usan una variante más honda del color:** el texto blanco sobre el azul de Frame queda en 2,9:1.

## Estética de la familia VT Asvent
- **Tipografía:** Poppins en toda la interfaz; antes era la del sistema. La monoespaciada queda solo para código, claves e identificadores.
- **Fondos:** oscuro grafito y claro «arena» con los valores de Frame y Wire. Antes había un oscuro casi negro y tarjetas casi blancas.
- **Botones,** con los nombres de la familia:
  - **sólido**, para la acción principal;
  - **fantasma**, para lo relevante sin peso;
  - **gris**, para cancelar y para lo que abre un borrado (las papeleras ya no son rojas);
  - **rojo**, solo en la confirmación final.
- **Tarjetas:** sólidas, con una divisoria fina y con aire bajo el título. Las cifras de Producción van en columnas con divisorias verticales.
- **Ventanas emergentes:**
  - título centrado en el color de la app;
  - eco quieto de su primera palabra detrás;
  - divisoria con aire.
- **Sobrio:**
  - sin mayúsculas sostenidas (solo la marca);
  - sin brillos ni manchas de color;
  - desplegables neutros;
  - barra de desplazamiento y selección de texto en el color elegido.
- **Menú lateral:** sólido, con opciones más altas e íconos en color. La opción activa sigue en un tono claro, ahora del color elegido.
- **Bienvenida:** como la entrada de Frame, con el color elegible desde el principio.
- **Arreglos:**
  - los desplegables cortaban las colas de letras como la «q», por la altura de Poppins;
  - un nombre de voz largo se salía de su recuadro.

## Desde Claude (MCP)
- Herramienta nueva **`atril_appearance`:** consulta o cambia el tema y el color («pon ATRIL en verde»). Ya son 21 herramientas.

## Si vienes de una versión anterior a la 2.5.12
También llegan:
- **Claude usa ATRIL:** servidor MCP, 2.5.12 y 2.5.13.
- **Desde la 2.5.10:**
  - duración exacta;
  - voces para elegir;
  - campañas;
  - estudios separados de YouTube y TikTok.

El detalle está en las notas de cada versión, en *Releases*.

## Verificado
- TypeScript, compilación y `cargo check`.
- **164 pruebas:** 160 de la interfaz y 4 de Rust.
  - 17 son nuevas: el contraste de los seis colores en los dos temas y la herramienta de apariencia.
- **Capturas en un navegador:**
  - todas las pantallas en oscuro y en claro;
  - los seis colores;
  - una ventana emergente y la bienvenida.

## Sin verificar
- La app instalada en Windows. Poppins y el color al arrancar funcionan en el navegador; en Windows, lo comprueba el uso real.
