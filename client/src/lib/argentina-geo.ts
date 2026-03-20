export const PROVINCIAS_CIUDADES: Record<string, string[]> = {
  "Buenos Aires": [
    "La Plata", "Mar del Plata", "Bahía Blanca", "Quilmes", "Lanús", "General San Martín",
    "Tres de Febrero", "Lomas de Zamora", "Morón", "Tigre", "San Isidro", "Vicente López",
    "Almirante Brown", "Berazategui", "Esteban Echeverría", "Florencio Varela", "Malvinas Argentinas",
    "José C. Paz", "San Miguel", "Moreno", "Merlo", "La Matanza", "Avellaneda", "Tandil",
    "Junín", "Pergamino", "Olavarría", "Necochea", "Zárate", "Luján", "Campana",
    "San Nicolás de los Arroyos", "Azul", "Chivilcoy", "Pilar", "San Fernando",
    "Pinamar", "Villa Gesell", "Miramar", "Monte Hermoso", "Coronel Suárez",
  ],
  "Ciudad Autónoma de Buenos Aires": [
    "Buenos Aires",
  ],
  "Catamarca": [
    "San Fernando del Valle de Catamarca", "Andalgalá", "Belén", "Santa María", "Tinogasta",
    "Recreo", "Frías", "Chumbicha", "La Rioja",
  ],
  "Chaco": [
    "Resistencia", "Barranqueras", "Fontana", "Villa Ángela", "Presidencia Roque Sáenz Peña",
    "Quitilipi", "General José de San Martín", "Charata", "Las Breñas",
  ],
  "Chubut": [
    "Rawson", "Comodoro Rivadavia", "Trelew", "Puerto Madryn", "Esquel", "Río Gallegos",
    "Gaiman", "Dolavon",
  ],
  "Córdoba": [
    "Córdoba", "Villa María", "San Francisco", "Río Cuarto", "Bell Ville", "Alta Gracia",
    "Villa Carlos Paz", "Jesús María", "Cosquín", "La Falda", "Cruz del Eje",
    "Laboulaye", "Marcos Juárez", "Dean Funes", "Villa Dolores",
  ],
  "Corrientes": [
    "Corrientes", "Goya", "Mercedes", "Curuzú Cuatiá", "Paso de los Libres",
    "Santo Tomé", "Bella Vista", "Esquina", "Mburucuyá",
  ],
  "Entre Ríos": [
    "Paraná", "Concordia", "Gualeguaychú", "Concepción del Uruguay", "Gualeguay",
    "Colón", "Victoria", "La Paz", "Villaguay", "Federación", "San José",
    "Crespo", "Basavilbaso", "Diamante", "Chajarí",
  ],
  "Formosa": [
    "Formosa", "Clorinda", "Pirané", "El Colorado", "General Lucio Victorio Mansilla",
  ],
  "Jujuy": [
    "San Salvador de Jujuy", "Palpalá", "San Pedro de Jujuy", "Libertador General San Martín",
    "Humahuaca", "Tilcara", "Perico",
  ],
  "La Pampa": [
    "Santa Rosa", "General Pico", "Toay", "Guatraché", "Eduardo Castex",
    "General Acha", "Realicó", "Victorica",
  ],
  "La Rioja": [
    "La Rioja", "Chilecito", "Aimogasta", "Chamical", "Villa Unión",
    "Chepes", "Vinchina",
  ],
  "Mendoza": [
    "Mendoza", "San Rafael", "Godoy Cruz", "Las Heras", "Luján de Cuyo",
    "Maipú", "Rivadavia", "Guaymallén", "Junín", "Tunuyán", "General Alvear",
    "Malargüe",
  ],
  "Misiones": [
    "Posadas", "Oberá", "Eldorado", "Puerto Iguazú", "Apóstoles", "Jardín América",
    "Leandro N. Alem", "Montecarlo", "Puerto Rico", "Wanda",
  ],
  "Neuquén": [
    "Neuquén", "San Martín de los Andes", "Villa La Angostura", "Junín de los Andes",
    "Cutral Có", "Plaza Huincul", "Zapala", "Chos Malal",
  ],
  "Río Negro": [
    "Viedma", "Bariloche", "Cipolletti", "General Roca", "Allen", "Villa Regina",
    "Cinco Saltos", "El Bolsón", "Roca",
  ],
  "Salta": [
    "Salta", "San Ramón de la Nueva Orán", "Tartagal", "Metán", "Rosario de la Frontera",
    "General Güemes", "Cafayate", "Cachi", "Molinos",
  ],
  "San Juan": [
    "San Juan", "Rawson", "Rivadavia", "Santa Lucía", "Pocito",
    "Caucete", "Albardón", "Valle Fértil", "Jáchal",
  ],
  "San Luis": [
    "San Luis", "Villa Mercedes", "Merlo", "Quines", "Justo Daract",
    "Río Cuarto", "Arizona",
  ],
  "Santa Cruz": [
    "Río Gallegos", "Caleta Olivia", "Pico Truncado", "Las Heras", "Puerto Deseado",
    "El Calafate", "El Chaltén", "Puerto San Julián",
  ],
  "Santa Fe": [
    "Santa Fe", "Rosario", "Rafaela", "Venado Tuerto", "Villa Constitución",
    "San Lorenzo", "Reconquista", "Esperanza", "Santo Tomé", "Cañada de Gómez",
    "Firmat", "Casilda", "Galvez", "Sastre",
  ],
  "Santiago del Estero": [
    "Santiago del Estero", "La Banda", "Termas de Río Hondo", "Añatuya",
    "Frías", "Suncho Corral", "Loreto",
  ],
  "Tierra del Fuego": [
    "Ushuaia", "Río Grande", "Tolhuin",
  ],
  "Tucumán": [
    "San Miguel de Tucumán", "Concepción", "Banda del Río Salí", "Aguilares",
    "Alderetes", "Tafí Viejo", "Yerba Buena", "Famailla", "Monteros",
  ],
};

export const PROVINCIAS = Object.keys(PROVINCIAS_CIUDADES).sort();

export function getCiudades(provincia: string): string[] {
  return PROVINCIAS_CIUDADES[provincia] || [];
}
