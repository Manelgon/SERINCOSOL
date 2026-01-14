# SERINCOSOL PANEL

Panel de gestión para comunidades con control de incidencias, morosidad y fichaje de empleados.

## 🚀 Características

- **Dashboard**: Vista general con métricas y gráficos
- **Comunidades**: Gestión completa de comunidades
- **Incidencias**: Sistema de tickets con adjuntos
- **Morosidad**: Control de deudas y pagos
- **Fichaje**: Control horario con timer en vivo
- **Actividad**: Logs de acciones (solo admin)
- **Perfiles**: Gestión de usuarios (solo admin)

## 🛠️ Tecnologías

- **Framework**: Next.js 16 (App Router)
- **Base de datos**: Supabase (PostgreSQL + Auth + Storage)
- **Estilos**: Tailwind CSS 4
- **UI**: Lucide Icons, React Hot Toast
- **Gráficos**: Recharts
- **Hosting**: Vercel

## 📦 Instalación Local

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Edita .env.local con tus credenciales de Supabase

# Ejecutar en desarrollo
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## 🗄️ Base de Datos

Ejecutar las migraciones en Supabase SQL Editor (en orden):

1. `supabase/migrations/20240113_create_storage_bucket.sql`
2. `supabase/migrations/20240113_allow_all_read_profiles.sql`
3. `supabase/migrations/20240113_link_incidencias_profiles.sql`
4. `supabase/migrations/20240113_add_adjuntos_to_incidencias.sql`
5. `supabase/migrations/20240113_fix_rls_recursion.sql`
6. `supabase/migrations/20240114_time_tracking.sql`

## 🌐 Deploy a Vercel

Ver [DEPLOYMENT.md](./DEPLOYMENT.md) para instrucciones detalladas.

Resumen rápido:
1. Push a GitHub
2. Importar en Vercel
3. Configurar variables de entorno
4. Deploy automático ✨

## 🔐 Roles y Permisos

- **Admin**: Acceso total, gestión de usuarios
- **Gestor**: Gestión de incidencias y morosidad
- **Empleado**: Visualización y fichaje propio

## 📄 Licencia

Privado - SERINCOSOL © 2026
