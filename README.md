# IBG Auth IAM API

Microservicio destinado a autenticacion, sesiones y autorizacion de IBG.

## Desarrollo local

1. Ejecuta `npm install`.
2. Configura `DB_NAME`, `DB_USER`, `DB_PWD`, `DB_HOST`, `DB_PORT` y las claves JWT en `.env`. Deben apuntar a la base de datos de identidad existente.
3. Ejecuta `npm run dev`.
4. Comprueba `GET http://localhost:9002/api/v1/health`.

El frontend usa IAM para autenticacion mediante `VITE_IAM_API_BASE_URL`:

```env
VITE_IAM_API_BASE_URL=http://localhost:9002
VITE_USE_IAM_AUTH=true
```

Las rutas disponibles bajo `/api/v1/auth` incluyen login, MFA, sesiones, primer acceso, recuperacion de contrasena y Microsoft SSO.

## CORS en desarrollo

El frontend se ejecuta en el puerto `8080`. Configura `CORS_ORIGIN` con una lista separada por comas de los orígenes autorizados, por ejemplo:

```env
CORS_ORIGIN=http://localhost:8080,http://127.0.0.1:8080,http://[::1]:8080
```
