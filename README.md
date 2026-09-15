# Gestión de ganadores — despliegue interno

Esta versión carga automáticamente los 85 ganadores al iniciar por primera vez. No requiere cargar Excel desde la pantalla.

## Acceso

- Cualquier DNI de 8 o 9 dígitos puede iniciar como **gestor**.
- Los DNI en `data/supervisors.json` ingresan como **supervisor** y pueden exportar el archivo PRIX.
- El acceso por DNI es una identificación básica. Úselo solamente dentro de la red corporativa. Para exposición fuera de la red se debe agregar contraseña, SSO o VPN.

## Arranque en 192.168.1.67

1. Copie esta carpeta al servidor.
2. Cree un archivo `.env` desde `.env.example` y reemplace ambas claves por valores largos y únicos.
3. Desde esta carpeta ejecute:

   ```bash
   docker compose up -d --build
   ```

4. Abra `http://192.168.1.67:4008`.

La información queda persistida en el volumen Docker `contacto_postgres`. Para detener los servicios sin borrar los datos use `docker compose down`.

## Campos y flujo

El gestor busca por DNI, valida nombre, teléfono y correo, registra provincia, distrito y tienda, y agrega hasta tres intentos. El supervisor descarga un `.xlsx` compatible con la plantilla PRIX - DD.
