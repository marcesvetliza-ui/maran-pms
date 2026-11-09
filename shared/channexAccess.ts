export const CHANNEX_CAPABILITIES = {
  read: 'Consultar reservas recibidas',
  bookings: 'Gestionar y reintentar reservas recibidas',
  status: 'Consultar estado y sincronizaciones',
  sync: 'Ejecutar y reintentar sincronizaciones',
  config: 'Configurar conexiones, credenciales y mapeos',
} as const;
export type ChannexCapability = keyof typeof CHANNEX_CAPABILITIES;
export const CHANNEX_ROLE_DEFAULTS = {
  read: ['admin', 'manager', 'jefe_recepcion', 'comercial', 'reception'],
  bookings: ['admin', 'manager', 'jefe_recepcion', 'comercial'],
  status: ['admin', 'manager', 'jefe_recepcion', 'comercial'],
  sync: ['admin', 'manager', 'jefe_recepcion', 'comercial'],
  config: ['admin', 'manager', 'jefe_recepcion', 'comercial'],
} as const;
