# Procedimiento de Rollback — Maran PMS

## Cuándo usar este procedimiento

Si maranpms.com.ar presenta fallas críticas (caída total, errores de base de datos, datos corruptos), podés reactivar el sistema en Replit en menos de 5 minutos.

---

## Opción A — Rollback rápido a Replit (recomendado en emergencia)

### Paso 1: Reactivar el servidor Replit
1. Ir a https://replit.com y abrir el proyecto **maran-pms**
2. Hacer clic en **Run** (botón verde) para iniciar el servidor
3. El sistema queda disponible en: `https://pro--marcesvetliza.replit.app`

### Paso 2: Redirigir el dominio
En Cloudflare (cloudflare.com → maranpms.com.ar → DNS):
1. Editar el registro CNAME de `@` (o A record)
2. Cambiar el destino de `maran-pms-production.up.railway.app` a `pro--marcesvetliza.replit.app`
3. Asegurarse que el proxy (nube naranja) esté activo
4. La propagación tarda 1–5 minutos

El tráfico vuelve a Replit sin que los usuarios noten el cambio de URL.

---

## Opción B — Revertir el código en Railway (si el problema es de código)

Si el problema es un deploy roto pero la base de datos Railway está bien:

1. Ir a https://railway.app → proyecto maran-pms → servicio
2. En la pestaña **Deployments**, hacer clic en el último deploy que funcionaba
3. Clic en **Redeploy** sobre ese deploy anterior
4. Railway vuelve a la versión anterior en ~2 minutos

---

## Bases de datos

| Entorno | URL de conexión |
|---------|----------------|
| Railway (producción) | `postgresql://postgres:****@autorack.proxy.rlwy.net:42521/railway` |
| Replit (desarrollo) | Accesible vía panel de Replit → Database |

### Restaurar backup manual
Si necesitás restaurar datos desde un backup `.sql`:
```bash
psql "$DATABASE_URL" -f backup-FECHA.sql
```

---

## Contactos y accesos

| Recurso | URL |
|---------|-----|
| Railway dashboard | https://railway.app |
| Cloudflare DNS | https://cloudflare.com |
| GitHub repo | https://github.com/marcesvetliza-ui/maran-pms |
| App producción | https://maranpms.com.ar |
| App Railway directa | https://maran-pms-production.up.railway.app |
| App Replit (backup) | https://pro--marcesvetliza.replit.app |

---

## Checklist post-rollback

- [ ] Verificar login con la cuenta admin configurada
- [ ] Verificar que el Planning muestra habitaciones
- [ ] Verificar que las reservas cargan
- [ ] Notificar al equipo del cambio temporal
- [ ] Diagnosticar y corregir el problema en Railway
- [ ] Volver a apuntar el DNS a Railway una vez resuelto
