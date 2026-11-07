export const CHANNEX_CAPABILITIES = {
 read:'Consultar Canales OTAs y su estado',
 config:'Configurar conexiones, credenciales y mapeos',
 bookings:'Gestionar y reintentar reservas recibidas',
 sync:'Ejecutar y reintentar sincronizaciones',
} as const;
export type ChannexCapability=keyof typeof CHANNEX_CAPABILITIES;
