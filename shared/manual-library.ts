export interface ManualTopic {
  id: string; title: string; keywords: string; restricted: boolean; updatedAt: string; status: string;
  documents: { kind: "manual" | "guia-rapida"; pages: number }[];
}

export const MANUAL_TOPICS: ManualTopic[] = [
  {
    "id": "01-primeros-pasos",
    "title": "Primeros pasos",
    "keywords": "acceso usuario navegación",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 2
      },
      {
        "kind": "manual",
        "pages": 12
      }
    ]
  },
  {
    "id": "02-recepcion",
    "title": "Recepción",
    "keywords": "reservas planning ingreso check-in check-out folio",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 27
      }
    ]
  },
  {
    "id": "03-caja",
    "title": "Caja y cierre de turno",
    "keywords": "cobros arqueo dinero turno",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 19
      }
    ]
  },
  {
    "id": "04-administracion",
    "title": "Administración y Cuentas Corrientes",
    "keywords": "cuentas corrientes comprobantes retenciones proveedores",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 20
      }
    ]
  },
  {
    "id": "05-grupos",
    "title": "Grupos",
    "keywords": "bloques habitaciones anticipos maestro",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 16
      }
    ]
  },
  {
    "id": "06-comercial",
    "title": "Comercial y distribución",
    "keywords": "empresas agencias tarifas paquetes presupuestos canales",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 14
      }
    ]
  },
  {
    "id": "07-restaurante",
    "title": "Restaurante",
    "keywords": "mesas comandas cocina consumos",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 20
      }
    ]
  },
  {
    "id": "08-spa",
    "title": "SPA",
    "keywords": "turnos circuitos gabinetes tratamientos insumos",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 18
      }
    ]
  },
  {
    "id": "09-vouchers",
    "title": "Vouchers regalo",
    "keywords": "regalo canje beneficios",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 12
      }
    ]
  },
  {
    "id": "10-housekeeping",
    "title": "Housekeeping",
    "keywords": "limpieza mucamas camaje inspección",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 24
      }
    ]
  },
  {
    "id": "11-mantenimiento",
    "title": "Mantenimiento",
    "keywords": "órdenes averías bloqueos preventivo",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 18
      }
    ]
  },
  {
    "id": "12-compras-inventario",
    "title": "Compras e Inventario",
    "keywords": "artículos stock remitos depósito compras recetas",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 28
      }
    ]
  },
  {
    "id": "13-eventos",
    "title": "Eventos",
    "keywords": "salones presupuesto servicios",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 20
      }
    ]
  },
  {
    "id": "14-hospitalidad",
    "title": "Hospitalidad y Comunicación",
    "keywords": "preferencias MARA comunicación encuestas reseñas",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 20
      }
    ]
  },
  {
    "id": "15-gerencia",
    "title": "Gerencia e Informes",
    "keywords": "dashboard informes indicadores revenue",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 24
      }
    ]
  },
  {
    "id": "16-procesos-entre-areas",
    "title": "Procesos entre áreas",
    "keywords": "coordinación traspasos responsables",
    "restricted": false,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 18
      }
    ]
  },
  {
    "id": "17-configuracion",
    "title": "Configuración y permisos",
    "keywords": "usuarios roles permisos parámetros catálogos",
    "restricted": true,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 24
      }
    ]
  },
  {
    "id": "18-tecnica",
    "title": "Técnica y contingencias",
    "keywords": "soporte contingencias respaldos infraestructura",
    "restricted": true,
    "updatedAt": "2026-10-29",
    "status": "Borrador en revisión",
    "documents": [
      {
        "kind": "guia-rapida",
        "pages": 3
      },
      {
        "kind": "manual",
        "pages": 18
      }
    ]
  }
];
