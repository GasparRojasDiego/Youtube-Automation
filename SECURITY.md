# Seguridad de ATRIL

## Cómo reportar un problema

Escribe a **gr.diegofz17@gmail.com** o usa *Security → Report a vulnerability* en
este repositorio (aviso privado). No abras un issue público con detalles de un fallo.

## Qué protege ATRIL

- **Claves y cuentas**: viven solo en el Administrador de credenciales de Windows
  del equipo del usuario. Nunca están en este repositorio, en la web ni en el
  instalador, y nunca viajan en direcciones (URL): van en cabeceras.
- **Registros e informes**: todo texto que se guarda o se copia pasa por un filtro
  que oculta claves, tokens y cabeceras de autorización.
- **App**: política de contenido estricta (sin scripts externos) y prototipos
  congelados en la ventana.
- **Actualizaciones**: el instalador se descarga desde las versiones oficiales de
  este repositorio y se comprueba su huella SHA-256 antes de ejecutarlo.
- **Compilación**: se hace en GitHub Actions con permisos mínimos; ffmpeg se
  verifica con su suma de comprobación y cada versión publica `SHA256SUMS.txt`
  y un certificado de procedencia (Sigstore).

## Comprobar una descarga

```powershell
Get-FileHash .\ATRIL_x.y.z_instalador_x64.exe -Algorithm SHA256
gh attestation verify .\ATRIL_x.y.z_instalador_x64.exe --repo GasparRojasDiego/Youtube-Automation
```

La huella debe coincidir con la de `SHA256SUMS.txt` de la misma versión.
