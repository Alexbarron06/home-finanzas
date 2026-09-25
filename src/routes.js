export const routes = [
 ['Inicio', 'inicio', '⌂'],
 ['Movimientos', 'movimientos', '↗'],
 ['Pagos', 'pagos', '▦'],
 ['Comprar', 'comprar', '▱'],
 ['Inventario', 'inventario', '▤'],
 ['Resumen', 'resumen', '◷'],
 ['Configuración', 'configuracion', '⚙'],
];

export const hrefForPage = page => `#/${routes.find(([name]) => name === page)?.[1] || 'inicio'}`;
export const pageFromHash = hash => routes.find(([, slug]) => hash === `#/${slug}`)?.[0] || 'Inicio';
